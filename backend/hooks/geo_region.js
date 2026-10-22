// GeoID is a Windows identifier, never calculated from an ISO code.
function installGeoRegion() {
  const geo = CONFIG.geoRegion.geoId;
  const info = new NativeFunction(address('kernel32.dll', 'GetGeoInfoW'), 'int', ['int', 'int', 'pointer', 'int', 'uint16']);
  const buffer = Memory.alloc(64);
  // GEO_ISO2=4. Reject unknown IDs instead of returning an inconsistent GeoName.
  if (!info(geo, 4, buffer, 32, 0)) throw new Error('Windows 无法识别用户 GeoID: ' + geo);
  let name = buffer.readUtf16String();
  if (name === 'XX') {
    if (!info(geo, 12, buffer, 32, 0)) throw new Error('该 GeoID 没有可用的 GeoName');
    name = buffer.readUtf16String(); // GEO_UN_NUMBER
  }
  if (!name) throw new Error('用户 GeoName 为空');
  attachWin32('GetUserGeoID', {
    onEnter(args) { this.nation = args[0].toInt32() === 16; },
    onLeave(result) { if (this.nation) { const old = result.toInt32(); result.replace(geo); record('GetUserGeoID', old, geo); } }
  });
  attachWin32('GetUserDefaultGeoName', {
    onEnter(args) { this.output = args[0]; this.capacity = args[1].toInt32(); },
    onLeave(result) {
      const output = this.output, capacity = this.capacity, needed = name.length + 1;
      if (capacity < 0 || (capacity > 0 && output.isNull())) { this.lastError = 87; result.replace(0); return; }
      if (capacity > 0 && capacity < needed) { this.lastError = 122; result.replace(0); record('GetUserDefaultGeoName', null, name, 122); return; }
      if (capacity > 0) output.writeUtf16String(name);
      result.replace(needed); record('GetUserDefaultGeoName', null, name);
    }
  });
  // GetGeoInfo(W/A/Ex) are explicit lookups. Windows already maps the virtual
  // ID/name correctly; rewriting a different requested country would be wrong.
  retained.push(info);
}
