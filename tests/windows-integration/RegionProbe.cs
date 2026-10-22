using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32;

class RegionProbe {
    const string Sub = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Control Panel\DeviceRegion";
    static readonly IntPtr HKLM = new IntPtr(unchecked((int)0x80000002));
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode)] static extern int RegOpenKeyExW(IntPtr h, string sub, uint options, uint access, out IntPtr result);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode)] static extern int RegQueryValueExW(IntPtr h, string name, IntPtr reserved, out uint type, IntPtr data, IntPtr size);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode)] static extern int RegGetValueW(IntPtr h, string sub, string name, uint flags, out uint type, IntPtr data, IntPtr size);
    [DllImport("advapi32.dll")] static extern int RegCloseKey(IntPtr h);
    [DllImport("kernel32.dll")] static extern int GetUserGeoID(int geoClass);
    [DllImport("kernel32.dll")] static extern ushort GetUserDefaultUILanguage();
    [DllImport("kernel32.dll")] static extern ushort GetSystemDefaultUILanguage();
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern int GetUserDefaultLocaleName(IntPtr buffer, int count);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern int GetSystemDefaultLocaleName(IntPtr buffer, int count);
    [DllImport("kernel32.dll")] static extern uint GetTimeZoneInformation(IntPtr buffer);
    static Dictionary<string, object> Query(IntPtr key, int capacity, bool nullData, string value) {
        IntPtr size=Marshal.AllocHGlobal(4), data=Marshal.AllocHGlobal(16);
        try {
            Marshal.WriteInt32(size, capacity); for(int i=0;i<16;i++) Marshal.WriteByte(data,i,0xCC);
            uint type; int status=RegQueryValueExW(key,value,IntPtr.Zero,out type,nullData?IntPtr.Zero:data,size);
            return new Dictionary<string,object>{{"status",status},{"type",type},{"size",Marshal.ReadInt32(size)},{"value",Marshal.ReadInt32(data)},{"guard",Marshal.ReadInt32(data,4)}};
        } finally {Marshal.FreeHGlobal(size);Marshal.FreeHGlobal(data);}
    }
    static object Get(uint flags, int capacity, bool nullData, string value) {
        IntPtr size=Marshal.AllocHGlobal(4), data=Marshal.AllocHGlobal(16);
        try { Marshal.WriteInt32(size,capacity); for(int i=0;i<16;i++) Marshal.WriteByte(data,i,0xCC); uint type;
            int status=RegGetValueW(HKLM,Sub,value,flags,out type,nullData?IntPtr.Zero:data,size);
            return new Dictionary<string,object>{{"status",status},{"type",type},{"size",Marshal.ReadInt32(size)},{"value",Marshal.ReadInt32(data)},{"first",Marshal.ReadByte(data)},{"guard",Marshal.ReadInt32(data,4)}};
        } finally {Marshal.FreeHGlobal(size);Marshal.FreeHGlobal(data);}
    }
    static string Locale(bool system) {
        IntPtr data=Marshal.AllocHGlobal(170);
        try {int n=system?GetSystemDefaultLocaleName(data,85):GetUserDefaultLocaleName(data,85);return n>0?Marshal.PtrToStringUni(data):"ERROR";} finally{Marshal.FreeHGlobal(data);}
    }
    static void Main(string[] args) {
        Console.OutputEncoding=new System.Text.UTF8Encoding(false);
        var result=new Dictionary<string,object>(); result["args"]=args;result["cwd"]=Environment.CurrentDirectory;
        foreach(uint view in new uint[]{0x100,0x200}) {
            IntPtr key; int open=RegOpenKeyExW(HKLM,Sub,0,1|view,out key);
            var values=new Dictionary<string,object>{{"open",open}};
            if(open==0){try { values["length"]=Query(key,0,true,"DeviceRegion");values["short"]=Query(key,2,false,"DeviceRegion");values["exact"]=Query(key,4,false,"DeviceRegion");values["large"]=Query(key,16,false,"deviceregion");values["unrelated"]=Query(key,4,false,"FRL_Value_Does_Not_Exist");uint t;values["nullBoth"]=RegQueryValueExW(key,"DeviceRegion",IntPtr.Zero,out t,IntPtr.Zero,IntPtr.Zero);IntPtr b=Marshal.AllocHGlobal(4);try{values["nullSize"]=RegQueryValueExW(key,"DeviceRegion",IntPtr.Zero,out t,b,IntPtr.Zero);}finally{Marshal.FreeHGlobal(b);}}finally{RegCloseKey(key);}}
            result[view==0x100?"view64":"view32"]=values;
        }
        result["get"]=Get(0x10,4,false,"DeviceRegion");result["getLength"]=Get(0x10,0,true,"DeviceRegion");result["getShortZero"]=Get(0x20000010,2,false,"DeviceRegion");result["wrongType"]=Get(2,4,false,"DeviceRegion");result["invalidFlags"]=Get(0x30010,4,false,"DeviceRegion");
        IntPtr parent,child; int po=RegOpenKeyExW(HKLM,@"SOFTWARE\Microsoft\Windows\CurrentVersion\Control Panel",0,0x101,out parent);result["relativeOpen"]=po;
        if(po==0){try{int co=RegOpenKeyExW(parent,"DeviceRegion",0,0x101,out child);result["relativeOpen"]=co;if(co==0){try{result["relative"]=Query(child,4,false,"DeviceRegion");}finally{RegCloseKey(child);}}}finally{RegCloseKey(parent);}}
        using(var root=RegistryKey.OpenBaseKey(RegistryHive.LocalMachine,RegistryView.Registry64)){
            using(var k=root.OpenSubKey(Sub)){result["dotnet"]=k==null?null:k.GetValue("DeviceRegion");}
            using(var k=root.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion")){result["unrelatedProductName"]=k==null?null:k.GetValue("ProductName");}
        }
        result["userGeo"]=GetUserGeoID(16);result["userUI"]=GetUserDefaultUILanguage();result["systemUI"]=GetSystemDefaultUILanguage();result["userLocale"]=Locale(false);result["systemLocale"]=Locale(true);
        IntPtr small=Marshal.AllocHGlobal(2);try{result["localeShort"]=GetUserDefaultLocaleName(small,1);result["localeShortError"]=Marshal.GetLastWin32Error();}finally{Marshal.FreeHGlobal(small);}
        IntPtr tz=Marshal.AllocHGlobal(172);try{result["timezoneStatus"]=GetTimeZoneInformation(tz);result["timezoneBias"]=Marshal.ReadInt32(tz);}finally{Marshal.FreeHGlobal(tz);}
        Console.WriteLine(new JavaScriptSerializer().Serialize(result));
        // Let Frida's batched logger flush before the probe exits.
        Thread.Sleep(400);
    }
}
