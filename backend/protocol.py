import json
import sys
import threading
from datetime import datetime, timezone

_lock = threading.Lock()

def write(kind, *, event=None, request_id=None, pid=None, payload=None, error=None):
    message = {'type': kind, 'timestamp': datetime.now(timezone.utc).isoformat()}
    for key, value in [('event', event), ('requestId', request_id), ('pid', pid), ('payload', payload), ('error', error)]:
        if value is not None:
            message[key] = value
    with _lock:
        sys.stdout.write(json.dumps(message, ensure_ascii=False) + '\n')
        sys.stdout.flush()

def parse(line):
    if len(line) > 131072:
        raise ValueError('请求过长')
    data = json.loads(line)
    if not isinstance(data, dict) or data.get('type') != 'request':
        raise ValueError('需要 request 消息')
    if not isinstance(data.get('requestId'), str) or not 1 <= len(data['requestId']) <= 100:
        raise ValueError('无效 requestId')
    if data.get('command') not in ('launch', 'stop', 'detach', 'get_status', 'shutdown'):
        raise ValueError('未知命令')
    return data
