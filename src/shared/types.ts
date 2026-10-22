import { z } from 'zod';
const locale = z.enum(['en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'de-DE', 'fr-FR', 'ko-KR']);
export const launchSchema = z.object({
  exe: z.string().max(32767), args: z.string().max(30000), cwd: z.string().max(32767),
  deviceRegion: z.object({ enabled: z.boolean(), geoId: z.number().int().min(1).max(2147483647) }),
  language: z.object({ enabled: z.boolean(), userUI: locale, systemUI: locale }),
  locale: z.object({ enabled: z.boolean(), user: locale, system: locale }),
  timezone: z.object({ enabled: z.boolean(), key: z.literal('Tokyo Standard Time') }).strict().default({ enabled: false, key: 'Tokyo Standard Time' })
}).strict();
export type LaunchConfig = z.infer<typeof launchSchema>;
export const settingsSchema = z.object({ version: z.literal(1), theme: z.enum(['system','light','dark']), profile: launchSchema, recent: z.array(z.string().max(32767)).max(12), autoScroll: z.boolean() }).strict();
export type Settings = z.infer<typeof settingsSchema>;
export const defaults: Settings = { version: 1, theme: 'system', recent: [], autoScroll: true, profile: { exe: '', args: '', cwd: '', deviceRegion: { enabled: true, geoId: 94 }, language: { enabled: false, userUI: 'en-US', systemUI: 'en-US' }, locale: { enabled: false, user: 'en-US', system: 'en-US' }, timezone: { enabled: false, key: 'Tokyo Standard Time' } } };
export interface Message { type: 'event'|'response'; event?: string; requestId?: string; timestamp: string; pid?: number; payload?: Record<string, unknown>; error?: string; }
export interface Bridge { load(): Promise<Settings>; save(value: Settings): Promise<void>; selectExe(): Promise<string|null>; selectDirectory(): Promise<string|null>; filePath(file: File): string; icon(path: string): Promise<string|null>; command(command: 'launch'|'stop'|'detach'|'get_status', payload?: unknown): Promise<Message>; onMessage(callback: (message: Message) => void): () => void; exportLogs(text: string): Promise<void>; }
