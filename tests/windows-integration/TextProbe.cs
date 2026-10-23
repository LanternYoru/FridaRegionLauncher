using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
class TextProbe {
  [DllImport("kernel32.dll")] static extern uint GetACP();
  [DllImport("kernel32.dll")] static extern uint GetOEMCP();
  [DllImport("kernel32.dll", SetLastError=true)] static extern int MultiByteToWideChar(uint cp,uint flags,byte[] input,int length,IntPtr output,int capacity);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern int WideCharToMultiByte(uint cp,uint flags,string input,int length,IntPtr output,int capacity,IntPtr replacement,IntPtr used);
  [DllImport("kernel32.dll")] static extern bool GetCPInfo(uint cp,IntPtr info);
  [DllImport("kernel32.dll")] static extern bool GetCPInfoExW(uint cp,uint flags,IntPtr info);
  [DllImport("kernel32.dll")] static extern bool GetCPInfoExA(uint cp,uint flags,IntPtr info);
  [DllImport("kernel32.dll")] static extern bool IsDBCSLeadByte(byte value);
  [DllImport("kernel32.dll")] static extern bool IsDBCSLeadByteEx(uint cp,byte value);
  [DllImport("gdi32.dll")] static extern IntPtr CreateFontIndirectW(IntPtr input);
  [DllImport("gdi32.dll")] static extern IntPtr CreateFontIndirectA(IntPtr input);
  [DllImport("gdi32.dll")] static extern IntPtr CreateFontIndirectExW(IntPtr input);
  [DllImport("gdi32.dll")] static extern IntPtr CreateFontIndirectExA(IntPtr input);
  [DllImport("gdi32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateFontW(int h,int w,int e,int o,int weight,uint italic,uint underline,uint strike,uint charset,uint op,uint clip,uint quality,uint pitch,string face);
  [DllImport("gdi32.dll",CharSet=CharSet.Ansi)] static extern IntPtr CreateFontA(int h,int w,int e,int o,int weight,uint italic,uint underline,uint strike,uint charset,uint op,uint clip,uint quality,uint pitch,string face);
  [DllImport("gdi32.dll")] static extern int GetObjectW(IntPtr font,int size,IntPtr output);
  [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc,IntPtr obj);
  [DllImport("gdi32.dll",CharSet=CharSet.Unicode)] static extern int GetTextFaceW(IntPtr dc,int size,StringBuilder output);
  [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr font);
  static object Font(IntPtr font) {
    if(font==IntPtr.Zero)throw new Exception("CreateFont failed");
    IntPtr data=Marshal.AllocHGlobal(92),dc=CreateCompatibleDC(IntPtr.Zero);
    try {
      if(GetObjectW(font,92,data)!=92)throw new Exception("GetObject failed");
      var face=new StringBuilder(64);IntPtr old=SelectObject(dc,font);GetTextFaceW(dc,64,face);SelectObject(dc,old);
      return new object[]{Marshal.PtrToStringUni(IntPtr.Add(data,28)),Marshal.ReadByte(data,23),Marshal.ReadInt32(data),Marshal.ReadInt32(data,16),face.ToString()};
    }finally{DeleteDC(dc);DeleteObject(font);Marshal.FreeHGlobal(data);}
  }
  static Dictionary<string,object> Sample() {
    var r=new Dictionary<string,object>();r["acp"]=GetACP();r["oem"]=GetOEMCP();
    IntPtr p=Marshal.AllocHGlobal(1024);
    try {
      foreach(uint cp in new uint[]{0,1,3,932,936,949,950,1252,437,850,65001}) {
        string key=cp.ToString();byte[] input={0x93,0xfa,0x96,0x7b,0};
        r[key+".size"]=MultiByteToWideChar(cp,0,input,-1,IntPtr.Zero,0);
        int n=MultiByteToWideChar(cp,0,input,-1,p,32);r[key+".text"]=n>0?Marshal.PtrToStringUni(p):null;
        Marshal.WriteInt32(p,unchecked((int)0xcccccccc));
        r[key+".short"]=MultiByteToWideChar(cp,0,input,-1,p,1);r[key+".shortError"]=Marshal.GetLastWin32Error();r[key+".guard"]=Marshal.ReadInt16(p,2);
        r[key+".invalid"]=MultiByteToWideChar(cp,8,new byte[]{0x81},1,p,32);r[key+".invalidError"]=Marshal.GetLastWin32Error();
        r[key+".wideSize"]=WideCharToMultiByte(cp,0,"日本",-1,IntPtr.Zero,0,IntPtr.Zero,IntPtr.Zero);
        n=WideCharToMultiByte(cp,0,"日本",-1,p,32,IntPtr.Zero,IntPtr.Zero);byte[] output=new byte[n];Marshal.Copy(p,output,0,n);r[key+".bytes"]=BitConverter.ToString(output);
        r[key+".wideShort"]=WideCharToMultiByte(cp,0,"日本",-1,p,1,IntPtr.Zero,IntPtr.Zero);r[key+".wideError"]=Marshal.GetLastWin32Error();
        GetCPInfo(cp,p);r[key+".max"]=Marshal.ReadInt32(p);
        GetCPInfoExW(cp,0,p);r[key+".infoW"]=Marshal.ReadInt32(p,20);
        GetCPInfoExA(cp,0,p);r[key+".infoA"]=Marshal.ReadInt32(p,20);
        r[key+".lead"]=IsDBCSLeadByteEx(cp,0x81);
      }
      r["lead"]=IsDBCSLeadByte(0x81);
      foreach(string original in new string[]{"Arial","Courier New"}) {
        foreach(string kind in new string[]{"W","A","ExW","ExA"}) {
          for(int i=0;i<1024;i++)Marshal.WriteByte(p,i,0);
          Marshal.WriteInt32(p,-21);Marshal.WriteInt32(p,16,700);Marshal.WriteByte(p,23,1);
          byte[] name=kind.EndsWith("W")?Encoding.Unicode.GetBytes(original+"\0"):Encoding.ASCII.GetBytes(original+"\0");Marshal.Copy(name,0,IntPtr.Add(p,28),name.Length);
          IntPtr font=kind=="W"?CreateFontIndirectW(p):kind=="A"?CreateFontIndirectA(p):kind=="ExW"?CreateFontIndirectExW(p):CreateFontIndirectExA(p);
          r[original+".indirect"+kind]=Font(font);
          r[original+".input"+kind]=kind.EndsWith("W")?Marshal.PtrToStringUni(IntPtr.Add(p,28)):Marshal.PtrToStringAnsi(IntPtr.Add(p,28));
        }
        r[original+".directW"]=Font(CreateFontW(-21,0,0,0,700,0,0,0,1,0,0,0,0,original));
        r[original+".directA"]=Font(CreateFontA(-21,0,0,0,700,0,0,0,1,0,0,0,0,original));
      }
    }finally{Marshal.FreeHGlobal(p);}
    return r;
  }
  static void Main(string[] args) {
    try {
      Console.OutputEncoding=new UTF8Encoding(false);
      var serializer=new JavaScriptSerializer();
      if(args.Length==0){Console.WriteLine(serializer.Serialize(Sample()));Thread.Sleep(300);return;}
      string folder=args[0],role=args.Length>1?args[1]:"root";
      Action<string> report=phase=>{string path=Path.Combine(folder,role+"-"+phase+".json");File.WriteAllText(path+".tmp",serializer.Serialize(Sample()),new UTF8Encoding(false));File.Move(path+".tmp",path);};
      report("first");
      if(role=="root")Process.Start(new ProcessStartInfo{FileName=Process.GetCurrentProcess().MainModule.FileName,Arguments="\""+folder+"\" child",UseShellExecute=false,CreateNoWindow=true});
      var timer=Stopwatch.StartNew();
      while(!File.Exists(Path.Combine(folder,"release")) && timer.ElapsedMilliseconds<20000){if(File.Exists(Path.Combine(folder,"sample"))&&!File.Exists(Path.Combine(folder,role+"-after.json")))report("after");Thread.Sleep(50);}
    }catch(Exception e){Console.Error.WriteLine(e);Environment.ExitCode=1;}
  }
}
