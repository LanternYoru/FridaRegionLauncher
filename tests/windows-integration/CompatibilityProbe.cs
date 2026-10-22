using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
class CompatibilityProbe {
  [DllImport("kernel32.dll")] static extern ushort GetUserDefaultUILanguage();
  [DllImport("kernel32.dll")] static extern ushort GetSystemDefaultUILanguage();
  [DllImport("kernel32.dll")] static extern ushort GetThreadUILanguage();
  [DllImport("kernel32.dll")] static extern ushort GetUserDefaultLangID();
  [DllImport("kernel32.dll")] static extern ushort GetSystemDefaultLangID();
  [DllImport("kernel32.dll")] static extern uint GetUserDefaultLCID();
  [DllImport("kernel32.dll")] static extern uint GetSystemDefaultLCID();
  [DllImport("kernel32.dll")] static extern uint GetThreadLocale();
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern int GetUserDefaultLocaleName(IntPtr data,int capacity);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern int GetLocaleInfoEx(string locale,uint kind,IntPtr data,int capacity);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern int GetLocaleInfoW(uint locale,uint kind,IntPtr data,int capacity);
  [DllImport("kernel32.dll")] static extern bool GetUserPreferredUILanguages(uint flags,out uint count,IntPtr data,ref uint capacity);
  [DllImport("kernel32.dll")] static extern uint GetTimeZoneInformation(IntPtr data);
  [DllImport("kernel32.dll")] static extern uint GetDynamicTimeZoneInformation(IntPtr data);
  [DllImport("kernel32.dll")] static extern bool GetTimeZoneInformationForYear(ushort year,IntPtr zone,IntPtr data);
  [DllImport("kernel32.dll")] static extern void GetLocalTime(IntPtr data);
  [DllImport("kernel32.dll")] static extern void GetSystemTime(IntPtr data);
  [DllImport("advapi32.dll",CharSet=CharSet.Ansi)] static extern int RegGetValueA(IntPtr key,string sub,string name,uint flags,out uint type,IntPtr data,ref uint size);
  [DllImport("advapi32.dll",CharSet=CharSet.Ansi)] static extern int RegOpenKeyA(IntPtr key,string sub,out IntPtr result);
  [DllImport("advapi32.dll",CharSet=CharSet.Ansi)] static extern int RegOpenKeyExA(IntPtr key,string sub,uint options,uint access,out IntPtr result);
  [DllImport("advapi32.dll",CharSet=CharSet.Ansi)] static extern int RegQueryValueExA(IntPtr key,string name,IntPtr reserved,out uint type,IntPtr data,ref uint size);
  [DllImport("advapi32.dll")] static extern int RegCloseKey(IntPtr key);
  [DllImport("kernel32.dll",SetLastError=true,EntryPoint="GetUserPreferredUILanguages")] static extern bool Preferred(uint flags,out uint count,IntPtr data,ref uint capacity);
  [DllImport("kernel32.dll")] static extern bool FileTimeToLocalFileTime(IntPtr input,IntPtr output);
  [DllImport("kernel32.dll")] static extern bool LocalFileTimeToFileTime(IntPtr input,IntPtr output);
  static DateTime ReadTime(IntPtr p) { return new DateTime(Marshal.ReadInt16(p),Marshal.ReadInt16(p,2),Marshal.ReadInt16(p,6),Marshal.ReadInt16(p,8),Marshal.ReadInt16(p,10),Marshal.ReadInt16(p,12)); }
  static void Main() {
    Console.OutputEncoding=new System.Text.UTF8Encoding(false);
    var r=new Dictionary<string,object>();
    r["GetUserDefaultUILanguage"]=GetUserDefaultUILanguage();r["GetSystemDefaultUILanguage"]=GetSystemDefaultUILanguage();r["GetThreadUILanguage"]=GetThreadUILanguage();r["GetUserDefaultLangID"]=GetUserDefaultLangID();r["GetSystemDefaultLangID"]=GetSystemDefaultLangID();r["GetUserDefaultLCID"]=GetUserDefaultLCID();r["GetSystemDefaultLCID"]=GetSystemDefaultLCID();r["GetThreadLocale"]=GetThreadLocale();
    IntPtr p=Marshal.AllocHGlobal(512), utc=Marshal.AllocHGlobal(16);
    try {
      int n=GetUserDefaultLocaleName(p,85);r["GetUserDefaultLocaleName"]=n>0?Marshal.PtrToStringUni(p):null;
      n=GetLocaleInfoEx(null,0x5c,p,85);r["GetLocaleInfoEx(default, SNAME)"]=n>0?Marshal.PtrToStringUni(p):null;
      n=GetLocaleInfoEx("en-US",0x5c,p,85);r["GetLocaleInfoEx(explicit en-US)"]=n>0?Marshal.PtrToStringUni(p):null;
      n=GetLocaleInfoW(0x400,0x5c,p,85);r["GetLocaleInfoW(default, SNAME)"]=n>0?Marshal.PtrToStringUni(p):null;
      uint count,capacity=256;bool ok=GetUserPreferredUILanguages(8,out count,p,ref capacity);r["GetUserPreferredUILanguages"]=ok?Marshal.PtrToStringUni(p):null;
      r["GetTimeZoneInformation.status"]=GetTimeZoneInformation(p);r["GetTimeZoneInformation.bias"]=Marshal.ReadInt32(p);
      r["GetDynamicTimeZoneInformation.status"]=GetDynamicTimeZoneInformation(p);r["GetDynamicTimeZoneInformation.key"]=Marshal.PtrToStringUni(IntPtr.Add(p,172));
      ok=GetTimeZoneInformationForYear(2026,IntPtr.Zero,p);r["GetTimeZoneInformationForYear.bias"]=ok?(object)Marshal.ReadInt32(p):null;
      GetLocalTime(p);GetSystemTime(utc);r["GetLocalTime.offsetMinutes"]=Math.Round((ReadTime(p)-ReadTime(utc)).TotalMinutes);
      uint type,size=4;int status=RegGetValueA(new IntPtr(unchecked((int)0x80000002)),@"SOFTWARE\Microsoft\Windows\CurrentVersion\Control Panel\DeviceRegion","DeviceRegion",0x10,out type,p,ref size);r["RegGetValueA.status"]=status;r["RegGetValueA.DeviceRegion"]=status==0?(object)Marshal.ReadInt32(p):null;
      const string sub=@"SOFTWARE\Microsoft\Windows\CurrentVersion\Control Panel\DeviceRegion";
      IntPtr key;status=RegOpenKeyA(new IntPtr(unchecked((int)0x80000002)),sub,out key);r["RegOpenKeyA.status"]=status;
      if(status==0) {try {size=0;r["RegQueryValueExA.lengthStatus"]=RegQueryValueExA(key,"DeviceRegion",IntPtr.Zero,out type,IntPtr.Zero,ref size);r["RegQueryValueExA.length"]=size;size=2;Marshal.WriteInt32(p,unchecked((int)0xcccccccc));r["RegQueryValueExA.shortStatus"]=RegQueryValueExA(key,"DeviceRegion",IntPtr.Zero,out type,p,ref size);r["RegQueryValueExA.shortLength"]=size;size=4;status=RegQueryValueExA(key,"DeviceRegion",IntPtr.Zero,out type,p,ref size);r["RegQueryValueExA.value"]=status==0?(object)Marshal.ReadInt32(p):null;}finally{RegCloseKey(key);}}
      status=RegOpenKeyExA(new IntPtr(unchecked((int)0x80000002)),sub,0,0x201,out key);r["RegOpenKeyExA.view32.status"]=status;
      if(status==0){try{size=4;status=RegQueryValueExA(key,"DeviceRegion",IntPtr.Zero,out type,p,ref size);r["RegQueryValueExA.view32.value"]=status==0?(object)Marshal.ReadInt32(p):null;}finally{RegCloseKey(key);}}
      capacity=0;ok=Preferred(8,out count,IntPtr.Zero,ref capacity);r["preferred.sizeOnly.ok"]=ok;r["preferred.sizeOnly.size"]=capacity;
      capacity=2;ok=Preferred(8,out count,p,ref capacity);r["preferred.short.ok"]=ok;r["preferred.short.error"]=Marshal.GetLastWin32Error();r["preferred.short.size"]=capacity;
      capacity=7;Marshal.WriteInt16(p,14,1234);ok=Preferred(8,out count,p,ref capacity);r["preferred.exact.ok"]=ok;r["preferred.exact.count"]=count;r["preferred.exact.doubleNull"]=ok?(object)Marshal.ReadInt16(p,12):null;r["preferred.exact.guard"]=Marshal.ReadInt16(p,14);
      capacity=16;ok=Preferred(4,out count,p,ref capacity);r["preferred.id"]=ok?Marshal.PtrToStringUni(p):null;
      capacity=16;ok=Preferred(12,out count,p,ref capacity);r["preferred.invalid.ok"]=ok;r["preferred.invalid.error"]=Marshal.GetLastWin32Error();
      Marshal.WriteInt64(p,133800000000000000L);FileTimeToLocalFileTime(p,utc);r["FileTimeToLocalFileTime.deltaTicks"]=Marshal.ReadInt64(utc)-133800000000000000L;LocalFileTimeToFileTime(utc,p);r["FileTime.roundtrip"]=Marshal.ReadInt64(p);
      for(int i=0;i<512;i++)Marshal.WriteByte(p,i,0xcc);GetDynamicTimeZoneInformation(p);r["timezone.structGuard"]=Marshal.ReadInt32(p,432);
      for(int i=0;i<432;i++)Marshal.WriteByte(p,i,0);Marshal.Copy("UTC\0".ToCharArray(),0,IntPtr.Add(p,172),4);Marshal.WriteByte(p,428,1);
      IntPtr zone=Marshal.AllocHGlobal(172);try{ok=GetTimeZoneInformationForYear(2026,p,zone);r["timezone.explicitUTC.bias"]=ok?(object)Marshal.ReadInt32(zone):null;}finally{Marshal.FreeHGlobal(zone);}
    } finally {Marshal.FreeHGlobal(p);Marshal.FreeHGlobal(utc);}
    Console.WriteLine(new JavaScriptSerializer().Serialize(r));Thread.Sleep(300);
  }
}
