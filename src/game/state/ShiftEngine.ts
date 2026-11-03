import type {
  AccessionResult,
  AnalyzerId,
  CentrifugeResult,
  Metrics,
  Objective,
  OrderDef,
  OrderSummary,
  OrderView,
  PenaltyRecord,
  PipetteResult,
  QcResult,
  RejectReason,
  ShiftDef,
  ShiftStatus,
  Snapshot,
  SpecimenDef,
  SpecimenStatus,
  SpecimenView,
  TestCode,
  TestDef,
  TestStateView,
} from '../types';
import { analyzerFor, correctOrderOfDraw, flagFor, tubeShort } from '../rules';
import { metricsFrom, PENALTIES, tatScore, type PenaltyCode } from './Scoring';
import type { SaveStore } from './SaveStore';

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export interface EngineOptions {
  clock?: Clock;
  save?: SaveStore;
}

interface SpecimenRuntime {
  def: SpecimenDef;
  decided: boolean;
  accepted: boolean;
  rejected: boolean;
  reason?: RejectReason;
  centrifuged: boolean;
  aliquoted: boolean;
  loaded: boolean;
  analyzed: boolean;
}

interface TestRuntime {
  test: TestCode;
  specimenId: string;
  results: Record<string, number> | null;
  criticalReported: string[];
  released: boolean;
  recollect: boolean;
  comment: string | null;
}

interface OrderRuntime {
  def: OrderDef;
  specimens: SpecimenRuntime[];
  tests: TestRuntime[];
  accessioned: boolean;
  reviewed: boolean;
  closed: boolean;
  startedAt: number | null;
  endedAt: number | null;
  pausedMs: number;
  tatSec: number | null;
}

export interface ActionResult {
  ok: boolean;
  reason?: string;
}

const TEST_LABEL: Record<TestCode, string> = { BMP: 'BMP', CBC: 'CBC', PT_INR: 'PT/INR' };
const ANALYZER_ITEM: Record<TestCode, string> = {
  BMP: 'serum cup',
  CBC: 'lavender tube',
  PT_INR: 'plasma cup',
};
const TEST_FLUID: Record<TestCode, string> = { BMP: 'serum', CBC: 'whole blood', PT_INR: 'plasma' };
const JOURNAL_FOR_TEST: Record<TestCode, string> = { BMP: 'bmp', CBC: 'cbc', PT_INR: 'pt-inr' };

/** Pure TypeScript progression authority. No Phaser import. */
export class ShiftEngine {
  private readonly def: ShiftDef;
  private readonly tests: Record<TestCode, TestDef>;
  private readonly clock: Clock;
  private readonly save?: SaveStore;

  private status: ShiftStatus = 'idle';
  private qc: Record<AnalyzerId, { cleared: boolean }> = {
    CHEM: { cleared: false },
    HEMA: { cleared: false },
    COAG: { cleared: false },
  };
  private readonly orders: OrderRuntime[];
  private activeOrderId: string | null = null;
  private orderIndex = 0;
  private readonly penalties: PenaltyRecord[] = [];
  private readonly penaltyCount = new Map<string, number>();
  private readonly journal = new Set<string>();
  private readonly listeners = new Set<(s: Snapshot) => void>();

  private paused = false;
  private pausedAt = 0;
  private shiftPausedMs = 0;

  constructor(def: ShiftDef, tests: Record<TestCode, TestDef>, options: EngineOptions = {}) {
    this.def = def;
    this.tests = tests;
    this.clock = options.clock ?? systemClock;
    this.save = options.save;
    this.orders = def.orders.map((order) => ({
      def: order,
      specimens: order.specimens.map((specimen) => ({
        def: specimen,
        decided: false,
        accepted: false,
        rejected: false,
        centrifuged: false,
        aliquoted: false,
        loaded: false,
        analyzed: false,
      })),
      tests: order.tests.map((test) => ({
        test,
        specimenId: order.specimens.find((s) => s.test === test)?.id ?? '',
        results: null,
        criticalReported: [],
        released: false,
        recollect: false,
        comment: null,
      })),
      accessioned: false,
      reviewed: false,
      closed: false,
      startedAt: null,
      endedAt: null,
      pausedMs: 0,
      tatSec: null,
    }));
  }

