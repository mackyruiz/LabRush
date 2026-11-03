import { describe, expect, it } from 'vitest';
import { gradeFor, metricsFrom, starsFor, tatScore } from '../src/game/state/Scoring';

describe('tatScore', () => {
  it('scores fast orders at 100 and the limit at 0', () => {
    expect(tatScore(240, 240, 480)).toBe(100);
    expect(tatScore(300, 240, 480)).toBe(75);
    expect(tatScore(480, 240, 480)).toBe(0);
    expect(tatScore(0, 240, 480)).toBe(100);
    expect(tatScore(600, 240, 480)).toBe(0);
  });
});

describe('grades and stars', () => {
  it('maps overall scores to grades', () => {
    expect(gradeFor(95)).toBe('A');
    expect(gradeFor(90)).toBe('A');
    expect(gradeFor(89.9)).toBe('B');
    expect(gradeFor(80)).toBe('B');
    expect(gradeFor(70)).toBe('C');
    expect(gradeFor(69.9)).toBe('D');
  });

  it('maps metric scores to stars', () => {
    expect(starsFor(90)).toBe(3);
    expect(starsFor(89)).toBe(2);
    expect(starsFor(75)).toBe(2);
    expect(starsFor(74)).toBe(1);
  });
});

describe('metricsFrom', () => {
  it('weights accuracy, TAT, and integrity', () => {
    const m = metricsFrom([{ accuracy: 10, integrity: 0 }], [100]);
    expect(m).toEqual({ accuracy: 90, integrity: 100, tat: 100, overall: 95 });
  });

  it('clamps penalties at zero and defaults TAT to 100 before any close', () => {
    const m = metricsFrom(
      [
        { accuracy: 80, integrity: 30 },
        { accuracy: 80, integrity: 30 },
      ],
      [],
    );
    expect(m.accuracy).toBe(0);
    expect(m.integrity).toBe(40);
    expect(m.tat).toBe(100);
    expect(m.overall).toBe(38);
  });

  it('averages closed-order TAT scores', () => {
    const m = metricsFrom([], [100, 50]);
    expect(m.tat).toBe(75);
  });
});
