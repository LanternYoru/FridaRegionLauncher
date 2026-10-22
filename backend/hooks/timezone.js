// Fixed Tokyo UTC+09 profile. DST zones require a separate rule-aware module.
function installTimezone() {
  if (CONFIG.timezone.key !== 'Tokyo Standard Time') throw new Error('Unsupported time zone');
  const offset = 540, ticks = uint64('324000000000');
  function fill(output, dynamic) {
    output.writeByteArray(new Uint8Array(dynamic ? 432 : 172));
    output.writeS32(-offset);
    output.add(4).writeUtf16String('Tokyo Standard Time');
    output.add(88).writeUtf16String('Tokyo Daylight Time');
    if (dynamic) { output.add(172).writeUtf16String('Tokyo Standard Time'); output.add(428).writeU8(1); }
  }
  for (const [name, dynamic] of [['GetTimeZoneInformation', false], ['GetDynamicTimeZoneInformation', true]]) {
    attachWin32(name, {
      onEnter(args) { this.output = args[0]; },
      onLeave(result) {
        if (this.output.isNull() || result.toUInt32() === 0xffffffff) return;
        const old = this.output.readS32(); fill(this.output, dynamic); result.replace(0); record(name, old, -offset);
      }
    });
  }
  attachWin32('GetTimeZoneInformationForYear', {
    onEnter(args) { this.current = args[1].isNull(); this.output = args[2]; },
    onLeave(result) {
      if (!this.current || this.output.isNull() || result.toInt32() === 0) return;
      const old = this.output.readS32(); fill(this.output, false); result.replace(1); record('GetTimeZoneInformationForYear', old, -offset);
    }
  });
  const getUtc = new NativeFunction(address('kernel32.dll', 'GetSystemTime'), 'void', ['pointer']);
  attachWin32('GetLocalTime', {
    onEnter(args) { this.output = args[0]; },
    onLeave() {
      if (this.output.isNull()) return;
      const utc = Memory.alloc(16); getUtc(utc);
      const date = new Date(Date.UTC(utc.readU16(), utc.add(2).readU16()-1, utc.add(6).readU16(), utc.add(8).readU16(), utc.add(10).readU16()+offset, utc.add(12).readU16(), utc.add(14).readU16()));
      const values = [date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDay(),date.getUTCDate(),date.getUTCHours(),date.getUTCMinutes(),date.getUTCSeconds(),date.getUTCMilliseconds()];
      values.forEach((value, i) => this.output.add(i*2).writeU16(value));
      record('GetLocalTime', 'system local time', 'UTC+09:00');
    }
  });
  for (const [name, forward] of [['FileTimeToLocalFileTime', true], ['LocalFileTimeToFileTime', false]]) {
    attachWin32(name, {
      onEnter(args) { this.input = args[0].isNull() ? null : args[0].readU64(); this.output = args[1]; },
      onLeave(result) {
        if (!result.toInt32() || this.input === null || this.output.isNull()) return;
        const value = forward ? this.input.add(ticks) : this.input.sub(ticks);
        if ((forward && value.compare(this.input) < 0) || (!forward && this.input.compare(ticks) < 0)) { result.replace(0); this.lastError = 87; return; }
        this.output.writeU64(value); record(name, this.input.toString(), value.toString());
      }
    });
  }
}