  // ------------------------------------------------------------------ clock

  private now(): number {
    return this.clock.now();
  }

  pauseTimer(): void {
    if (this.paused) return;
    this.paused = true;
    this.pausedAt = this.now();
    this.emit();
  }

  resumeTimer(): void {
    if (!this.paused) return;
    const delta = Math.max(0, this.now() - this.pausedAt);
    this.shiftPausedMs += delta;
    const order = this.active;
    if (order && !order.closed) order.pausedMs += delta;
    this.paused = false;
    this.emit();
  }

  isPaused(): boolean {
    return this.paused;
  }

  // -------------------------------------------------------------- lifecycle

  startShift(): void {
    this.status = 'qc';
    this.unlock(['order-of-draw', 'ca-law', 'preanalytical']);
    this.emit();
  }

  completeQc(result: QcResult): void {
    for (const id of ['CHEM', 'HEMA', 'COAG'] as AnalyzerId[]) {
      this.qc[id].cleared = result.cleared[id] === true;
    }
    if (this.qc.CHEM.cleared && this.qc.HEMA.cleared && this.qc.COAG.cleared) {
      this.status = 'active';
      this.unlock(['qc']);
    }
    this.emit();
  }

  receiveNextOrder(): void {
    if (this.status !== 'active' || this.activeOrderId !== null) return;
    const next = this.orders[this.orderIndex];
    if (!next) return;
    next.startedAt = this.now();
    this.activeOrderId = next.def.id;
    this.orderIndex += 1;
    this.emit();
  }

  accession(result: AccessionResult): void {
    const order = this.active;
    if (!order || order.closed) return;

    for (const decision of result.decisions) {
      const specimen = order.specimens.find((s) => s.def.id === decision.specimenId);
      if (!specimen || specimen.decided) continue;
      specimen.decided = true;
      if (decision.accepted) {
        specimen.accepted = true;
        if (specimen.def.labelMismatch) {
          this.penalize('accept_label_mismatch', undefined, order.def.id);
        }
      } else {
        specimen.rejected = true;
        specimen.reason = decision.reason ?? (specimen.def.labelMismatch ? 'label_mismatch' : 'wrong_tube');
        if (!specimen.def.labelMismatch) {
          this.penalize('reject_valid_specimen', undefined, order.def.id);
        }
      }
    }

    if (order.def.specimens.length >= 2 && result.orderOfDraw) {
      const tubes = order.def.specimens.map((s) => s.tube);
      const expected = correctOrderOfDraw(tubes);
      const given = result.orderOfDraw;
      const correct = given.length === expected.length && given.every((tube, i) => tube === expected[i]);
      if (!correct) {
        this.penalize('wrong_order_of_draw', undefined, order.def.id);
        this.unlock(['order-of-draw']);
      }
    }

    order.accessioned = order.specimens.every((s) => s.decided);
    this.emit();
  }

  centrifuge(test: TestCode, result: CentrifugeResult): void {
    const order = this.active;
    const tr = order?.tests.find((t) => t.test === test);
    const def = this.tests[test];
    if (!order || !tr || !def) return;
    const specimen = this.specimenFor(order, tr);
    if (!specimen || !specimen.accepted || specimen.rejected || !def.centrifuge) return;
    if (!result.balanced) {
      this.penalize('unbalanced_rotor', undefined, order.def.id);
      return;
    }
    const presetOk = result.rpm === 3000 && result.minutes === def.centrifugeMinutes;
    if (!presetOk) {
      this.penalize('wrong_spin_preset', undefined, order.def.id);
      return;
    }
    if (!result.success) return;
    specimen.centrifuged = true;
    this.emit();
  }

