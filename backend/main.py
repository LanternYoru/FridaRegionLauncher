import sys
import traceback
import threading
from protocol import write, parse

def main():
    if len(sys.argv) == 3 and sys.argv[1] == '--guardian':
        from process_manager import guardian_main
        guardian_main(int(sys.argv[2]))
        return
    from frida_manager import FridaManager
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    manager = FridaManager(lambda event, **kwargs: write('event', event=event, **kwargs))
    write('event', event='backend_ready', payload={'protocolVersion': 1})
    try:
        while True:
            line = sys.stdin.readline(131074)
            if not line:
                break
            request_id = None
            try:
                req = parse(line)
                request_id = req['requestId']
                command = req['command']
                if command == 'launch':
                    result = manager.launch(req.get('payload'))
                elif command == 'stop':
                    result = manager.stop()
                elif command == 'detach':
                    result = manager.detach()
                elif command == 'get_status':
                    result = manager.status()
                else:
                    result = manager.detach()
                write('response', request_id=request_id, payload=result)
                if command == 'shutdown':
                    break
            except Exception as exc:
                traceback.print_exc(file=sys.stderr)
                write('response', request_id=request_id, error=str(exc))
    finally:
        manager.detach()

if __name__ == '__main__':
    main()
