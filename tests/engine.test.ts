import { describe, expect, it } from 'vitest';
import { SHIFT_01 } from '../src/game/content/shift01';
import { TESTS } from '../src/game/content/tests';
import { ShiftEngine } from '../src/game/state/ShiftEngine';
import type { Clock } from '../src/game/state/ShiftEngine';

const allCleared = {
  cleared: { CHEM: true, HEMA: true, COAG: true },
  flagged: [],
};

function fakeClock(): Clock & { set: (ms: number) => void } {
  let now = 0;
  return { now: () => now, set: (ms: number) => (now = ms) };
}

function started(): ShiftEngine {
  const engine = new ShiftEngine(SHIFT_01, TESTS);
  engine.startShift();
  engine.completeQc(allCleared);
  return engine;
}

function receiveOrder1(engine: ShiftEngine): void {
  engine.receiveNextOrder();
  engine.accession({
    decisions: [
      { specimenId: 'SPC-1001A', accepted: true },
      { specimenId: 'SPC-1001B', accepted: true },
    ],
    orderOfDraw: ['GOLD_SST', 'LAVENDER_EDTA'],
  });
}

function processOrder1(engine: ShiftEngine): void {
  receiveOrder1(engine);
  engine.centrifuge('BMP', { balanced: true, rpm: 3000, minutes: 10, success: true });
  engine.aliquot('BMP', { volumeUl: 500, attempts: 1, success: true });
  expect(engine.loadAnalyzer('CHEM')).toEqual({ ok: true });
  expect(engine.runAnalyzer('CHEM')).toEqual({ ok: true });
  expect(engine.loadAnalyzer('HEMA')).toEqual({ ok: true });
  expect(engine.runAnalyzer('HEMA')).toEqual({ ok: true });
}

function closeOrder1(engine: ShiftEngine): void {
  processOrder1(engine);
  engine.reportCritical('BMP', 'K');
  expect(engine.releaseTest('BMP')).toEqual({ ok: true });
  expect(engine.releaseTest('CBC')).toEqual({ ok: true });
  expect(engine.closeOrder()).toEqual({ ok: true });
}

function processOrder2(engine: ShiftEngine): void {
  engine.receiveNextOrder();
  engine.accession({ decisions: [{ specimenId: 'SPC-1002A', accepted: true }] });
  engine.centrifuge('PT_INR', { balanced: true, rpm: 3000, minutes: 15, success: true });
  engine.aliquot('PT_INR', { volumeUl: 500, attempts: 1, success: true });
  expect(engine.loadAnalyzer('COAG')).toEqual({ ok: true });
  expect(engine.runAnalyzer('COAG')).toEqual({ ok: true });
  engine.reportCritical('PT_INR', 'INR');
  engine.reportCritical('PT_INR', 'PT');
  expect(engine.releaseTest('PT_INR')).toEqual({ ok: true });
  expect(engine.closeOrder()).toEqual({ ok: true });
}

describe('QC gating', () => {
  it('blocks analyzer load and run before QC is cleared', () => {
    const engine = new ShiftEngine(SHIFT_01, TESTS);
    engine.startShift();
    expect(engine.loadAnalyzer('CHEM').ok).toBe(false);
    expect(engine.loadAnalyzer('CHEM').reason).toMatch(/QC/);
    expect(engine.runAnalyzer('COAG').ok).toBe(false);
    expect(engine.runAnalyzer('COAG').reason).toMatch(/QC/);
  });

  it('stays in QC until all three analyzers are cleared', () => {
    const engine = new ShiftEngine(SHIFT_01, TESTS);
    engine.startShift();
    engine.completeQc({ cleared: { CHEM: true, HEMA: true, COAG: false }, flagged: [] });
    expect(engine.getSnapshot().status).toBe('qc');
    expect(engine.getSnapshot().objective.kind).toBe('qc');
    engine.completeQc(allCleared);
    expect(engine.getSnapshot().status).toBe('active');
    expect(engine.getSnapshot().objective.kind).toBe('receive');
  });
});