  aliquot(test: TestCode, result: PipetteResult): void {
    const order = this.active;
    const tr = order?.tests.find((t) => t.test === test);
    const def = this.tests[test];
    if (!order || !tr || !def) return;
    const specimen = this.specimenFor(order, tr);
    if (!specimen || !specimen.accepted || specimen.rejected || !def.aliquot) return;
    if (def.centrifuge && !specimen.centrifuged) return;
    const diff = Math.abs(result.volumeUl - 500);
    if (diff <= 25) {
      specimen.aliquoted = true;
    } else if (diff <= 50) {
      specimen.aliquoted = true;
      this.penalize('pipette_miss_small', undefined, order.def.id);
    } else {
      this.penalize('pipette_miss_large', undefined, order.def.id);
    }
    this.emit();
  }

  loadAnalyzer(analyzer: AnalyzerId): ActionResult {
    if (!this.qc[analyzer].cleared) return { ok: false, reason: 'Run morning QC first.' };
    const order = this.active;
    if (!order) return { ok: false, reason: 'No active order. Receive a sample first.' };
    const tr = order.tests.find((t) => analyzerFor(t.test) === analyzer);
    if (!tr) {
      return { ok: false, reason: `The ${analyzer} analyzer does not run a test in this order.` };
    }
    const def = this.tests[tr.test];
    const specimen = this.specimenFor(order, tr);
    if (!specimen) return { ok: false, reason: 'No specimen is linked to this test.' };
    if (tr.released || tr.recollect) return { ok: false, reason: 'This test is already complete.' };
    if (tr.results) return { ok: false, reason: 'This test has already been analyzed.' };
    if (specimen.rejected) return { ok: false, reason: 'The specimen was rejected. Request a recollect.' };
    if (specimen.def.labelMismatch && specimen.accepted) {
      return { ok: false, reason: 'Label mismatch unresolved: reject the specimen and request a recollect.' };
    }
    if (def.centrifuge && !specimen.centrifuged) {
      return { ok: false, reason: `Centrifuge the ${tubeShort(specimen.def.tube)} before loading it.` };
    }
    if (def.aliquot && !specimen.aliquoted) {
      return { ok: false, reason: `Aliquot 500 µL of ${TEST_FLUID[tr.test]} into a sample cup first.` };
    }
    specimen.loaded = true;
    this.emit();
    return { ok: true };
  }

  runAnalyzer(analyzer: AnalyzerId): ActionResult {
    if (!this.qc[analyzer].cleared) return { ok: false, reason: 'Run morning QC first.' };
    const order = this.active;
    if (!order) return { ok: false, reason: 'No active order. Receive a sample first.' };
    const tr = order.tests.find((t) => analyzerFor(t.test) === analyzer);
    if (!tr) return { ok: false, reason: `The ${analyzer} analyzer does not run a test in this order.` };
    const specimen = this.specimenFor(order, tr);
    if (!specimen) return { ok: false, reason: 'No specimen is linked to this test.' };
    if (tr.released || tr.recollect) return { ok: false, reason: 'This test is already complete.' };
    if (tr.results) return { ok: false, reason: 'This test has already been analyzed.' };
    if (specimen.rejected) return { ok: false, reason: 'The specimen was rejected. Request a recollect.' };
    if (specimen.def.labelMismatch && specimen.accepted) {
      return { ok: false, reason: 'Label mismatch unresolved: reject the specimen and request a recollect.' };
    }
    if (!specimen.loaded) return { ok: false, reason: `Load the sample on ${analyzer} first.` };
    const results = order.def.results[tr.test];
    if (!results) return { ok: false, reason: 'No validated result is configured for this sample.' };
    tr.results = { ...results };
    specimen.analyzed = true;
    this.unlock([JOURNAL_FOR_TEST[tr.test]]);
    this.emit();
    return { ok: true };
  }

  reviewOrder(): void {
    const order = this.active;
    if (!order) return;
    order.reviewed = true;
    this.emit();
  }

  setTestComment(test: TestCode, comment: string): void {
    const order = this.active;
    const tr = order?.tests.find((t) => t.test === test);
    if (!tr) return;
    tr.comment = comment;
    this.emit();
  }

