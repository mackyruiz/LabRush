/* eslint-disable @typescript-eslint/no-explicit-any */
type Handler = (...args: any[]) => void;

/** Tiny DOM/Phaser event bus. The lab scene and the DOM UI never hold each other's objects. */
class Bus {
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, fn: Handler): () => void {
    const set = this.handlers.get(event) ?? new Set<Handler>();
    set.add(fn);
    this.handlers.set(event, set);
    return () => {
      set.delete(fn);
    };
  }

  emit(event: string, ...args: any[]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) fn(...args);
  }
}

export const bus = new Bus();
