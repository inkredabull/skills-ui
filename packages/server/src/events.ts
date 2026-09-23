export type Unsubscribe = () => void;

/** Tiny in-process pub/sub used to push "skills changed" notifications to SSE clients. */
export interface EventBus {
  publish(): void;
  subscribe(listener: () => void): Unsubscribe;
}

export function createEventBus(): EventBus {
  const listeners = new Set<() => void>();
  return {
    publish: () => listeners.forEach((l) => l()),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
