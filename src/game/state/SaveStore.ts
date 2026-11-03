import type { Grade } from '../types';

export const SAVE_KEY = 'labrush.save.v1';

export interface BestScore {
  overall: number;
  grade: Grade;
  accuracy: number;
  tat: number;
  integrity: number;
  at: string;
}

export interface SaveData {
  best: BestScore | null;
  journal: string[];
  quizBest: number;
  settings: { muted: boolean; volume: number };
  seen: Record<string, boolean>;
}

const DEFAULTS: SaveData = {
  best: null,
  journal: [],
  quizBest: 0,
  settings: { muted: false, volume: 0.6 },
  seen: {},
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function coerce(raw: unknown): SaveData {
  const data: SaveData = clone(DEFAULTS);
  if (!isRecord(raw)) return data;
  if (isRecord(raw.best)) {
    const b = raw.best;
    const grade = b.grade;
    if (typeof b.overall === 'number' && Number.isFinite(b.overall)) {
      data.best = {
        overall: b.overall,
        grade: grade === 'A' || grade === 'B' || grade === 'C' || grade === 'D' ? grade : 'D',
        accuracy: typeof b.accuracy === 'number' ? b.accuracy : 0,
        tat: typeof b.tat === 'number' ? b.tat : 0,
        integrity: typeof b.integrity === 'number' ? b.integrity : 0,
        at: typeof b.at === 'string' ? b.at : '',
      };
    }
  }
  if (Array.isArray(raw.journal)) {
    data.journal = raw.journal.filter((x): x is string => typeof x === 'string');
  }
  if (typeof raw.quizBest === 'number' && Number.isFinite(raw.quizBest)) {
    data.quizBest = Math.max(0, Math.min(4, Math.floor(raw.quizBest)));
  }
  if (isRecord(raw.settings)) {
    data.settings.muted = raw.settings.muted === true;
    const vol = raw.settings.volume;
    data.settings.volume = typeof vol === 'number' && Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : 0.6;
  }
  if (isRecord(raw.seen)) {
    for (const [k, v] of Object.entries(raw.seen)) {
      if (v === true) data.seen[k] = true;
    }
  }
  return data;
}

/** Meta-progress only. Never stores a mid-shift state; never throws. */
export class SaveStore {
  private data: SaveData;
  private readonly storage: Storage | null;

  constructor(storage?: Storage | null) {
    this.storage = storage === undefined ? safeStorage() : storage;
    this.data = this.read();
  }

  get(): SaveData {
    return clone(this.data);
  }

  private read(): SaveData {
    if (!this.storage) return clone(DEFAULTS);
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      if (!raw) return clone(DEFAULTS);
      return coerce(JSON.parse(raw) as unknown);
    } catch {
      return clone(DEFAULTS);
    }
  }

  private write(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      /* storage denied or full: ignore */
    }
  }

  setBest(score: BestScore): boolean {
    const prev = this.data.best;
    const improved = !prev || score.overall > prev.overall;
    if (improved) {
      this.data.best = { ...score };
      this.write();
    }
    return improved;
  }

  unlockJournal(ids: readonly string[]): void {
    let changed = false;
    for (const id of ids) {
      if (!this.data.journal.includes(id)) {
        this.data.journal.push(id);
        changed = true;
      }
    }
    if (changed) this.write();
  }

  get journal(): string[] {
    return [...this.data.journal];
  }

  setQuizBest(correct: number): void {
    const clamped = Math.max(0, Math.min(4, Math.floor(correct)));
    if (clamped > this.data.quizBest) {
      this.data.quizBest = clamped;
      this.write();
    }
  }

  get quizBest(): number {
    return this.data.quizBest;
  }

  setSettings(patch: Partial<SaveData['settings']>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.write();
  }

  get settings(): SaveData['settings'] {
    return { ...this.data.settings };
  }

  markSeen(flag: string): void {
    if (!this.data.seen[flag]) {
      this.data.seen[flag] = true;
      this.write();
    }
  }

  seen(flag: string): boolean {
    return this.data.seen[flag] === true;
  }
}

function safeStorage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = '__labrush_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
