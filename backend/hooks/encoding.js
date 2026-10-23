// Remap only default code-page sentinels. Windows still owns conversion,
// buffer sizing, invalid-input handling, replacement characters and LastError.
function installEncoding() {
  const config = CONFIG.encoding;
  const valid = new NativeFunction(address('kernel32.dll', 'IsValidCodePage'), 'int', ['uint']);
  if (!valid(config.ansi) || !valid(config.oem)) throw new Error('本机不支持所选代码页');
  for (const [name, value] of [['GetACP', config.ansi], ['GetOEMCP', config.oem]]) {
    attachWin32(name, { onLeave(result) { const old = result.toUInt32(); result.replace(value); record(name, old, value); } });
  }
  for (const name of ['MultiByteToWideChar', 'WideCharToMultiByte', 'GetCPInfo', 'GetCPInfoExA', 'GetCPInfoExW', 'IsDBCSLeadByteEx']) {
    attachWin32(name, {
      onEnter(args) {
        this.original = args[0].toUInt32();
        this.value = this.original === 0 || this.original === 3 ? config.ansi : this.original === 1 ? config.oem : null;
        if (this.value !== null) args[0] = ptr(this.value);
      },
      onLeave(result) { if (this.value !== null) record(name, this.original, this.value, result.toInt32()); }
    });
  }
  const lead = new NativeFunction(address('kernel32.dll', 'IsDBCSLeadByteEx'), 'int', ['uint', 'uchar']);
  replace('kernel32.dll', 'IsDBCSLeadByte', 'int', ['uchar'], () => function(byte) {
    const result = lead(config.ansi, byte);
    record('IsDBCSLeadByte', 'default', config.ansi, result);
    return result;
  });
}