  reportCritical(test: TestCode, analyte: string): void {
    const order = this.active;
    const tr = order?.tests.find((t) => t.test === test);
    if (!order || !tr || !tr.results) return;
    const def = this.tests[test];
    const analyteDef = def.analytes.find((a) => a.key === analyte);
    if (!analyteDef) return;
    const value = tr.results[analyte];
    if (value === undefined) return;
    if (flagFor(analyteDef, value, order.def.patient.sex) !== 'C') return;
    if (!tr.criticalReported.includes(analyte)) {
      tr.criticalReported.push(analyte);
      this.unlock(['critical-values']);
      this.emit();
    }
  }

  releaseTest(test: TestCode): ActionResult {
    const order = this.active;
    if (!order) return { ok: false, reason: 'No active order.' };
    const tr = order.tests.find((t) => t.test === test);
    if (!tr) return { ok: false, reason: 'That test is not part of this order.' };
    const def = this.tests[test];
    const specimen = this.specimenFor(order, tr);
    if (!specimen) return { ok: false, reason: 'No specimen is linked to this test.' };
    if (tr.released) return { ok: false, reason: 'This result is already released.' };
    if (tr.recollect) return { ok: false, reason: 'A recollect was requested for this test.' };
    if (specimen.rejected) return { ok: false, reason: 'Specimen rejected. Request a recollect.' };
    if (!tr.results) return { ok: false, reason: 'There is no result to release yet.' };
    if (specimen.def.labelMismatch && specimen.accepted) {
      return { ok: false, reason: 'Resolve the label mismatch before releasing.' };
    }
    if (!this.qc[def.analyzer].cleared) return { ok: false, reason: 'QC is not cleared for this analyzer.' };
    const unreported = tr.results
      ? Object.entries(tr.results)
          .filter(([key, value]) => {
            const a = def.analytes.find((x) => x.key === key);
            return a ? flagFor(a, value, order.def.patient.sex) === 'C' : false;
          })
          .map(([key]) => key)
          .filter((key) => !tr.criticalReported.includes(key))
      : [];
    if (unreported.length) {
      return {
        ok: false,
        reason: `Report the critical ${unreported.join(' and ')} before releasing.`,
      };
    }
    tr.released = true;
    this.emit();
    return { ok: true };
  }

  requestRecollect(test: TestCode, reason?: RejectReason): ActionResult {
    const order = this.active;
    if (!order) return { ok: false, reason: 'No active order.' };
    const tr = order.tests.find((t) => t.test === test);
    if (!tr) return { ok: false, reason: 'That test is not part of this order.' };
    const specimen = this.specimenFor(order, tr);
    if (!specimen) return { ok: false, reason: 'No specimen is linked to this test.' };
    if (tr.recollect) return { ok: false, reason: 'A recollect was already requested.' };
    if (specimen.rejected) {
      tr.recollect = true;
      if (reason) specimen.reason = reason;
      this.emit();
      return { ok: true };
    }
    if (specimen.def.labelMismatch && specimen.accepted) {
      specimen.rejected = true;
      specimen.accepted = false;
      specimen.reason = reason ?? 'label_mismatch';
      tr.recollect = true;
      this.emit();
      return { ok: true };
    }
    return { ok: false, reason: 'The specimen is valid. Release the result instead.' };
  }

  closeOrder(): ActionResult {
    const order = this.active;
    if (!order) return { ok: false, reason: 'No active order.' };
    const unfinished = order.tests.filter((t) => !t.released && !t.recollect);
    if (unfinished.length) {
      return {
        ok: false,
        reason: `Release or request a recollect for ${unfinished.map((t) => TEST_LABEL[t.test]).join(', ')} first.`,
      };
    }
    for (const tr of order.tests) {
      if (!tr.results) continue;
      const def = this.tests[tr.test];
      const unreported = Object.entries(tr.results)
        .filter(([key, value]) => {
          const a = def.analytes.find((x) => x.key === key);
          return a ? flagFor(a, value, order.def.patient.sex) === 'C' : false;
        })
        .map(([key]) => key)
        .filter((key) => !tr.criticalReported.includes(key));
      if (unreported.length) {
        return { ok: false, reason: `Report the critical ${unreported.join(' and ')} before closing.` };
      }
    }
    order.closed = true;
    order.endedAt = this.now();
    order.tatSec = this.tatSeconds(order);
    this.activeOrderId = null;
    if (this.orderIndex >= this.orders.length) this.status = 'complete';
    this.emit();
    return { ok: true };
  }

