import type { QuizQuestion } from '../types';

export const QUIZ: QuizQuestion[] = [
  {
    id: 'order-of-draw',
    prompt: 'You have a light blue citrate, a gold SST, and a lavender EDTA tube to draw. What is the CLSI order of draw?',
    options: [
      {
        text: 'Light blue citrate → gold SST → lavender EDTA',
        correct: true,
        explanation: 'Citrate is drawn first to avoid additive carryover into coagulation testing; EDTA is last because it chelates calcium.',
      },
      {
        text: 'Gold SST → light blue citrate → lavender EDTA',
        correct: false,
        explanation: 'Serum tubes come after citrate. Drawing citrate after serum risks clot activation and additive carryover.',
      },
      {
        text: 'Lavender EDTA → light blue citrate → gold SST',
        correct: false,
        explanation: 'EDTA is drawn last in this set: its calcium chelation would contaminate the chemistry and coagulation samples.',
      },
    ],
  },
  {
    id: 'critical-k',
    prompt: 'A BMP returns potassium 6.4 mmol/L (critical high 6.1). What do you do?',
    options: [
      {
        text: 'Notify the provider immediately, give the result, obtain read-back, and document',
        correct: true,
        explanation: 'Critical values are called immediately: identify yourself, state the test and value, obtain read-back, and document the call.',
      },
      {
        text: 'Repeat the sample tomorrow and release the result now',
        correct: false,
        explanation: 'A critical potassium is a patient-safety event. It cannot wait for tomorrow, and releasing without notification is unsafe.',
      },
      {
        text: 'Post it to the chart and let the provider read it later',
        correct: false,
        explanation: 'A chart note is not a critical-value notification. Call, read back, and document.',
      },
    ],
  },
  {
    id: 'ca-scope',
    prompt: 'Which task is outside the scope of a California-licensed MLT?',
    options: [
      {
        text: 'Manual leukocyte differential',
        correct: true,
        explanation: '17 CCR §1030.6 allows blood-smear review other than manual leukocyte differentials. Escalate the manual diff to the CLS.',
      },
      {
        text: 'Coagulation testing (PT/INR)',
        correct: false,
        explanation: 'Coagulation is expressly within MLT scope under §1030.6.',
      },
      {
        text: 'RBC morphology review',
        correct: false,
        explanation: 'Blood-smear review other than the manual WBC differential is in scope for an MLT.',
      },
    ],
  },
  {
    id: 'qc-1-3s',
    prompt: 'The coagulation control plots at +3.4 SD. What is the correct action?',
    options: [
      {
        text: 'Reject the run, repeat QC, and do not test patient samples',
        correct: true,
        explanation: 'A single point beyond ±3 SD is a 1_3s violation. Reject the run, repeat the control, and only test patients after QC passes.',
      },
      {
        text: 'Accept the run because one point is allowed to be high',
        correct: false,
        explanation: '1_3s is a rejection rule. Accepting the run would invalidate every patient result from that analyzer.',
      },
      {
        text: 'Flag the point 2_2s and continue testing',
        correct: false,
        explanation: '2_2s requires two consecutive points beyond 2 SD on the same side. This is a single point beyond 3 SD: 1_3s.',
      },
    ],
  },
];
