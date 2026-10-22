import { z } from 'zod';
const locale = z.enum(['en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'de-DE', 'fr-FR', 'ko-KR']);
export const timezones = ['Tokyo Standard Time', 'China Standard Time', 'Pacific Standard Time', 'W. Europe Standard Time', 'UTC'] as const;
export const launchSchema = z.object({
  children: z.boolean().default(false),
  exe: z.string().max(32767), args: z.string().max(30000), cwd: z.string().max(32767),
  deviceRegion: z.object({ enabled: z.boolean(), geoId: z.number().int().min(1).max(2147483647) }),
  language: z.object({ enabled: z.boolean(), userUI: locale, systemUI: locale }),
  locale: z.object({ enabled: z.boolean(), user: locale, system: locale }),
  timezone: z.object({ enabled: z.boolean(), key: z.enum(timezones) }).strict().default({ enabled: false, key: 'Tokyo Standard Time' }),
  geoRegion: z.object({ enabled: z.boolean(), geoId: z.number().int().min(1).max(2147483647) }).strict().default({ enabled: false, geoId: 122 })
}).strict();
export type LaunchConfig = z.infer<typeof launchSchema>;
export const profileSchema = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(80), config: launchSchema }).strict();
export type ProgramProfile = z.infer<typeof profileSchema>;
export const profileFileSchema = z.object({ format: z.literal('frida-region-profiles'), version: z.literal(1), profiles: z.array(profileSchema).min(1).max(100) }).strict();
const common = { theme: z.enum(['system','light','dark']), profile: launchSchema, recent: z.array(z.string().max(32767)).max(12), autoScroll: z.boolean() };
const currentSettingsSchema = z.object({ ...common, version: z.literal(2), profiles: z.array(profileSchema).max(100), activeProfileId: z.uuid().nullable() }).strict().superRefine((s, ctx) => {
  const ids = new Set(s.profiles.map(p => p.id));
  if (ids.size !== s.profiles.length || (s.activeProfileId !== null && !ids.has(s.activeProfileId))) ctx.addIssue({ code: 'custom', message: '配置 ID 重复或当前配置不存在' });
});
export const settingsSchema = z.union([currentSettingsSchema, z.object({ ...common, version: z.literal(1) }).strict().transform(s => ({ ...s, version: 2 as const, profiles: [] as ProgramProfile[], activeProfileId: null }))]);
export type Settings = z.infer<typeof settingsSchema>;
export const defaults: Settings = { version: 2, profiles: [], activeProfileId: null, theme: 'system', recent: [], autoScroll: true, profile: { children: false, exe: '', args: '', cwd: '', deviceRegion: { enabled: true, geoId: 94 }, language: { enabled: false, userUI: 'en-US', systemUI: 'en-US' }, locale: { enabled: false, user: 'en-US', system: 'en-US' }, timezone: { enabled: false, key: 'Tokyo Standard Time' }, geoRegion: { enabled: false, geoId: 122 } } };
export interface Message { type: 'event'|'response'; event?: string; requestId?: string; timestamp: string; pid?: number; payload?: Record<string, unknown>; error?: string; }
export interface Bridge { load(): Promise<Settings>; save(value: Settings): Promise<void>; importProfiles(): Promise<ProgramProfile[]|null>; exportProfiles(profiles: ProgramProfile[]): Promise<void>; selectExe(): Promise<string|null>; selectDirectory(): Promise<string|null>; filePath(file: File): string; icon(path: string): Promise<string|null>; command(command: 'launch'|'stop'|'detach'|'get_status', payload?: unknown): Promise<Message>; onMessage(callback: (message: Message) => void): () => void; exportLogs(text: string): Promise<void>; }