  applyPenalty(code: PenaltyCode, message: string): void {
    this.penalize(code, message, this.activeOrderId ?? 'shift');
  }

  // -------------------------------------------------------------- objectives

  getObjective(): Objective {
    if (this.status === 'idle' || this.status === 'qc') {
      const done = (['CHEM', 'HEMA', 'COAG'] as AnalyzerId[]).filter((a) => this.qc[a].cleared).length;
      return {
        kind: 'qc',
        station: 'qc',
        text:
          done === 0
            ? 'Run morning QC and accept all three analyzers'
            : `Finish morning QC (${done}/3 analyzers cleared)`,
      };
    }
    const order = this.active;
    if (!order) {
      if (this.status === 'complete') {
        return { kind: 'complete', station: 'report', text: 'Shift complete — review your scorecard' };
      }
      const next = this.orders[this.orderIndex];
      const text = next
        ? `Receive ${next.def.patient.name}'s samples at the receiving window`
        : 'Receive the next sample at the receiving window';
      return { kind: 'receive', station: 'receiving', text };
    }

    if (!order.accessioned) {
      const tubes = [...new Set(order.def.specimens.map((s) => tubeShort(s.tube)))];
      const list = tubes.length > 1 ? `${tubes.slice(0, -1).join(', ')} and ${tubes[tubes.length - 1]}` : tubes[0];
      return {
        kind: 'accession',
        station: 'accession',
        orderId: order.def.id,
        text: `Accession ${order.def.patient.name}'s ${list}`,
      };
    }

    const unresolved = order.specimens.find((s) => s.def.labelMismatch && s.accepted && !s.rejected);
    if (unresolved) {
      return {
        kind: 'reject',
        station: 'report',
        orderId: order.def.id,
        text: 'Resolve the label mismatch: reject the specimen and request a recollect',
      };
    }

    for (const tr of order.tests) {
      const specimen = this.specimenFor(order, tr);
      if (!specimen || !specimen.accepted || specimen.rejected) continue;
      const def = this.tests[tr.test];
      if (def.centrifuge && !specimen.centrifuged) {
        return {
          kind: 'centrifuge',
          station: 'centrifuge',
          orderId: order.def.id,
          text: `Balance and spin the ${tubeShort(specimen.def.tube)} (3,000 rpm × ${def.centrifugeMinutes} min)`,
        };
      }
      if (def.aliquot && !specimen.aliquoted) {
        return {
          kind: 'aliquot',
          station: 'aliquot',
          orderId: order.def.id,
          text: `Pipette 500 µL ${TEST_FLUID[tr.test]} into a sample cup`,
        };
      }
    }

    for (const tr of order.tests) {
      const specimen = this.specimenFor(order, tr);
      if (!specimen || !specimen.accepted || specimen.rejected) continue;
      if (!specimen.loaded) {
        return {
          kind: 'load',
          station: this.stationForAnalyzer(analyzerFor(tr.test)),
          orderId: order.def.id,
          text: `Load the ${ANALYZER_ITEM[tr.test]} on ${analyzerFor(tr.test)}`,
        };
      }
      if (!tr.results) {
        return {
          kind: 'run',
          station: this.stationForAnalyzer(analyzerFor(tr.test)),
          orderId: order.def.id,
          text: `Run ${TEST_LABEL[tr.test]} on ${analyzerFor(tr.test)}`,
        };
      }
    }

    const hasResult = order.tests.some((t) => t.results);
    if (hasResult && !order.reviewed) {
      return {
        kind: 'review',
        station: 'report',
        orderId: order.def.id,
        text: `Review the ${order.tests.filter((t) => t.results).map((t) => TEST_LABEL[t.test]).join(' and ')} results`,
      };
    }

    const criticals = this.unreportedCriticals(order);
    if (criticals.length) {
      const names = criticals.map((c) => this.tests[c.test].analytes.find((a) => a.key === c.analyte)?.name ?? c.analyte);
      return {
        kind: 'review',
        station: 'report',
        orderId: order.def.id,
        text: `Review results and call the critical ${names.join(' and ')}`,
      };
    }

    const pending = order.tests.filter((t) => !t.released && !t.recollect);
    if (pending.length) {
      const release = pending
        .filter((t) => {
          const s = this.specimenFor(order, t);
          return s && !s.rejected;
        })
        .map((t) => TEST_LABEL[t.test]);
      const recollect = pending.filter((t) => {
        const s = this.specimenFor(order, t);
        return !s || s.rejected;
      });
      const parts: string[] = [];
      if (release.length) parts.push(`Release ${release.join(' and ')}`);
      if (recollect.length) parts.push(`request a recollect for ${recollect.map((t) => TEST_LABEL[t.test]).join(' and ')}`);
      return {
        kind: 'release',
        station: 'report',
        orderId: order.def.id,
        text: parts.join(', then ') || 'Finish the order at the report station',
      };
    }

    return {
      kind: 'close',
      station: 'report',
      orderId: order.def.id,
      text: 'Close the order at the report station',
    };
  }

