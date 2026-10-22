"""Real Windows child-gating regression; never touches user applications."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from frida_manager import FridaManager

def wait(check, timeout=15):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        result=check()
        if result:return result
        time.sleep(.05)
    raise AssertionError('Child process test timeout')

def main():
    output=ROOT/'artifacts/children';output.mkdir(parents=True,exist_ok=True)
    exe=output/'ChildProbe.exe'
    compiler=Path(os.environ['WINDIR'])/'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    subprocess.run([str(compiler),'/nologo','/platform:x64','/reference:System.Web.Extensions.dll','/out:'+str(exe),str(ROOT/'tests/windows-integration/ChildProbe.cs')],check=True)
    template={'exe':str(exe),'cwd':str(ROOT),'args':'','children':True,'deviceRegion':{'enabled':False,'geoId':94},'geoRegion':{'enabled':True,'geoId':122},'language':{'enabled':False,'userUI':'en-US','systemUI':'en-US'},'locale':{'enabled':True,'user':'ja-JP','system':'ja-JP'}}
    evidence={}
    for mode in ['recursive','disabled','orphan','detach','stop','cancel','failure','limit','timeout']:
        folder=Path(tempfile.mkdtemp(prefix=mode+'-',dir=output));events=[]
        class Manager(FridaManager):
            def _instrument(self,context):
                if mode=='failure' and context['role']=='child':
                    context['source'] += "\nrpc.exports.initialize = function(){throw new Error('deliberate child init failure');};"
                if mode=='timeout' and context['role']=='child':
                    context['source'] += "\nrpc.exports.initialize = function(){Thread.sleep(35);return {hookCount:0};};"
                if mode=='cancel' and context['role']=='child':
                    context['source'] += "\nrpc.exports.initialize = function(){Thread.sleep(5);return {hookCount:0};};"
                return super()._instrument(context)
        manager=Manager(lambda event,**data:events.append({'event':event,**data}))
        if mode=='limit':manager.MAX_PROCESSES=1
        config=copy.deepcopy(template);config['children']=mode!='disabled'
        runmode='hold' if mode in ['detach','stop','cancel'] else 'recursive' if mode=='recursive' else 'orphan' if mode=='orphan' else 'normal'
        config['args']=subprocess.list2cmdline([str(folder),'root',runmode])
        try:
            manager.launch(config)
            count=3 if mode=='recursive' else 1 if mode in ['failure','limit','timeout','cancel'] else 2
            wait(lambda: len(list(folder.glob('*-first.json')))>=count)
            first=[json.loads(p.read_text()) for p in folder.glob('*-first.json')]
            if mode=='disabled':
                assert not any(e['event']=='child_started' for e in events)
                assert next(x for x in first if x['role']=='root')['geo']==122
                import ctypes
                assert next(x for x in first if x['role']=='child')['geo']==ctypes.windll.kernel32.GetUserGeoID(16)
            else:
                assert all(x['geo']==122 and x['lcid']==1041 for x in first),first
            if mode=='orphan':
                wait(lambda: manager.pid is None)
                assert manager.status()['state']=='running' and manager.status()['processes']
                try:manager.launch(config)
                except ValueError:pass
                else:raise AssertionError('Allowed launch while child still monitored')
                (folder/'release').touch()
            if mode=='detach':
                manager.detach();assert not manager.status()['processes']
                (folder/'sample').touch()
                wait(lambda:len(list(folder.glob('*-after.json')))==2)
                after=[json.loads(p.read_text()) for p in folder.glob('*-after.json')]
                import ctypes
                actual=ctypes.windll.kernel32.GetUserGeoID(16)
                assert all(x['geo']==actual for x in after),after
                (folder/'release').touch()
            if mode=='stop':
                ids={p['pid'] for p in manager.status()['processes']}
                manager.stop()
                wait(lambda: not ids.intersection(p.pid for p in manager.device.enumerate_processes()))
            if mode=='cancel':
                wait(lambda:any(e['event']=='child_started' for e in events))
                manager.detach()
                time.sleep(.3)
                assert manager.status()['state']=='detached'
                assert not any(e['event']=='child_resumed' for e in events)
                (folder/'release').touch()
            wait(lambda:not manager.status()['processes'],timeout=35)
            if mode in ['failure','limit','timeout']:
                wait(lambda:any(e['event']=='child_error' for e in events))
                assert not any(e['event']=='child_resumed' for e in events)
            else:
                assert not any(e.get('error') for e in events),events
            evidence[mode]={'first':first,'events':events}
        finally:
            (folder/'release').touch()
            manager.stop()
            manager.device.off('child-added',manager._child_added)
    (ROOT/'artifacts/children-results.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
    print('PASS: child/grandchild inheritance, opt-out, root exit, group detach/stop, initialization cancellation, failed injection, process cap, 25-second guardian timeout')

if __name__=='__main__':main()
