using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
class GeoTimeProbe {
  [DllImport("kernel32.dll",SetLastError=true)] static extern int GetUserGeoID(int kind);
  [DllImport("kernel32.dll",SetLastError=true)] static extern int GetUserDefaultGeoName(IntPtr p,int size);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern int GetGeoInfoW(int geo,int kind,IntPtr p,int size,ushort lang);
  [DllImport("advapi32.dll")] static extern uint EnumDynamicTimeZoneInformation(uint index,IntPtr p);
  [DllImport("kernel32.dll")] static extern uint GetDynamicTimeZoneInformation(IntPtr p);
  [DllImport("kernel32.dll")] static extern uint GetTimeZoneInformation(IntPtr p);
  [DllImport("kernel32.dll")] static extern bool GetTimeZoneInformationForYear(ushort year,IntPtr zone,IntPtr p);
  [DllImport("kernel32.dll")] static extern bool SystemTimeToTzSpecificLocalTimeEx(IntPtr zone,IntPtr utc,IntPtr local);
  [DllImport("kernel32.dll")] static extern bool TzSpecificLocalTimeToSystemTimeEx(IntPtr zone,IntPtr local,IntPtr utc);
  [DllImport("kernel32.dll")] static extern void GetSystemTime(IntPtr p);
  [DllImport("kernel32.dll")] static extern void GetLocalTime(IntPtr p);
  static DateTime Time(IntPtr p) { return new DateTime(Marshal.ReadInt16(p),Marshal.ReadInt16(p,2),Marshal.ReadInt16(p,6),Marshal.ReadInt16(p,8),Marshal.ReadInt16(p,10),Marshal.ReadInt16(p,12)); }
  static void WriteTime(IntPtr p, DateTime d) { short[] parts={(short)d.Year,(short)d.Month,(short)d.DayOfWeek,(short)d.Day,(short)d.Hour,(short)d.Minute,(short)d.Second,0}; Marshal.Copy(parts,0,p,8); }
  static object ConvertTime(IntPtr zone, DateTime value) {
    IntPtr input=Marshal.AllocHGlobal(16), output=Marshal.AllocHGlobal(16), back=Marshal.AllocHGlobal(16);
    try { WriteTime(input,value); if(!SystemTimeToTzSpecificLocalTimeEx(zone,input,output)) throw new Exception("UTC conversion failed");
      bool ok=TzSpecificLocalTimeToSystemTimeEx(zone,output,back);
      return new object[]{(Time(output)-value).TotalMinutes,ok && Time(back)==value};
    } finally {Marshal.FreeHGlobal(input);Marshal.FreeHGlobal(output);Marshal.FreeHGlobal(back);}
  }
  static object Rules(IntPtr zone,ushort year) { IntPtr p=Marshal.AllocHGlobal(172);try { if(!GetTimeZoneInformationForYear(year,zone,p))throw new Exception("Year query failed"); return new int[]{Marshal.ReadInt32(p),Marshal.ReadInt16(p,70),Marshal.ReadInt16(p,138),Marshal.ReadInt32(p,84),Marshal.ReadInt32(p,168)}; }finally{Marshal.FreeHGlobal(p);} }
  static void Main() { try { Run(); } catch(Exception e) { Console.WriteLine(new JavaScriptSerializer().Serialize(new { error=e.ToString() })); } }
  static void Run() {
    Console.OutputEncoding=new System.Text.UTF8Encoding(false);
    var r=new Dictionary<string,object>(); IntPtr p=Marshal.AllocHGlobal(512),zone=Marshal.AllocHGlobal(432),utc=Marshal.AllocHGlobal(16);
    try {
      int geo=GetUserGeoID(16);r["geo.id"]=geo;r["geo.regionClass"]=GetUserGeoID(14);r["geo.invalidClass"]=GetUserGeoID(999);
      int n=GetUserDefaultGeoName(IntPtr.Zero,0);r["geo.size"]=n;
      for(int i=0;i<512;i++)Marshal.WriteByte(p,i,0xcc);
      r["geo.short.result"]=GetUserDefaultGeoName(p,1);r["geo.short.error"]=Marshal.GetLastWin32Error();r["geo.short.guard"]=Marshal.ReadInt32(p);
      n=GetUserDefaultGeoName(p,32);r["geo.name"]=n>0?Marshal.PtrToStringUni(p):null;
      r["geo.null.result"]=GetUserDefaultGeoName(IntPtr.Zero,3);r["geo.null.error"]=Marshal.GetLastWin32Error();
      n=GetGeoInfoW(geo,4,p,32,0);r["geo.iso2"]=n>0?Marshal.PtrToStringUni(p):null;
      n=GetGeoInfoW(244,4,p,32,0);r["geo.explicitUS"]=n>0?Marshal.PtrToStringUni(p):null;
      r["zone.status"]=GetDynamicTimeZoneInformation(p);r["zone.key"]=Marshal.PtrToStringUni(IntPtr.Add(p,172));r["zone.standardBias"]=Marshal.ReadInt32(p);
      r["zone.staticStatus"]=GetTimeZoneInformation(p);r["zone.staticBias"]=Marshal.ReadInt32(p);
      GetSystemTime(utc);GetLocalTime(p);r["zone.currentOffset"]=Math.Round((Time(p)-Time(utc)).TotalMinutes);
      var dates=new DateTime[]{new DateTime(2026,1,15,12,0,0),new DateTime(2026,7,15,12,0,0),new DateTime(2006,3,20,12,0,0),new DateTime(2026,3,8,9,59,0),new DateTime(2026,3,8,10,1,0)};
      for(int i=0;i<dates.Length;i++)r["current.date"+i]=ConvertTime(IntPtr.Zero,dates[i]);
      r["current.rules2006"]=Rules(IntPtr.Zero,2006);r["current.rules2026"]=Rules(IntPtr.Zero,2026);
      var wanted=new HashSet<string>(new string[]{"Tokyo Standard Time","China Standard Time","Pacific Standard Time","W. Europe Standard Time","UTC"});
      for(uint i=0;i<1024;i++) {uint status=EnumDynamicTimeZoneInformation(i,zone);if(status==259)break;if(status!=0)throw new Exception("Enum failed");string key=Marshal.PtrToStringUni(IntPtr.Add(zone,172));if(!wanted.Contains(key))continue;
        for(int d=0;d<dates.Length;d++)r[key+".date"+d]=ConvertTime(zone,dates[d]);
        r[key+".rules2006"]=Rules(zone,2006);r[key+".rules2026"]=Rules(zone,2026);
      }
    }finally{Marshal.FreeHGlobal(p);Marshal.FreeHGlobal(zone);Marshal.FreeHGlobal(utc);}
    Console.WriteLine(new JavaScriptSerializer().Serialize(r));System.Threading.Thread.Sleep(300);
  }
}