  // --------------------------------------------------------------- snapshot

  getSnapshot(): Snapshot {
    const active = this.active;
    const closedTats: number[] = [];
    for (const order of this.orders) {
      if (order.closed) closedTats.push(tatScore(this.tatSeconds(order)));
    }
    const metrics = metricsFrom(
      this.penalties.map((p) => ({
        accuracy: PENALTIES[p.code as PenaltyCode].accuracy,
        integrity: PENALTIES[p.code as PenaltyCode].integrity,
      })),
      closedTats,
    );
    return {
      status: this.status,
      qc: { CHEM: { ...this.qc.CHEM }, HEMA: { ...this.qc.HEMA }, COAG: { ...this.qc.COAG } },
      qcComplete: this.qc.CHEM.cleared && this.qc.HEMA.cleared && this.qc.COAG.cleared,
      activeOrder: active ? this.orderView(active) : null,
      objective: this.getObjective(),
      metrics,
      orderSummaries: this.orders.filter((o) => o.startedAt !== null).map((o) => this.summaryFor(o)),
      journalUnlocked: [...this.journal],
      ordersRemaining: this.orders.length - this.orderIndex,
      orderIndex: this.orderIndex,
      elapsedSec: active ? this.tatSeconds(active) : 0,
      paused: this.paused,
      penalties: this.penalties.map((p) => ({ ...p })),
    };
  }

