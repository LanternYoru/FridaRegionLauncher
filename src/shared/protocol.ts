import { z } from 'zod';
const message = z.object({ type: z.enum(['event','response']), event: z.string().optional(), requestId: z.string().optional(), timestamp: z.string(), pid: z.number().int().optional(), payload: z.record(z.string(), z.unknown()).optional(), error: z.string().optional() });
// StringDecoder in the transport preserves UTF-8 across chunk boundaries.
export class JsonLines {
  private buffer = '';
  push(chunk: string) {
    this.buffer += chunk;
    if (this.buffer.length > 2_000_000) throw new Error('后端协议消息超出长度限制');
    const lines = this.buffer.split('\n'); this.buffer = lines.pop()!;
    return lines.filter(line => line.trim()).map(line => message.parse(JSON.parse(line)));
  }
}
