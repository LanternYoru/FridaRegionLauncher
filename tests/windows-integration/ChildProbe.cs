using System;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
class ChildProbe {
  [DllImport("kernel32.dll")] static extern int GetUserGeoID(int kind);
  [DllImport("kernel32.dll")] static extern uint GetUserDefaultLCID();
  static void Report(string directory,string role,string phase) {
    var data=new {pid=Process.GetCurrentProcess().Id,role=role,phase=phase,geo=GetUserGeoID(16),lcid=GetUserDefaultLCID()};
    string path=Path.Combine(directory,data.pid+"-"+phase+".json");
    File.WriteAllText(path+".tmp",new JavaScriptSerializer().Serialize(data));File.Move(path+".tmp",path);
  }
  static Process Start(string directory,string role,string mode) {
    return Process.Start(new ProcessStartInfo {FileName=Process.GetCurrentProcess().MainModule.FileName,Arguments="\""+directory+"\" "+role+" "+mode,UseShellExecute=false,CreateNoWindow=true});
  }
  static void Main(string[] args) {
    try {
      string directory=args[0],role=args[1],mode=args[2];
      Report(directory,role,"first");
      Process child=null;
      if(role=="root") child=Start(directory,"child",mode);
      if(role=="child" && mode=="recursive") child=Start(directory,"grandchild",mode);
      if(role=="root" && mode=="orphan")return;
      if(mode=="hold" || mode=="orphan") {
        var watch=Stopwatch.StartNew();
        while(!File.Exists(Path.Combine(directory,"release")) && watch.ElapsedMilliseconds<20000) {
          if(File.Exists(Path.Combine(directory,"sample")) && !File.Exists(Path.Combine(directory,Process.GetCurrentProcess().Id+"-after.json")))Report(directory,role,"after");
          Thread.Sleep(50);
        }
      } else Thread.Sleep(700);
      if(child!=null)child.WaitForExit(22000);
    }catch(Exception e){ Console.Error.WriteLine(e);Environment.ExitCode=1; }
  }
}
