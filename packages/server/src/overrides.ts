import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface OverrideStore {
  all(): Promise<Record<string, string>>;
  /** Pass null to clear an override and fall back to the automatic category. */
  set(id: string, category: string | null): Promise<void>;
}

export function memoryOverrides(initial: Record<string, string> = {}): OverrideStore {
  const data = { ...initial };
  return {
    all: async () => ({ ...data }),
    set: async (id, category) => {
      if (category === null) delete data[id];
      else data[id] = category;
    },
  };
}

/** Sidecar file under <home>/.skills-ui/overrides.json — user skill files are never modified. */
export function fileOverrides(home = process.env.SKILLS_UI_HOME || os.homedir()): OverrideStore {
  const file = path.join(home, '.skills-ui', 'overrides.json');
  const read = async (): Promise<Record<string, string>> => {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  };
  let queue: Promise<unknown> = Promise.resolve();
  return {
    all: read,
    // Serialize writes so concurrent requests cannot clobber each other.
    set: (id, category) => {
      const next = queue.then(async () => {
        const data = await read();
        if (category === null) delete data[id];
        else data[id] = category;
        await fs.mkdir(path.dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(data, null, 2));
        await fs.rename(tmp, file);
      });
      queue = next.catch(() => undefined);
      return next;
    },
  };
}
