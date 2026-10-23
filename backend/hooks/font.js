function installFont() {
  const config = CONFIG.font;
  // Console applications may not have loaded GDI yet.
  const gdi = Module.load('gdi32.dll');
  if (config.path) {
    const path = Memory.allocUtf16String(config.path);
    retained.push(path);
    const add = new NativeFunction(gdi.getExportByName('AddFontResourceExW'), 'int', ['pointer', 'uint', 'pointer']);
    const remove = new NativeFunction(gdi.getExportByName('RemoveFontResourceExW'), 'int', ['pointer', 'uint', 'pointer']);
    const count = add(path, 0x10, ptr(0)); // FR_PRIVATE: never install globally.
    if (!count) throw new Error('私有字体加载失败：' + config.path);
    let loaded = true;
    cleanups.push(() => {
      if (!loaded) return;
      if (!remove(path, 0x10, ptr(0))) throw new Error('私有字体卸载失败；将于目标进程退出时释放');
      loaded = false;
      send({ kind: 'font_resource', text: '私有字体已卸载：' + config.path });
    });
    send({ kind: 'font_resource', text: '私有字体已加载（仅当前进程）：' + config.path + '，字体数 ' + count });
  }
  if (!config.family) return; // Loading a font does not imply replacing every font.
  const family = Memory.allocUtf16String(config.family);
  retained.push(family);
  const decode = new NativeFunction(address('kernel32.dll', 'MultiByteToWideChar'), 'int', ['uint', 'uint', 'pointer', 'int', 'pointer', 'int']);
  function readName(pointer, wide) {
    if (pointer.isNull()) return '';
    if (wide) return pointer.readUtf16String(32).split('\0')[0];
    // LOGFONTA has a fixed 32-byte field. Never read past it.
    const bytes = new Uint8Array(pointer.readByteArray(32));
    const length = bytes.indexOf(0);
    const buffer = Memory.alloc(66);
    const count = decode(CONFIG.encoding && CONFIG.encoding.enabled ? CONFIG.encoding.ansi : 0, 0, pointer, length < 0 ? 32 : length, buffer, 32);
    return count > 0 ? buffer.readUtf16String(count) : '';
  }
  function matches(name) { return !config.source || name.toLowerCase() === config.source.toLowerCase(); }
  function change(logfont) {
    logfont.add(28).writeByteArray(new Uint8Array(64));
    logfont.add(28).writeUtf16String(config.family);
    if (config.charset !== -1) logfont.add(23).writeU8(config.charset);
  }
  for (const name of ['CreateFontIndirectW', 'CreateFontIndirectExW']) {
    retained.push(Interceptor.attach(gdi.getExportByName(name), {
      onEnter(args) {
        if (args[0].isNull()) return;
        this.original = readName(args[0].add(28), true);
        if (!matches(this.original)) return;
        const size = name.endsWith('ExW') ? 420 : 92;
        this.copy = Memory.alloc(size);
        Memory.copy(this.copy, args[0], size);
        change(this.copy);
        // Extended full/style/script names must not refer to the previous family.
        if (size === 420) this.copy.add(92).writeByteArray(new Uint8Array(256));
        args[0] = this.copy;
      },
      onLeave(result) { if (this.copy) record(name, this.original, config.family, result.isNull() ? 0 : 1); }
    }));
    installed.push(name);
  }
  // Route ANSI font requests to Unicode to support family names that cannot be
  // represented in the host ACP, without modifying caller-owned structures.
  for (const name of ['CreateFontIndirectA', 'CreateFontIndirectExA']) {
    const extended = name.endsWith('ExA');
    const createW = new NativeFunction(gdi.getExportByName(extended ? 'CreateFontIndirectExW' : 'CreateFontIndirectW'), 'pointer', ['pointer']);
    replace('gdi32.dll', name, 'pointer', ['pointer'], original => function(input) {
      if (input.isNull()) return original(input);
      const old = readName(input.add(28), false);
      if (!matches(old)) return original(input);
      const copy = Memory.alloc(extended ? 420 : 92);
      Memory.copy(copy, input, 28);
      change(copy);
      if (extended) Memory.copy(copy.add(348), input.add(188), 72);
      const result = createW(copy);
      record(name, old, config.family, result.isNull() ? 0 : 1);
      return result;
    });
  }
  const signature = [...Array(5).fill('int'), ...Array(8).fill('uint'), 'pointer'];
  const createW = new NativeFunction(gdi.getExportByName('CreateFontW'), 'pointer', signature);
  // CreateFont face strings are null terminated, not fixed-size LOGFONT arrays.
  function directName(pointer, wide) {
    if (pointer.isNull()) return '';
    if (wide) return pointer.readUtf16String();
    const count = decode(CONFIG.encoding && CONFIG.encoding.enabled ? CONFIG.encoding.ansi : 0, 0, pointer, -1, ptr(0), 0);
    if (count <= 0) return '';
    const buffer = Memory.alloc(count * 2);
    decode(CONFIG.encoding && CONFIG.encoding.enabled ? CONFIG.encoding.ansi : 0, 0, pointer, -1, buffer, count);
    return buffer.readUtf16String();
  }
  retained.push(Interceptor.attach(gdi.getExportByName('CreateFontW'), {
    onEnter(args) {
      this.original = directName(args[13], true);
      this.changed = matches(this.original);
      if (this.changed) { args[13] = family; if (config.charset !== -1) args[8] = ptr(config.charset); }
    },
    onLeave(result) { if (this.changed) record('CreateFontW', this.original, config.family, result.isNull() ? 0 : 1); }
  }));
  installed.push('CreateFontW');
  replace('gdi32.dll', 'CreateFontA', 'pointer', signature, original => function(...args) {
    const old = directName(args[13], false);
    if (!matches(old)) return original(...args);
    args[13] = family;
    if (config.charset !== -1) args[8] = config.charset;
    const result = createW(...args);
    record('CreateFontA', old, config.family, result.isNull() ? 0 : 1);
    return result;
  });
}
