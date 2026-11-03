import type { AnalyteDef, ShiftDef, TestCode, TestDef, TubeType, RefRange } from '../types';
import { refFor } from '../rules';

const TUBES: TubeType[] = ['GOLD_SST', 'LAVENDER_EDTA', 'LIGHT_BLUE_CITRATE'];

function fail(message: string): never {
  throw new Error(`Invalid shift: ${message}`);
}

function checkRange(where: string, range: RefRange): void {
  if (!Number.isFinite(range.low) || !Number.isFinite(range.high)) fail(`${where}: reference range is not finite`);
  if (range.low >= range.high) fail(`${where}: reference low must be below high`);
}

function checkAnalyte(where: string, analyte: AnalyteDef): void {
  if (!analyte.key) fail(`${where}: analyte has no key`);
  if (!analyte.name) fail(`${where}.${analyte.key}: analyte has no name`);
  if (!analyte.unit) fail(`${where}.${analyte.key}: analyte has no unit`);
  const ref = analyte.ref;
  if ('female' in ref) {
    checkRange(`${where}.${analyte.key}.female`, ref.female);
    checkRange(`${where}.${analyte.key}.male`, ref.male);
  } else {
    checkRange(`${where}.${analyte.key}`, ref);
  }
  for (const [label, value] of [
    ['criticalLow', analyte.criticalLow],
    ['criticalHigh', analyte.criticalHigh],
  ] as const) {
    if (value !== undefined && !Number.isFinite(value)) fail(`${where}.${analyte.key}: ${label} is not finite`);
  }
  if (analyte.criticalLow !== undefined && analyte.criticalHigh !== undefined && analyte.criticalLow >= analyte.criticalHigh) {
    fail(`${where}.${analyte.key}: critical thresholds are inverted`);
  }
  const lowRef = 'female' in ref ? Math.min(ref.female.low, ref.male.low) : ref.low;
  const highRef = 'female' in ref ? Math.max(ref.female.high, ref.male.high) : ref.high;
  if (analyte.criticalLow !== undefined && analyte.criticalLow > lowRef) {
    fail(`${where}.${analyte.key}: criticalLow overlaps the reference range`);
  }
  if (analyte.criticalHigh !== undefined) {
    if (analyte.criticalHigh < highRef) fail(`${where}.${analyte.key}: criticalHigh overlaps the reference range`);
  }
}

