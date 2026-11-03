import type { AnalyzerId, AnalyteDef, Flag, RefRange, Sex, TestCode, TubeType } from './types';

export function refFor(analyte: AnalyteDef, sex: Sex): RefRange {
  const ref = analyte.ref;
  if ('female' in ref) return sex === 'F' ? ref.female : ref.male;
  return ref;
}

/** Critical checks come first, with explicit inclusivity; then ordinary L/H flags. */
export function flagFor(analyte: AnalyteDef, value: number, sex: Sex): Flag {
  if (analyte.criticalLow !== undefined) {
    const isCritical = analyte.criticalLowInclusive ? value <= analyte.criticalLow : value < analyte.criticalLow;
    if (isCritical) return 'C';
  }
  if (analyte.criticalHigh !== undefined) {
    const isCritical = analyte.criticalHighInclusive ? value >= analyte.criticalHigh : value > analyte.criticalHigh;
    if (isCritical) return 'C';
  }
  const ref = refFor(analyte, sex);
  if (value < ref.low) return 'L';
  if (value > ref.high) return 'H';
  return null;
}

export function tubeLabel(tube: TubeType): string {
  switch (tube) {
    case 'GOLD_SST':
      return 'Gold SST (serum)';
    case 'LAVENDER_EDTA':
      return 'Lavender EDTA (whole blood)';
    case 'LIGHT_BLUE_CITRATE':
      return 'Light blue citrate (plasma)';
  }
}

/** Short names used inside objective sentences. */
export function tubeShort(tube: TubeType): string {
  switch (tube) {
    case 'GOLD_SST':
      return 'gold SST';
    case 'LAVENDER_EDTA':
      return 'lavender EDTA';
    case 'LIGHT_BLUE_CITRATE':
      return 'light blue citrate';
  }
}

export function tubeColor(tube: TubeType): number {
  switch (tube) {
    case 'GOLD_SST':
      return 0xd9b44a;
    case 'LAVENDER_EDTA':
      return 0x9b7fd4;
    case 'LIGHT_BLUE_CITRATE':
      return 0x5cc8e8;
  }
}

export function tubeCssColor(tube: TubeType): string {
  return `#${tubeColor(tube).toString(16).padStart(6, '0')}`;
}

const ANALYZER_BY_TEST: Record<TestCode, AnalyzerId> = {
  BMP: 'CHEM',
  CBC: 'HEMA',
  PT_INR: 'COAG',
};

export function analyzerFor(test: TestCode): AnalyzerId {
  return ANALYZER_BY_TEST[test];
}

export function analyzerLabel(id: AnalyzerId): string {
  switch (id) {
    case 'CHEM':
      return 'CHEM';
    case 'HEMA':
      return 'HEMA';
    case 'COAG':
      return 'COAG';
  }
}

/** CLSI order of draw for the three tube types used in this build. */
export const TUBE_ORDER: Record<TubeType, number> = {
  LIGHT_BLUE_CITRATE: 0,
  GOLD_SST: 1,
  LAVENDER_EDTA: 2,
};

export function correctOrderOfDraw(tubes: readonly TubeType[]): TubeType[] {
  return [...tubes].sort((a, b) => TUBE_ORDER[a] - TUBE_ORDER[b]);
}
