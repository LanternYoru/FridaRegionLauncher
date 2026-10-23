// Read Windows dynamic rules without changing the system timezone or clock.
function installTimezone() {
  const key = CONFIG.timezone.key, dynamic = Memory.alloc(432);
  const location = Process.getModuleByName('kernel32.dll').findExportByName('EnumDynamicTimeZoneInformation') || address('advapi32.dll', 'EnumDynamicTimeZoneInformation');
  const enumerate = new NativeFunction(location, 'uint', ['uint', 'pointer']);
  let found = false;
  for (let index = 0; index < 1024; index++) {
    const status = enumerate(index, dynamic);
    if (status === 259) break;
    if (status !== 0) throw new Error('枚举 Windows 时区失败: ' + status);
    if (dynamic.add(172).readUtf16String() === key) { found = true; break; }
  }
  if (!found) throw new Error('Windows 未安装时区: ' + key);
  dynamic.add(428).writeU8(0);
  const utcNow = new NativeFunction(address('kernel32.dll', 'GetSystemTime'), 'void', ['pointer']);
  const toLocal = new NativeFunction(address('kernel32.dll', 'SystemTimeToTzSpecificLocalTimeEx'), 'int', ['pointer', 'pointer', 'pointer']);
  const toFile = new NativeFunction(address('kernel32.dll', 'SystemTimeToFileTime'), 'int', ['pointer', 'pointer']);
  const forYear = new NativeFunction(address('kernel32.dll', 'GetTimeZoneInformationForYear'), 'int', ['uint16', 'pointer', 'pointer']);
  function current() {
    const utc = Memory.alloc(16), local = Memory.alloc(16), u = Memory.alloc(8), l = Memory.alloc(8), rules = Memory.alloc(172);
    utcNow(utc);
    if (!toLocal(dynamic, utc, local) || !toFile(utc, u) || !toFile(local, l) || !forYear(local.readU16(), dynamic, rules)) throw new Error('Windows 时区规则计算失败');
    const delta = l.readS64().sub(u.readS64()).toNumber(), bias = -delta / 600000000;
    const state = rules.add(70).readU16() === 0 ? 0 : bias === rules.readS32() + rules.add(168).readS32() ? 2 : 1;
    return { rules, local, delta, state };
  }
  for (const [name, isDynamic] of [['GetTimeZoneInformation', false], ['GetDynamicTimeZoneInformation', true]]) {
    attachWin32(name, {
      onEnter(args) { this.output = args[0]; },
      onLeave(result) {
        if (this.output.isNull() || result.toUInt32() === 0xffffffff) return;
        const old = this.output.readS32(), now = current();
        if (isDynamic) Memory.copy(this.output, dynamic, 432);
        Memory.copy(this.output, now.rules, 172);
        result.replace(now.state); record(name, old, now.rules.readS32());
      }
    });
  }
  attachWin32('GetTimeZoneInformationForYear', {
    onEnter(args) { this.changed = args[1].isNull(); if (this.changed) args[1] = dynamic; },
    onLeave(result) { if (this.changed) record('GetTimeZoneInformationForYear', 'system default', key, result.toInt32() ? 0 : this.lastError); }
  });
  for (const name of ['SystemTimeToTzSpecificLocalTimeEx', 'TzSpecificLocalTimeToSystemTimeEx', 'SystemTimeToTzSpecificLocalTime', 'TzSpecificLocalTimeToSystemTime']) {
    attachWin32(name, {
      onEnter(args) {
        this.changed = args[0].isNull();
        if (this.changed) { this.zone = name.endsWith('Ex') ? dynamic : current().rules; args[0] = this.zone; }
      },
      onLeave(result) { if (this.changed) record(name, 'system default', key, result.toInt32() ? 0 : this.lastError); }
    });
  }
  attachWin32('GetLocalTime', {
    onEnter(args) { this.output = args[0]; },
    onLeave() { if (!this.output.isNull()) { Memory.copy(this.output, current().local, 16); record('GetLocalTime', 'system local time', key); } }
  });
  // Legacy FILETIME APIs use the current bias, not the input date's DST.
  for (const [name, forward] of [['FileTimeToLocalFileTime', true], ['LocalFileTimeToFileTime', false]]) {
    attachWin32(name, {
      onEnter(args) { this.input = args[0].isNull() ? null : args[0].readU64(); this.output = args[1]; },
      onLeave(result) {
        if (!result.toInt32() || this.input === null || this.output.isNull()) return;
        const signed = current().delta * (forward ? 1 : -1), ticks = uint64(String(Math.abs(signed)));
        const value = signed >= 0 ? this.input.add(ticks) : this.input.sub(ticks);
        if ((signed >= 0 && value.compare(this.input) < 0) || (signed < 0 && this.input.compare(ticks) < 0)) { result.replace(0); this.lastError = 87; return; }
        this.output.writeU64(value); record(name, this.input.toString(), value.toString());
      }
    });
  }
  retained.push(dynamic, enumerate, utcNow, toLocal, toFile, forYear);
}