export function validateShift(shift: ShiftDef, tests: Record<TestCode, TestDef>): void {
  if (!shift.orders.length) fail('shift has no orders');

  for (const test of Object.values(tests)) {
    if (!TUBES.includes(test.tube)) fail(`test ${test.code}: unknown tube ${String(test.tube)}`);
    if (!Number.isFinite(test.minFillMl) || test.minFillMl <= 0) fail(`test ${test.code}: minFillMl must be positive`);
    if (test.centrifuge && (!Number.isFinite(test.centrifugeMinutes) || test.centrifugeMinutes <= 0)) {
      fail(`test ${test.code}: centrifugeMinutes must be positive`);
    }
    if (!test.analytes.length) fail(`test ${test.code}: has no analytes`);
    for (const analyte of test.analytes) checkAnalyte(`test ${test.code}`, analyte);
    // exercising refFor keeps sex-specific definitions honest
    refFor(test.analytes[0], 'F');
    refFor(test.analytes[0], 'M');
  }

  const orderIds = new Set<string>();
  for (const order of shift.orders) {
    if (orderIds.has(order.id)) fail(`duplicate order id ${order.id}`);
    orderIds.add(order.id);
    if (!order.tests.length) fail(`order ${order.id}: has no tests`);
    const seenTests = new Set<TestCode>();
    for (const test of order.tests) {
      if (seenTests.has(test)) fail(`order ${order.id}: duplicate test ${test}`);
      seenTests.add(test);
      if (!tests[test]) fail(`order ${order.id}: test ${test} has no definition`);
      const specimens = order.specimens.filter((s) => s.test === test);
      if (specimens.length !== 1) fail(`order ${order.id}: test ${test} must have exactly one specimen`);
    }

    const specimenIds = new Set<string>();
    for (const specimen of order.specimens) {
      if (specimenIds.has(specimen.id)) fail(`order ${order.id}: duplicate specimen ${specimen.id}`);
      specimenIds.add(specimen.id);
      if (!order.tests.includes(specimen.test)) fail(`order ${order.id}: specimen ${specimen.id} test ${specimen.test} is not in the order`);
      const def = tests[specimen.test];
      if (!def) fail(`order ${order.id}: specimen ${specimen.id} has no test definition`);
      if (specimen.tube !== def.tube) fail(`order ${order.id}: specimen ${specimen.id} tube does not match ${specimen.test}`);
      if (!Number.isFinite(specimen.fillMl) || specimen.fillMl <= 0) fail(`order ${order.id}: specimen ${specimen.id} fill must be positive`);

      const labelMatches =
        specimen.label.name === order.patient.name &&
        specimen.label.dob === order.patient.dob &&
        specimen.label.mrn === order.patient.mrn;
      if (specimen.labelMismatch === true && labelMatches) {
        fail(`order ${order.id}: specimen ${specimen.id} is flagged as a mismatch but the label matches`);
      }
      if (specimen.labelMismatch !== true && !labelMatches) {
        fail(`order ${order.id}: specimen ${specimen.id} label differs from the patient but is not flagged`);
      }

      const expectedRejection = specimen.labelMismatch === true || specimen.fillMl < def.minFillMl;
      const results = order.results[specimen.test];
      if (!expectedRejection && !results) fail(`order ${order.id}: test ${specimen.test} has no results`);
      if (results) {
        for (const [key, value] of Object.entries(results)) {
          const analyte = def.analytes.find((a) => a.key === key);
          if (!analyte) fail(`order ${order.id}: unknown analyte ${key} for ${specimen.test}`);
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            fail(`order ${order.id}: analyte ${key} for ${specimen.test} is not finite`);
          }
        }
      }
    }
  }

  if (!shift.qc.length) fail('shift has no QC definitions');
  const analyzers = new Set<string>();
  for (const qc of shift.qc) {
    if (analyzers.has(qc.analyzer)) fail(`QC analyzer ${qc.analyzer} is duplicated`);
    analyzers.add(qc.analyzer);
    if (!qc.levels.length) fail(`QC ${qc.analyzer}: has no levels`);
    for (const level of qc.levels) {
      if (!Number.isFinite(level.sd)) fail(`QC ${qc.analyzer}: level ${level.level} SD is not finite`);
    }
    if (qc.fail) {
      if (!qc.repeat) fail(`QC ${qc.analyzer}: a failing level has no repeat`);
      if (!qc.levels.some((l) => l.level === qc.fail?.level)) fail(`QC ${qc.analyzer}: failing level is not defined`);
    }
    if (qc.repeat) {
      if (!qc.levels.some((l) => l.level === qc.repeat?.level)) fail(`QC ${qc.analyzer}: repeat level is not defined`);
      if (!Number.isFinite(qc.repeat.sd)) fail(`QC ${qc.analyzer}: repeat SD is not finite`);
    }
  }

  if (!shift.quiz.length) fail('shift has no quiz questions');
  const quizIds = new Set<string>();
  for (const question of shift.quiz) {
    if (quizIds.has(question.id)) fail(`quiz question ${question.id} is duplicated`);
    quizIds.add(question.id);
    if (!question.prompt) fail(`quiz question ${question.id} has no prompt`);
    if (question.options.length !== 3) fail(`quiz question ${question.id} must have exactly three options`);
    const correct = question.options.filter((o) => o.correct).length;
    if (correct !== 1) fail(`quiz question ${question.id} must have exactly one correct option`);
    for (const option of question.options) {
      if (!option.text || !option.explanation) fail(`quiz question ${question.id} has an incomplete option`);
    }
  }
}
