import { describe, expect, it } from 'vitest';
import { TESTS } from '../src/game/content/tests';
import { analyzerFor, correctOrderOfDraw, flagFor, refFor, tubeColor, tubeLabel } from '../src/game/rules';
import type { AnalyteDef } from '../src/game/types';

const analyte = (test: 'BMP' | 'CBC' | 'PT_INR', key: string): AnalyteDef => {
  const found = TESTS[test].analytes.find((a) => a.key === key);
  if (!found) throw new Error(`missing ${test}.${key}`);
  return found;
};

describe('flagFor', () => {
  it('flags a critical potassium above 6.1', () => {
    expect(flagFor(analyte('BMP', 'K'), 6.4, 'F')).toBe('C');
  });

  it('treats exactly 6.1 as a high, not a critical', () => {
    expect(flagFor(analyte('BMP', 'K'), 6.1, 'F')).toBe('H');
    expect(flagFor(analyte('BMP', 'K'), 6.2, 'F')).toBe('C');
  });

  it('honors inclusive critical thresholds for INR', () => {
    expect(flagFor(analyte('PT_INR', 'INR'), 5.0, 'M')).toBe('C');
    expect(flagFor(analyte('PT_INR', 'INR'), 4.99, 'M')).toBe('H');
  });

  it('treats hemoglobin 7.0 as low, not critical', () => {
    expect(flagFor(analyte('CBC', 'Hgb'), 7.0, 'F')).toBe('L');
    expect(flagFor(analyte('CBC', 'Hgb'), 6.9, 'F')).toBe('C');
  });

  it('honors inclusive low and high criticals for platelets and WBC', () => {
    expect(flagFor(analyte('CBC', 'PLT'), 20, 'M')).toBe('C');
    expect(flagFor(analyte('CBC', 'PLT'), 1000, 'M')).toBe('C');
    expect(flagFor(analyte('CBC', 'WBC'), 2.0, 'M')).toBe('C');
    expect(flagFor(analyte('CBC', 'WBC'), 40, 'M')).toBe('C');
    expect(flagFor(analyte('CBC', 'WBC'), 40.1, 'M')).toBe('C');
  });

  it('returns null inside the reference interval', () => {
    expect(flagFor(analyte('BMP', 'Na'), 140, 'F')).toBeNull();
    expect(flagFor(analyte('BMP', 'Glucose'), 238, 'F')).toBe('H');
  });
});

describe('refFor', () => {
  it('selects sex-specific ranges', () => {
    const hgb = analyte('CBC', 'Hgb');
    expect(refFor(hgb, 'F')).toEqual({ low: 12.0, high: 16.0 });
    expect(refFor(hgb, 'M')).toEqual({ low: 13.5, high: 17.5 });
  });

  it('returns a shared range for non-sex-specific analytes', () => {
    expect(refFor(analyte('BMP', 'K'), 'F')).toEqual(refFor(analyte('BMP', 'K'), 'M'));
  });
});

describe('labels and analyzers', () => {
  it('names and colors tubes', () => {
    expect(tubeLabel('GOLD_SST')).toBe('Gold SST (serum)');
    expect(tubeLabel('LAVENDER_EDTA')).toBe('Lavender EDTA (whole blood)');
    expect(tubeLabel('LIGHT_BLUE_CITRATE')).toBe('Light blue citrate (plasma)');
    expect(tubeColor('GOLD_SST')).toBe(0xd9b44a);
    expect(tubeColor('LAVENDER_EDTA')).toBe(0x9b7fd4);
    expect(tubeColor('LIGHT_BLUE_CITRATE')).toBe(0x5cc8e8);
  });

  it('maps tests to analyzers', () => {
    expect(analyzerFor('BMP')).toBe('CHEM');
    expect(analyzerFor('CBC')).toBe('HEMA');
    expect(analyzerFor('PT_INR')).toBe('COAG');
  });

  it('orders tubes per CLSI', () => {
    expect(correctOrderOfDraw(['LAVENDER_EDTA', 'GOLD_SST'])).toEqual(['GOLD_SST', 'LAVENDER_EDTA']);
    expect(correctOrderOfDraw(['LAVENDER_EDTA', 'GOLD_SST', 'LIGHT_BLUE_CITRATE'])).toEqual([
      'LIGHT_BLUE_CITRATE',
      'GOLD_SST',
      'LAVENDER_EDTA',
    ]);
  });
});
