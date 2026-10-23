import { expect, it } from 'vitest';
import { defaults, launchSchema, settingsSchema, profileFileSchema } from '../../src/shared/types';
it('migrates old settings and imports with text modules disabled', () => {
  const { encoding, font, ...legacy } = defaults.profile;
  const result = settingsSchema.parse({ ...defaults, profile: legacy });
  expect(result.profile.encoding).toEqual(encoding);
  expect(result.profile.font).toEqual(font);
  const imported = profileFileSchema.parse({ format: 'frida-region-profiles', version: 1, profiles: [{ id: '00000000-0000-4000-8000-000000000001', name: 'old', config: legacy }] });
  expect(imported.profiles[0].config.font.enabled).toBe(false);
});
it('round trips independent font and encoding settings without enabling locale', () => {
  const profile = { ...defaults.profile, encoding: { enabled: true, ansi: 932, oem: 437 }, font: { enabled: true, family: '游ゴシック', source: 'Arial', charset: 128, path: 'C:\\字体\\日本.ttf' } };
  expect(launchSchema.parse(JSON.parse(JSON.stringify(profile)))).toEqual(profile);
  expect(profile.locale.enabled).toBe(false);
});
it('rejects invalid code pages, malformed fonts and executable extra fields', () => {
  for (const ansi of [0, 1, 3, 99999, '932', true]) expect(() => launchSchema.parse({ ...defaults.profile, encoding: { enabled: true, ansi, oem: 932 } })).toThrow();
  for (const patch of [{ enabled: true }, { family: 'x'.repeat(32) }, { family: 'a\0b' }, { path: 'a\0b' }, { charset: 932 }, { script: 'exec' }]) expect(() => launchSchema.parse({ ...defaults.profile, font: { ...defaults.profile.font, ...patch } })).toThrow();
});
