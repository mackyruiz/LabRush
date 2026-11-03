import { describe, expect, it } from 'vitest';
import { SHIFT_01 } from '../src/game/content/shift01';
import { TESTS } from '../src/game/content/tests';
import { validateShift } from '../src/game/content/validate';
import type { ShiftDef } from '../src/game/types';

function copy(): ShiftDef {
  return JSON.parse(JSON.stringify(SHIFT_01)) as ShiftDef;
}

describe('SHIFT_01 content', () => {
  it('passes validation', () => {
    expect(() => validateShift(SHIFT_01, TESTS)).not.toThrow();
  });

  it('has three orders with the required cases', () => {
    expect(SHIFT_01.orders.map((o) => o.patient.name)).toEqual(['Rosa Delgado', 'Marcus Lee', 'Aisha Patel']);
    const third = SHIFT_01.orders[2];
    const mismatch = third.specimens.find((s) => s.test === 'BMP');
    expect(mismatch?.label.dob).toBe('1998-04-12');
    expect(third.patient.dob).toBe('1997-04-12');
    expect(mismatch?.labelMismatch).toBe(true);
  });

  it('rejects an unknown test', () => {
    const shift = copy();
    (shift.orders[0].tests as string[]).push('LIPID');
    expect(() => validateShift(shift, TESTS)).toThrow(/no definition/);
  });

  it('rejects a specimen tube that does not match its test', () => {
    const shift = copy();
    shift.orders[0].specimens[0].tube = 'LAVENDER_EDTA';
    expect(() => validateShift(shift, TESTS)).toThrow(/tube does not match/);
  });

  it('rejects missing results when the specimen is not an expected rejection', () => {
    const shift = copy();
    delete shift.orders[0].results.BMP;
    expect(() => validateShift(shift, TESTS)).toThrow(/has no results/);
  });

  it('rejects an unknown analyte', () => {
    const shift = copy();
    shift.orders[0].results.BMP = { K: 6.4, Mystery: 1 };
    expect(() => validateShift(shift, TESTS)).toThrow(/unknown analyte/);
  });

  it('rejects a non-finite result', () => {
    const shift = copy();
    shift.orders[0].results.BMP = { K: Number.NaN };
    expect(() => validateShift(shift, TESTS)).toThrow(/not finite/);
  });

  it('rejects a mismatch flag on an identical label', () => {
    const shift = copy();
    shift.orders[0].specimens[0].labelMismatch = true;
    expect(() => validateShift(shift, TESTS)).toThrow(/flagged as a mismatch but the label matches/);
  });

  it('rejects a differing label that is not flagged', () => {
    const shift = copy();
    shift.orders[2].specimens[1].labelMismatch = false;
    expect(() => validateShift(shift, TESTS)).toThrow(/not flagged/);
  });

  it('rejects inverted reference ranges', () => {
    const shift = copy();
    shift.orders[0].results.BMP = { ...SHIFT_01.orders[0].results.BMP };
    const tests = JSON.parse(JSON.stringify(TESTS)) as typeof TESTS;
    tests.BMP.analytes[0].ref = { low: 150, high: 100 };
    expect(() => validateShift(shift, tests)).toThrow(/reference low must be below high/);
  });

  it('rejects a QC failure without a repeat', () => {
    const shift = copy();
    delete shift.qc[2].repeat;
    expect(() => validateShift(shift, TESTS)).toThrow(/no repeat/);
  });

  it('rejects duplicate QC analyzers', () => {
    const shift = copy();
    shift.qc.push({ analyzer: 'CHEM', levels: [{ level: 1, sd: 0 }] });
    expect(() => validateShift(shift, TESTS)).toThrow(/duplicated/);
  });

  it('rejects a quiz question without exactly one correct option', () => {
    const shift = copy();
    shift.quiz[0].options[1].correct = true;
    expect(() => validateShift(shift, TESTS)).toThrow(/exactly one correct/);
  });
});
