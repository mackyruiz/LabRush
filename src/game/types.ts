export type TestCode = 'BMP' | 'CBC' | 'PT_INR';
export type TubeType = 'GOLD_SST' | 'LAVENDER_EDTA' | 'LIGHT_BLUE_CITRATE';
export type AnalyzerId = 'CHEM' | 'HEMA' | 'COAG';
export type Priority = 'STAT' | 'ROUTINE';
export type Sex = 'F' | 'M';
export type RejectReason = 'label_mismatch' | 'short_draw' | 'wrong_tube';
export type Flag = 'L' | 'H' | 'C' | null;
export type Grade = 'A' | 'B' | 'C' | 'D';
export type ShiftStatus = 'idle' | 'qc' | 'active' | 'complete';
export type StationId =
  | 'receiving'
  | 'accession'
  | 'qc'
  | 'centrifuge'
  | 'aliquot'
  | 'chem'
  | 'hema'
  | 'coag'
  | 'microscope'
  | 'report'
  | 'cls'
  | 'fridge'
  | 'biohazard'
  | 'eyewash'
  | 'printer';

export interface RefRange {
  low: number;
  high: number;
}
export interface AnalyteDef {
  key: string;
  name: string;
  unit: string;
  ref: RefRange | { female: RefRange; male: RefRange };
  criticalLow?: number;
  criticalLowInclusive?: boolean;
  criticalHigh?: number;
  criticalHighInclusive?: boolean;
  note?: string;
}
export interface TestDef {
  code: TestCode;
  name: string;
  tube: TubeType;
  analyzer: AnalyzerId;
  centrifuge: boolean;
  centrifugeMinutes: number;
  aliquot: boolean;
  minFillMl: number;
  analytes: AnalyteDef[];
}
export interface PatientDef {
  name: string;
  age: number;
  sex: Sex;
  dob: string;
  mrn: string;
  location: string;
}
export interface LabelDef {
  name: string;
  dob: string;
  mrn: string;
}
export interface SpecimenDef {
  id: string;
  test: TestCode;
  tube: TubeType;
  fillMl: number;
  label: LabelDef;
  labelMismatch?: boolean;
}
export interface OrderDef {
  id: string;
  patient: PatientDef;
  priority: Priority;
  tests: TestCode[];
  specimens: SpecimenDef[];
  results: Partial<Record<TestCode, Record<string, number>>>;
  note: string;
}
export interface QcDef {
  analyzer: AnalyzerId;
  levels: { level: number; sd: number }[];
  fail?: { level: number; rule: '1_3s' };
  repeat?: { level: number; sd: number };
}
export interface QuizOption {
  text: string;
  correct: boolean;
  explanation: string;
}
export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
}
export interface LawCard {
  id: string;
  title: string;
  body: string;
  source: string;
}
export interface ShiftDef {
  id: string;
  title: string;
  intro: string;
  orders: OrderDef[];
  qc: QcDef[];
  quiz: QuizQuestion[];
}

export interface AccessionDecision {
  specimenId: string;
  accepted: boolean;
  reason?: RejectReason;
}
export interface AccessionResult {
  decisions: AccessionDecision[];
  orderOfDraw?: string[];
}
export interface CentrifugeResult {
  balanced: boolean;
  rpm: number;
  minutes: number;
  success: boolean;
}
export interface PipetteResult {
  volumeUl: number;
  attempts: number;
  success: boolean;
}
export interface QcResult {
  cleared: Record<AnalyzerId, boolean>;
  flagged: { analyzer: AnalyzerId; level: number; rule: '1_3s' | '2_2s' }[];
}

export type ObjectiveKind =
  | 'qc'
  | 'receive'
  | 'accession'
  | 'reject'
  | 'centrifuge'
  | 'aliquot'
  | 'load'
  | 'run'
  | 'review'
  | 'release'
  | 'close'
  | 'complete';

export interface Objective {
  kind: ObjectiveKind;
  text: string;
  station: StationId;
  orderId?: string;
}

export type SpecimenStatus =
  | 'collected'
  | 'accessioned'
  | 'rejected'
  | 'centrifuged'
  | 'aliquoted'
  | 'loaded'
  | 'analyzed';

export interface SpecimenView {
  id: string;
  test: TestCode;
  tube: TubeType;
  fillMl: number;
  label: LabelDef;
  labelMismatch: boolean;
  status: SpecimenStatus;
  accessioned: boolean;
  rejected: boolean;
  reason?: RejectReason;
  centrifuged: boolean;
  aliquoted: boolean;
  loaded: boolean;
  analyzed: boolean;
}
export interface TestStateView {
  test: TestCode;
  specimenId: string | null;
  results: Record<string, number> | null;
  criticals: string[];
  criticalReported: string[];
  released: boolean;
  recollect: boolean;
  rejected: boolean;
  comment: string | null;
}
export interface OrderView {
  id: string;
  patient: PatientDef;
  priority: Priority;
  tests: TestCode[];
  note: string;
  specimens: SpecimenView[];
  testStates: TestStateView[];
  closed: boolean;
  started: boolean;
  tatSec: number | null;
}
export interface Metrics {
  accuracy: number;
  integrity: number;
  tat: number;
  overall: number;
}
export interface OrderSummary {
  id: string;
  patient: string;
  tests: TestCode[];
  released: TestCode[];
  recollect: TestCode[];
  tatSec: number | null;
  closed: boolean;
}
export interface PenaltyRecord {
  code: string;
  message: string;
  orderId: string;
  at: number;
}
export interface Snapshot {
  status: ShiftStatus;
  qc: Record<AnalyzerId, { cleared: boolean }>;
  qcComplete: boolean;
  activeOrder: OrderView | null;
  objective: Objective;
  metrics: Metrics;
  orderSummaries: OrderSummary[];
  journalUnlocked: string[];
  ordersRemaining: number;
  orderIndex: number;
  elapsedSec: number;
  paused: boolean;
  penalties: PenaltyRecord[];
}
