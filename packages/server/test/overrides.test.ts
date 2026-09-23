import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileOverrides } from '../src/overrides.js';

describe('fileOverrides', () => {
  it('persists across instances and survives concurrent writes', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'skills-ui-ov-'));
    try {
      const store = fileOverrides(home);
      await Promise.all(Array.from({ length: 10 }, (_, i) => store.set(`id${i}`, `cat${i}`)));
      await store.set('id0', null);
      const again = await fileOverrides(home).all();
      expect(Object.keys(again)).toHaveLength(9);
      expect(again.id3).toBe('cat3');
      expect(again).not.toHaveProperty('id0');
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it('returns empty when the file does not exist', async () => {
    expect(await fileOverrides('/nonexistent-skills-ui-home').all()).toEqual({});
  });
});
