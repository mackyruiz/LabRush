import type { Grade, Metrics } from '../types';

export type PenaltyCode =
  | 'wrong_order_of_draw'
  | 'unbalanced_rotor'
  | 'wrong_spin_preset'
  | 'pipette_miss_small'
  | 'pipette_miss_large'
  | 'accept_failed_qc'
  | 'false_qc_flag'
  | 'wrong_callback_step'
  | 'out_of_scope_diff'
  | 'accept_label_mismatch'
  | 'reject_valid_specimen';

export interface PenaltyDef {
  accuracy: number;
  integrity: number;
  message: string;
  maxPerOrder?: number;
}

export const PENALTIES: Record<PenaltyCode, PenaltyDef> = {
  wrong_order_of_draw: {
    accuracy: 10,
    integrity: 0,
    message: 'Wrong order of draw. CLSI order is citrate, then serum, then EDTA.',
  },
  unbalanced_rotor: {
    accuracy: 10,
    integrity: 0,
    message: 'Centrifuge rotor was unbalanced. Tubes must sit opposite each other.',
  },
  wrong_spin_preset: {
    accuracy: 10,
    integrity: 0,
    message: 'Wrong spin preset for the tube type.',
  },
  pipette_miss_small: {
    accuracy: 5,
    integrity: 0,
    message: 'Aliquot volume was off by 25–50 µL.',
    maxPerOrder: 3,
  },
  pipette_miss_large: {
    accuracy: 8,
    integrity: 0,
    message: 'Aliquot was off by more than 50 µL and the cup was rejected.',
    maxPerOrder: 3,
  },
  accept_failed_qc: {
    accuracy: 25,
    integrity: 0,
    message: 'Accepted a control that violated 1_3s. Patient results from that run are invalid.',
  },
  false_qc_flag: {
    accuracy: 10,
    integrity: 0,
    message: 'Flagged a control point that was within limits.',
  },
  wrong_callback_step: {
    accuracy: 10,
    integrity: 0,
    message: 'A critical-value callback step was incomplete.',
    maxPerOrder: 3,
  },
  out_of_scope_diff: {
    accuracy: 15,
    integrity: 0,
    message: 'Attempted a manual WBC differential, which is outside California MLT scope.',
  },
  accept_label_mismatch: {
    accuracy: 0,
    integrity: 30,
    message: 'Accepted a specimen whose label did not match the requisition.',
  },
  reject_valid_specimen: {
    accuracy: 0,
    integrity: 15,
    message: 'Rejected a specimen that was correctly labeled and adequately filled.',
  },
};

/** 100 at or under goodSec, linear to 0 at badSec, clamped. */
export function tatScore(elapsedSec: number, goodSec = 240, badSec = 480): number {
  if (!Number.isFinite(elapsedSec)) return 0;
  if (elapsedSec <= goodSec) return 100;
  if (elapsedSec >= badSec) return 0;
  return Math.round(((badSec - elapsedSec) / (badSec - goodSec)) * 100);
}

export function gradeFor(overall: number): Grade {
  if (overall >= 90) return 'A';
  if (overall >= 80) return 'B';
  if (overall >= 70) return 'C';
  return 'D';
}

export function starsFor(score: number): number {
  if (score >= 90) return 3;
  if (score >= 75) return 2;
  return 1;
}

export function metricsFrom(
  penalties: readonly { accuracy: number; integrity: number }[],
  closedTatScores: readonly number[],
): Metrics {
  const accuracyPenalty = penalties.reduce((sum, p) => sum + p.accuracy, 0);
  const integrityPenalty = penalties.reduce((sum, p) => sum + p.integrity, 0);
  const accuracy = Math.max(0, Math.min(100, 100 - accuracyPenalty));
  const integrity = Math.max(0, Math.min(100, 100 - integrityPenalty));
  const tat =
    closedTatScores.length === 0
      ? 100
      : Math.max(0, Math.min(100, Math.round(closedTatScores.reduce((a, b) => a + b, 0) / closedTatScores.length)));
  const overall = Math.round((0.5 * accuracy + 0.3 * tat + 0.2 * integrity) * 10) / 10;
  return { accuracy, integrity, tat, overall };
}
