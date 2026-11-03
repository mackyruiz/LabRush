import { describe, expect, it } from 'vitest';
import { SAVE_KEY, SaveStore, type BestScore } from '../src/game/state/SaveStore';

class FakeStorage {
  map = new Map<string, string>();
  failWrites = false;
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('denied');
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(): string | null {
    return null;
  }
  get length(): number {
    return this.map.size;
  }
}

const best = (overall: number): BestScore => ({
  overall,
  grade: overall >= 90 ? 'A' : 'B',
  accuracy: 100,
  tat: 90,
  integrity: 100,
  at: '2026-01-01T00:00:00.000Z',
});

describe('SaveStore', () => {
  it('starts from defaults when empty', () => {
    const store = new SaveStore(new FakeStorage() as unknown as Storage);
    const data = store.get();
    expect(data.best).toBeNull();
    expect(data.journal).toEqual([]);
    expect(data.settings).toEqual({ muted: false, volume: 0.6 });
  });

  it('persists meta progress under the v1 key', () => {
    const storage = new FakeStorage();
    const store = new SaveStore(storage as unknown as Storage);
    expect(store.setBest(best(88))).toBe(true);
    store.unlockJournal(['qc', 'bmp']);
    store.unlockJournal(['bmp', 'cbc']);
    store.setQuizBest(3);
    store.setSettings({ muted: true });
    store.markSeen('tutorial-qc');

    const reloaded = new SaveStore(storage as unknown as Storage);
    expect(reloaded.get().best?.overall).toBe(88);
    expect(reloaded.journal).toEqual(['qc', 'bmp', 'cbc']);
    expect(reloaded.quizBest).toBe(3);
    expect(reloaded.settings.muted).toBe(true);
    expect(reloaded.seen('tutorial-qc')).toBe(true);
    expect(storage.map.has(SAVE_KEY)).toBe(true);
  });

  it('never lowers a best score', () => {
    const store = new SaveStore(new FakeStorage() as unknown as Storage);
    store.setBest(best(92));
    expect(store.setBest(best(75))).toBe(false);
    expect(store.get().best?.overall).toBe(92);
  });

  it('falls back to defaults on corrupt JSON', () => {
    const storage = new FakeStorage();
    storage.setItem(SAVE_KEY, '{not json');
    const store = new SaveStore(storage as unknown as Storage);
    expect(store.get().best).toBeNull();
    expect(store.get().journal).toEqual([]);
  });

  it('survives storage denial without throwing', () => {
    const storage = new FakeStorage();
    storage.failWrites = true;
    const store = new SaveStore(storage as unknown as Storage);
    expect(() => store.setBest(best(90))).not.toThrow();
    expect(() => store.unlockJournal(['qc'])).not.toThrow();
    expect(store.get().settings.muted).toBe(false);
  });

  it('clamps quiz best between 0 and 4', () => {
    const store = new SaveStore(new FakeStorage() as unknown as Storage);
    store.setQuizBest(9);
    expect(store.quizBest).toBe(4);
    store.setQuizBest(-3);
    expect(store.quizBest).toBe(4);
  });
});
