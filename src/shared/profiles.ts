import { settingsSchema, type Settings, type ProgramProfile } from './types';

// Save the editing draft before switching profiles so edits never disappear.
export function snapshotDraft(settings: Settings): Settings {
  return { ...settings, profiles: settings.profiles.map(p => p.id === settings.activeProfileId ? { ...p, config: structuredClone(settings.profile) } : p) };
}
export function selectProfile(settings: Settings, id: string): Settings {
  const next = snapshotDraft(settings), found = next.profiles.find(p => p.id === id);
  if (!found) throw new Error('配置不存在');
  return { ...next, activeProfileId: id, profile: structuredClone(found.config) };
}
export function addProfiles(settings: Settings, profiles: ProgramProfile[]): Settings {
  return settingsSchema.parse({ ...snapshotDraft(settings), profiles: [...snapshotDraft(settings).profiles, ...profiles] });
}
export function removeProfile(settings: Settings, id: string): Settings {
  const next = snapshotDraft(settings);
  return { ...next, profiles: next.profiles.filter(p => p.id !== id), activeProfileId: next.activeProfileId === id ? null : next.activeProfileId };
}
