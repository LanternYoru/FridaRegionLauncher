// All state is isolate-local; Frida serializes JS callbacks across native threads.
// No registry write/create API is used anywhere in this module.
function installDeviceRegion() {
  const target = 'hklm\\software\\microsoft\\windows\\currentversion\\control panel\\deviceregion';
  const handles = new Map();
  const virtualHandles = new Set();
  const readingOriginal = new Set();
  const norm = value => value.toLowerCase().replace(/\\+$/g, '');
  const text = (value, unicode) => value.isNull() ? '' : unicode ? value.readUtf16String() : value.readAnsiString();
  function readOriginal(fn) {
    const thread = Process.getCurrentThreadId(); readingOriginal.add(thread);
    try { return fn(); } finally { readingOriginal.delete(thread); }
  }
  const ntQuery = new NativeFunction(address('ntdll.dll', 'NtQueryKey'), 'int', ['pointer', 'int', 'pointer', 'uint', 'pointer']);
  const createEvent = new NativeFunction(address('kernel32.dll', 'CreateEventW'), 'pointer', ['pointer', 'int', 'int', 'pointer']);
  const closeHandle = new NativeFunction(address('kernel32.dll', 'CloseHandle'), 'int', ['pointer']);
  function keyPath(handle) {
    if (handle.toUInt32() === 0x80000002) return 'hklm';
    const cached = handles.get(handle.toString());
    if (cached && virtualHandles.has(handle.toString())) return cached;
    // Resolve handles opened by other native registry paths without broad matching.
    const size = Memory.alloc(4);
    ntQuery(handle, 3, ptr(0), 0, size);
    const length = size.readU32();
    if (length < 4 || length > 65536) return '';
    const buffer = Memory.alloc(length);
    if (ntQuery(handle, 3, buffer, length, size) !== 0) return '';
    return norm(buffer.add(4).readUtf16String(buffer.readU32() / 2)).replace(/^\\registry\\machine(?=\\|$)/, 'hklm').replace(/^hklm\\software\\wow6432node\\/, 'hklm\\software\\');
  }
  function pathFor(handle, sub) {
    const base = keyPath(handle);
    return base ? norm(base + (sub ? '\\' + sub : '')) : '';
  }
  function matches(handle, sub, value) { return norm(value) === 'deviceregion' && pathFor(handle, sub) === target; }
  function writeDword(type, data, size, flags = 0) {
    if (!data.isNull() && size.isNull()) return 87;
    const capacity = size.isNull() ? 0 : size.readU32();
    let status = 0;
    if ((flags & 0x30000) === 0x30000) status = 87;
    else if ((flags & 0xffff) !== 0 && !(flags & 0x10)) status = 1630;
    else if (!data.isNull() && capacity < 4) status = 234;
    if (status !== 87) {
      if (!type.isNull()) type.writeU32(4);
      if (!size.isNull()) size.writeU32(4);
    }
    if (status === 0 && !data.isNull()) data.writeU32(CONFIG.deviceRegion.geoId);
    else if (status && (flags & 0x20000000) && !data.isNull() && capacity) {
      const zeros = new Uint8Array(Math.min(capacity, 4096));
      for (let offset = 0; offset < capacity; offset += zeros.length) data.add(offset).writeByteArray(zeros.subarray(0, Math.min(zeros.length, capacity - offset)));
    }
    return status;
  }
  for (const suffix of ['W', 'A']) {
   const str = value => text(value, suffix === 'W');
   function finishOpen(result, path, options, access, output) {
      if ((result === 2 || result === 3) && path === target && !output.isNull() && options === 0 && (access & 0x300) !== 0x300 && !(access & 0x6)) {
        const event = createEvent(ptr(0), 0, 0, ptr(0));
        if (!event.isNull()) { output.writePointer(event); virtualHandles.add(event.toString()); handles.set(event.toString(), path); result = 0; }
      }
      return result;
   }
   replace('advapi32.dll', 'RegOpenKeyEx' + suffix, 'int', ['pointer', 'pointer', 'uint', 'uint', 'pointer'], original =>
    (key, sub, options, access, output) => {
      if (readingOriginal.has(Process.getCurrentThreadId())) return original(key, sub, options, access, output);
      const path = pathFor(key, str(sub));
      const result = original(key, sub, options, access, output);
      // Missing keys on older Windows: expose a process-local read-only virtual key.
      // Event handles are unique kernel handles, never fabricated numeric HKEYs.
      return finishOpen(result, path, options, access, output);
    });
   replace('advapi32.dll', 'RegOpenKey' + suffix, 'int', ['pointer', 'pointer', 'pointer'], original =>
    (key, sub, output) => {
      if (readingOriginal.has(Process.getCurrentThreadId())) return original(key, sub, output);
      return finishOpen(original(key, sub, output), pathFor(key, str(sub)), 0, 1, output);
    });
  }
  replace('advapi32.dll', 'RegCloseKey', 'int', ['pointer'], original => key => {
    const id = key.toString();
    const result = virtualHandles.has(id) ? (closeHandle(key) ? 0 : 6) : original(key);
    if (result === 0) { handles.delete(id); virtualHandles.delete(id); }
    return result;
  });
  for (const suffix of ['W', 'A']) {
   const str = value => text(value, suffix === 'W');
   replace('advapi32.dll', 'RegQueryValueEx' + suffix, 'int', ['pointer', 'pointer', 'pointer', 'pointer', 'pointer', 'pointer'], original =>
    (key, value, reserved, type, data, size) => {
      if (readingOriginal.has(Process.getCurrentThreadId())) return original(key, value, reserved, type, data, size);
      if (!matches(key, '', str(value))) return virtualHandles.has(key.toString()) ? 2 : original(key, value, reserved, type, data, size);
      if (!reserved.isNull()) return 87;
      const oldType = Memory.alloc(4), oldData = Memory.alloc(4), oldSize = Memory.alloc(4); oldSize.writeU32(4);
      const oldStatus = virtualHandles.has(key.toString()) ? 2 : readOriginal(() => original(key, value, ptr(0), oldType, oldData, oldSize));
      // Access-denied and invalid-handle failures must not be transformed into success.
      if (![0, 2, 234].includes(oldStatus)) return oldStatus;
      const result = writeDword(type, data, size);
      record('RegQueryValueEx' + suffix, oldStatus === 0 && oldType.readU32() === 4 ? oldData.readU32() : { status: oldStatus }, CONFIG.deviceRegion.geoId, result);
      return result;
    });
   replace('advapi32.dll', 'RegGetValue' + suffix, 'int', ['pointer', 'pointer', 'pointer', 'uint', 'pointer', 'pointer', 'pointer'], original =>
    (key, sub, value, flags, type, data, size) => {
      if (readingOriginal.has(Process.getCurrentThreadId())) return original(key, sub, value, flags, type, data, size);
      if (!matches(key, str(sub), str(value))) return virtualHandles.has(key.toString()) ? 2 : original(key, sub, value, flags, type, data, size);
      const oldType = Memory.alloc(4), oldData = Memory.alloc(4), oldSize = Memory.alloc(4); oldSize.writeU32(4);
      const oldStatus = virtualHandles.has(key.toString()) ? 2 : readOriginal(() => original(key, sub, value, (flags & 0x30000) | 0xffff, oldType, oldData, oldSize));
      if (![0, 2, 3, 234].includes(oldStatus)) return oldStatus;
      const result = writeDword(type, data, size, flags);
      record('RegGetValue' + suffix, oldStatus === 0 && oldType.readU32() === 4 ? oldData.readU32() : { status: oldStatus }, CONFIG.deviceRegion.geoId, result);
      return result;
    });
  }
}