  subscribe(fn: (snapshot: Snapshot) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  // ---------------------------------------------------------------- helpers

  get active(): OrderRuntime | null {
    if (!this.activeOrderId) return null;
    return this.orders.find((o) => o.def.id === this.activeOrderId) ?? null;
  }

  get def_(): ShiftDef {
    return this.def;
  }

  activeOrderDef(): OrderDef | null {
    return this.active?.def ?? null;
  }

  metrics(): Metrics {
    return this.getSnapshot().metrics;
  }

  private specimenFor(order: OrderRuntime, tr: TestRuntime): SpecimenRuntime | undefined {
    return order.specimens.find((s) => s.def.id === tr.specimenId);
  }

  private stationForAnalyzer(analyzer: AnalyzerId): Objective['station'] {
    switch (analyzer) {
      case 'CHEM':
        return 'chem';
      case 'HEMA':
        return 'hema';
      case 'COAG':
        return 'coag';
    }
  }

  private unreportedCriticals(order: OrderRuntime): { test: TestCode; analyte: string }[] {
    const out: { test: TestCode; analyte: string }[] = [];
    for (const tr of order.tests) {
      if (!tr.results) continue;
      const def = this.tests[tr.test];
      for (const [key, value] of Object.entries(tr.results)) {
        const analyte = def.analytes.find((a) => a.key === key);
        if (!analyte) continue;
        if (flagFor(analyte, value, order.def.patient.sex) === 'C' && !tr.criticalReported.includes(key)) {
          out.push({ test: tr.test, analyte: key });
        }
      }
    }
    return out;
  }

  private tatSeconds(order: OrderRuntime): number {
    if (order.startedAt === null) return 0;
    const end = order.endedAt ?? this.now();
    const extraPause = this.paused && !order.closed ? Math.max(0, this.now() - this.pausedAt) : 0;
    return Math.max(0, Math.round((end - order.startedAt - order.pausedMs - extraPause) / 1000));
  }

  private orderView(order: OrderRuntime): OrderView {
    return {
      id: order.def.id,
      patient: { ...order.def.patient },
      priority: order.def.priority,
      tests: [...order.def.tests],
      note: order.def.note,
      closed: order.closed,
      started: order.startedAt !== null,
      tatSec: order.closed ? this.tatSeconds(order) : null,
      specimens: order.specimens.map((s) => this.specimenView(s)),
      testStates: order.tests.map((tr) => this.testStateView(order, tr)),
    };
  }

  private specimenView(s: SpecimenRuntime): SpecimenView {
    let status: SpecimenStatus = 'collected';
    if (s.rejected) status = 'rejected';
    else if (s.analyzed) status = 'analyzed';
    else if (s.loaded) status = 'loaded';
    else if (s.aliquoted) status = 'aliquoted';
    else if (s.centrifuged) status = 'centrifuged';
    else if (s.accepted) status = 'accessioned';
    return {
      id: s.def.id,
      test: s.def.test,
      tube: s.def.tube,
      fillMl: s.def.fillMl,
      label: { ...s.def.label },
      labelMismatch: s.def.labelMismatch === true,
      status,
      accessioned: s.accepted,
      rejected: s.rejected,
      reason: s.reason,
      centrifuged: s.centrifuged,
      aliquoted: s.aliquoted,
      loaded: s.loaded,
      analyzed: s.analyzed,
    };
  }

  private testStateView(order: OrderRuntime, tr: TestRuntime): TestStateView {
    const def = this.tests[tr.test];
    const criticals = tr.results
      ? Object.entries(tr.results)
          .filter(([key, value]) => {
            const a = def.analytes.find((x) => x.key === key);
            return a ? flagFor(a, value, order.def.patient.sex) === 'C' : false;
          })
          .map(([key]) => key)
      : [];
    const specimen = this.specimenFor(order, tr);
    return {
      test: tr.test,
      specimenId: tr.specimenId,
      results: tr.results ? { ...tr.results } : null,
      criticals,
      criticalReported: [...tr.criticalReported],
      released: tr.released,
      recollect: tr.recollect,
      rejected: specimen?.rejected ?? false,
      comment: tr.comment,
    };
  }

  private summaryFor(order: OrderRuntime): OrderSummary {
    return {
      id: order.def.id,
      patient: order.def.patient.name,
      tests: [...order.def.tests],
      released: order.tests.filter((t) => t.released).map((t) => t.test),
      recollect: order.tests.filter((t) => t.recollect).map((t) => t.test),
      tatSec: order.closed ? this.tatSeconds(order) : null,
      closed: order.closed,
    };
  }

  private unlock(ids: string[]): void {
    let changed = false;
    for (const id of ids) {
      if (!this.journal.has(id)) {
        this.journal.add(id);
        changed = true;
      }
    }
    if (changed) this.save?.unlockJournal(ids);
  }

  private penalize(code: PenaltyCode, message: string | undefined, orderId: string): void {
    const def = PENALTIES[code];
    const key = `${orderId}:${code}`;
    const max = def.maxPerOrder ?? 1;
    const count = this.penaltyCount.get(key) ?? 0;
    if (count >= max) return;
    this.penaltyCount.set(key, count + 1);
    this.penalties.push({ code, message: message ?? def.message, orderId, at: this.now() });
    this.emit();
  }

  private emit(): void {
    if (!this.listeners.size) return;
    const snapshot = this.getSnapshot();
    for (const fn of this.listeners) fn(snapshot);
  }
}