describe('order 1 critical release', () => {
  it('blocks BMP release until the potassium is reported, then releases', () => {
    const engine = started();
    processOrder1(engine);
    const blocked = engine.releaseTest('BMP');
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/critical/i);
    expect(blocked.reason).toMatch(/K/);
    expect(engine.releaseTest('CBC').ok).toBe(true);

    engine.reportCritical('BMP', 'Na');
    expect(engine.releaseTest('BMP').ok).toBe(false);
    engine.reportCritical('BMP', 'K');
    expect(engine.releaseTest('BMP')).toEqual({ ok: true });
  });

  it('blocks closing until every test is released or recollected', () => {
    const engine = started();
    processOrder1(engine);
    engine.reportCritical('BMP', 'K');
    expect(engine.releaseTest('BMP').ok).toBe(true);
    const blocked = engine.closeOrder();
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/CBC/);
    engine.releaseTest('CBC');
    expect(engine.closeOrder()).toEqual({ ok: true });
    expect(engine.getSnapshot().activeOrder).toBeNull();
    expect(engine.getSnapshot().objective.kind).toBe('receive');
  });

  it('never tests an accepted label-mismatched specimen', () => {
    const engine = started();
    closeOrder1(engine);
    processOrder2(engine);
    engine.receiveNextOrder();
    engine.accession({
      decisions: [
        { specimenId: 'SPC-1003A', accepted: true },
        { specimenId: 'SPC-1003B', accepted: true },
      ],
      orderOfDraw: ['LAVENDER_EDTA', 'GOLD_SST'],
    });
    const attempt = engine.loadAnalyzer('CHEM');
    expect(attempt.ok).toBe(false);
    expect(attempt.reason).toMatch(/mismatch/i);
    const metrics = engine.getSnapshot().metrics;
    expect(metrics.integrity).toBe(70);
  });
});

describe('order of draw', () => {
  it('penalizes a wrong sequence but keeps the cases moving', () => {
    const engine = started();
    engine.receiveNextOrder();
    engine.accession({
      decisions: [
        { specimenId: 'SPC-1001A', accepted: true },
        { specimenId: 'SPC-1001B', accepted: true },
      ],
      orderOfDraw: ['LAVENDER_EDTA', 'GOLD_SST'],
    });
    expect(engine.getSnapshot().metrics.accuracy).toBe(90);
    expect(engine.getSnapshot().penalties[0].code).toBe('wrong_order_of_draw');
    expect(engine.getSnapshot().journalUnlocked).toContain('order-of-draw');
  });

  it('does not penalize the CLSI sequence', () => {
    const engine = started();
    receiveOrder1(engine);
    expect(engine.getSnapshot().metrics.accuracy).toBe(100);
  });
});

describe('order 3 mismatch path', () => {
  it('rejects the mislabeled SST, releases the CBC, and closes a partial order', () => {
    const engine = started();
    closeOrder1(engine);
    processOrder2(engine);
    engine.receiveNextOrder();
    engine.accession({
      decisions: [
        { specimenId: 'SPC-1003A', accepted: true },
        { specimenId: 'SPC-1003B', accepted: false, reason: 'label_mismatch' },
      ],
      orderOfDraw: ['GOLD_SST', 'LAVENDER_EDTA'],
    });
    expect(engine.loadAnalyzer('HEMA')).toEqual({ ok: true });
    expect(engine.runAnalyzer('HEMA')).toEqual({ ok: true });
    expect(engine.releaseTest('CBC')).toEqual({ ok: true });
    expect(engine.releaseTest('BMP').ok).toBe(false);
    expect(engine.requestRecollect('BMP', 'label_mismatch')).toEqual({ ok: true });
    expect(engine.closeOrder()).toEqual({ ok: true });

    const snapshot = engine.getSnapshot();
    expect(snapshot.status).toBe('complete');
    expect(snapshot.objective.kind).toBe('complete');
    const order3 = snapshot.orderSummaries[2];
    expect(order3.recollect).toEqual(['BMP']);
    expect(order3.released).toEqual(['CBC']);
    expect(order3.closed).toBe(true);
  });

  it('also supports accepting the mismatch and then rejecting it at report', () => {
    const engine = started();
    closeOrder1(engine);
    processOrder2(engine);
    engine.receiveNextOrder();
    engine.accession({
      decisions: [
        { specimenId: 'SPC-1003A', accepted: true },
        { specimenId: 'SPC-1003B', accepted: true },
      ],
      orderOfDraw: ['GOLD_SST', 'LAVENDER_EDTA'],
    });
    expect(engine.getSnapshot().objective.kind).toBe('reject');
    expect(engine.loadAnalyzer('HEMA')).toEqual({ ok: true });
    expect(engine.runAnalyzer('HEMA')).toEqual({ ok: true });
    expect(engine.releaseTest('CBC').ok).toBe(true);
    const recollect = engine.requestRecollect('BMP');
    expect(recollect).toEqual({ ok: true });
    const bmp = engine.getSnapshot().activeOrder?.testStates.find((t) => t.test === 'BMP');
    expect(bmp?.rejected).toBe(true);
    expect(bmp?.recollect).toBe(true);
    expect(engine.closeOrder()).toEqual({ ok: true });
  });

  it('refuses to recollect a valid specimen', () => {
    const engine = started();
    receiveOrder1(engine);
    const result = engine.requestRecollect('CBC');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/valid/i);
  });
});

