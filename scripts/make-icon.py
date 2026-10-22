"""Render the simple code-native globe mark to an ICO using only stdlib."""
import math
from pathlib import Path
import struct
import zlib
size = 256
rows = bytearray()
for y in range(size):
    rows.append(0)
    for x in range(size):
        dx, dy = x - 127.5, y - 127.5
        radius = math.hypot(dx, dy)
        corner = math.hypot(max(abs(dx) - 63, 0), max(abs(dy) - 63, 0))
        alpha = 255 if corner < 57 else 0
        ellipse = math.sqrt((dx / 32) ** 2 + (dy / 76) ** 2)
        white = abs(radius - 76) < 4.5 or (abs(ellipse - 1) < .075 and abs(dy) < 77) or (abs(dy) < 4.5 and abs(dx) < 76) or (abs(abs(dy) - 40) < 4.5 and abs(dx) < 64)
        rows.extend((255, 255, 255, alpha) if white else (65, 105, 225, alpha))
def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(rows))) + chunk(b'IEND', b'')
root = Path(__file__).resolve().parents[1] / 'resources' / 'icons'
(root / 'app.png').write_bytes(png)
(root / 'app.ico').write_bytes(struct.pack('<HHH', 0, 1, 1) + struct.pack('<BBBBHHII', 0, 0, 0, 0, 1, 32, len(png), 22) + png)
