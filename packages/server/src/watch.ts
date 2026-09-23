import { watch, type FSWatcher } from 'node:fs';

/** Watches directories recursively and calls `onChange` once per burst of events. */
export function watchRoots(roots: string[], onChange: () => void, debounceMs = 400): () => void {
  const watchers: FSWatcher[] = [];
  let timer: NodeJS.Timeout | undefined;
  const fire = (_event: string, filename: string | Buffer | null) => {
    // Ignore our own atomic-write temp files.
    if (typeof filename === 'string' && filename.endsWith('.tmp')) return;
    clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  };
  for (const root of roots) {
    try {
      const w = watch(root, { recursive: true }, fire);
      w.on('error', () => undefined);
      watchers.push(w);
    } catch {
      /* missing directory or unsupported platform: manual Rescan still works */
    }
  }
  return () => {
    clearTimeout(timer);
    watchers.forEach((w) => w.close());
  };
}