describe('processing gates', () => {
  it('refuses to aliquot before centrifugation', () => {
    const engine = started();
    receiveOrder1(engine);
    engine.aliquot('BMP', { volumeUl: 500, attempts: 1, success: true });
    expect(engine.loadAnalyzer('CHEM').ok).toBe(false);
    const snapshot = engine.getSnapshot();
    expect(snapshot.activeOrder?.specimens[0].aliquoted).toBe(false);
    expect(snapshot.objective.kind).toBe('centrifuge');
  });

  it('penalizes an unbalanced rotor and does not spin', () => {
    const engine = started();
    receiveOrder1(engine);
    engine.centrifuge('BMP', { balanced: false, rpm: 3000, minutes: 10, success: false });
    expect(engine.getSnapshot().metrics.accuracy).toBe(90);
    expect(engine.getSnapshot().activeOrder?.specimens[0].centrifuged).toBe(false);
  });

  it('penalizes a wrong spin preset', () => {
    const engine = started();
    receiveOrder1(engine);
    engine.centrifuge('BMP', { balanced: true, rpm: 5000, minutes: 5, success: false });
    expect(engine.getSnapshot().penalties[0].code).toBe('wrong_spin_preset');
    expect(engine.getSnapshot().activeOrder?.specimens[0].centrifuged).toBe(false);
  });

  it('accepts a good aliquot and records a small pipette miss', () => {
    const engine = started();
    receiveOrder1(engine);
    engine.centrifuge('BMP', { balanced: true, rpm: 3000, minutes: 10, success: true });
    engine.aliquot('BMP', { volumeUl: 470, attempts: 1, success: true });
    expect(engine.getSnapshot().metrics.accuracy).toBe(95);
    expect(engine.getSnapshot().activeOrder?.specimens[0].aliquoted).toBe(true);
  });

  it('keeps the cup rejected for a large pipette miss and retries without deadlock', () => {
    const engine = started();
    receiveOrder1(engine);
    engine.centrifuge('BMP', { balanced: true, rpm: 3000, minutes: 10, success: true });
    engine.aliquot('BMP', { volumeUl: 300, attempts: 1, success: false });
    expect(engine.getSnapshot().activeOrder?.specimens[0].aliquoted).toBe(false);
    engine.aliquot('BMP', { volumeUl: 500, attempts: 2, success: true });
    expect(engine.getSnapshot().activeOrder?.specimens[0].aliquoted).toBe(true);
    expect(engine.getSnapshot().metrics.accuracy).toBe(92);
  });
});

describe('timer', () => {
  it('excludes paused milliseconds from order TAT', () => {
    const clock = fakeClock();
    const engine = new ShiftEngine(SHIFT_01, TESTS, { clock });
    engine.startShift();
    engine.completeQc(allCleared);
    processOrder1(engine);
    clock.set(100_000);
    engine.pauseTimer();
    clock.set(130_000);
    expect(engine.getSnapshot().elapsedSec).toBe(100);
    clock.set(160_000);
    engine.resumeTimer();
    engine.reportCritical('BMP', 'K');
    engine.releaseTest('BMP');
    engine.releaseTest('CBC');
    expect(engine.closeOrder()).toEqual({ ok: true });
    expect(engine.getSnapshot().orderSummaries[0].tatSec).toBe(100);
  });
});

describe('objectives', () => {
  it('walks the happy path through every objective kind', () => {
    const engine = started();
    const kinds: string[] = [];
    kinds.push(engine.getObjective().kind);
    engine.receiveNextOrder();
    kinds.push(engine.getObjective().kind);
    engine.accession({
      decisions: [
        { specimenId: 'SPC-1001A', accepted: true },
        { specimenId: 'SPC-1001B', accepted: true },
      ],
      orderOfDraw: ['GOLD_SST', 'LAVENDER_EDTA'],
    });
    kinds.push(engine.getObjective().kind);
    engine.centrifuge('BMP', { balanced: true, rpm: 3000, minutes: 10, success: true });
    kinds.push(engine.getObjective().kind);
    engine.aliquot('BMP', { volumeUl: 500, attempts: 1, success: true });
    kinds.push(engine.getObjective().kind);
    engine.loadAnalyzer('CHEM');
    kinds.push(engine.getObjective().kind);
    engine.runAnalyzer('CHEM');
    kinds.push(engine.getObjective().kind);
    engine.loadAnalyzer('HEMA');
    kinds.push(engine.getObjective().kind);
    engine.runAnalyzer('HEMA');
    kinds.push(engine.getObjective().kind);
    engine.reviewOrder();
    kinds.push(engine.getObjective().kind);
    engine.reportCritical('BMP', 'K');
    kinds.push(engine.getObjective().kind);
    engine.releaseTest('BMP');
    kinds.push(engine.getObjective().kind);
    engine.releaseTest('CBC');
    kinds.push(engine.getObjective().kind);
    expect(kinds).toEqual([
      'receive',
      'accession',
      'centrifuge',
      'aliquot',
      'load',
      'run',
      'load',
      'run',
      'review',
      'review',
      'release',
      'release',
      'close',
    ]);
  });
});
