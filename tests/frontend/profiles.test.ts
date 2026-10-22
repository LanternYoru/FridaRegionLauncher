import { describe, expect, it } from 'vitest';
import { defaults, settingsSchema, profileFileSchema } from '../../src/shared/types';
import { addProfiles, selectProfile, removeProfile, snapshotDraft } from '../../src/shared/profiles';
const a = '00000000-0000-4000-8000-000000000001', b = '00000000-0000-4000-8000-000000000002';
describe('profile persistence and migration', () => {
  it('migrates v1 without discarding paths or enabling new modules', () => {
    const { geoRegion, timezone, ...oldProfile } = defaults.profile;
    const migrated = settingsSchema.parse({ version: 1, theme: 'dark', autoScroll: false, recent: ['C:\\应用.exe'], profile: { ...oldProfile, exe: 'C:\\应用.exe' } });
    expect(migrated.version).toBe(2); expect(migrated.profile.exe).toBe('C:\\应用.exe');
    expect(migrated.profile.geoRegion.enabled).toBe(false); expect(migrated.profile.timezone.enabled).toBe(false);
    expect(migrated.profile.children).toBe(false);
    expect(migrated.profiles).toEqual([]);
  });
  it('keeps edited draft on switch and does not share nested objects', () => {
    let s = addProfiles(structuredClone(defaults), [{ id: a, name: 'A', config: structuredClone(defaults.profile) }, { id: b, name: 'B', config: structuredClone(defaults.profile) }]);
    s = selectProfile(s, a); s.profile.deviceRegion.geoId = 122;
    s = selectProfile(s, b); expect(s.profile.deviceRegion.geoId).toBe(94);
    s = selectProfile(s, a); expect(s.profile.deviceRegion.geoId).toBe(122);
    expect(snapshotDraft(s).profiles[1].config.deviceRegion.geoId).toBe(94);
    s = removeProfile(s, a); expect(s.activeProfileId).toBeNull(); expect(s.profile.deviceRegion.geoId).toBe(122);
  });
  it('rejects duplicate IDs, missing active profile, unknown formats and executable fields', () => {
    const p = { id: a, name: 'A', config: defaults.profile };
    expect(() => addProfiles(defaults, [p, p])).toThrow();
    expect(() => settingsSchema.parse({ ...defaults, activeProfileId: a })).toThrow();
    expect(() => profileFileSchema.parse({ format: 'other', version: 1, profiles: [p] })).toThrow();
    expect(() => profileFileSchema.parse({ format: 'frida-region-profiles', version: 1, profiles: [{ ...p, script: 'untrusted' }] })).toThrow();
  });
});
