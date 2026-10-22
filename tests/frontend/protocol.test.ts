import { describe, expect, it } from 'vitest';
import { JsonLines } from '../../src/shared/protocol';
import { defaults, launchSchema, settingsSchema } from '../../src/shared/types';
describe('JSON Lines boundary and validation', () => {
  it('migrates existing settings without enabling a new timezone implicitly', () => {
    const { timezone, ...oldProfile } = defaults.profile;
    const restored = settingsSchema.parse({ ...defaults, profile: oldProfile });
    expect(restored.profile.timezone).toEqual({ enabled: false, key: 'Tokyo Standard Time' });
    expect(() => launchSchema.parse({ ...defaults.profile, timezone: { enabled: true, key: 'Unsupported Zone' } })).toThrow();
  });
  it('accepts fragmented and coalesced messages', () => {
    const parser = new JsonLines();
    const line = JSON.stringify({ type: 'event', event: 'backend_ready', timestamp: '2026-10-22', payload: { text: '中文' } });
    expect(parser.push(line.slice(0, 13))).toEqual([]);
    expect(parser.push(line.slice(13) + '\n' + line + '\n')).toHaveLength(2);
  });
  it('rejects arbitrary target output and oversized lines', () => { expect(() => new JsonLines().push('hello\n')).toThrow(); expect(() => new JsonLines().push('a'.repeat(2_000_001))).toThrow(); });
  it('validates GeoID and versions without coercion', () => { expect(settingsSchema.parse(defaults).version).toBe(1); expect(() => settingsSchema.parse({ ...defaults, version: 2 })).toThrow(); expect(() => launchSchema.parse({ ...defaults.profile, deviceRegion: { enabled: true, geoId: '94' } })).toThrow(); });
});
