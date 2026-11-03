import type { ShiftDef } from '../types';
import { QUIZ } from './quiz';

export const SHIFT_01: ShiftDef = {
  id: 'shift01',
  title: 'Bay 7 · First Solo Shift',
  intro: 'Riley Chen, MLT — first solo shift. Morning QC, three patients, one shift timer.',
  orders: [
    {
      id: 'ORD-1001',
      patient: {
        name: 'Rosa Delgado',
        age: 58,
        sex: 'F',
        dob: '1967-03-14',
        mrn: '448210',
        location: 'Emergency Department',
      },
      priority: 'STAT',
      tests: ['BMP', 'CBC'],
      specimens: [
        {
          id: 'SPC-1001A',
          test: 'BMP',
          tube: 'GOLD_SST',
          fillMl: 4.0,
          label: { name: 'Rosa Delgado', dob: '1967-03-14', mrn: '448210' },
        },
        {
          id: 'SPC-1001B',
          test: 'CBC',
          tube: 'LAVENDER_EDTA',
          fillMl: 3.0,
          label: { name: 'Rosa Delgado', dob: '1967-03-14', mrn: '448210' },
        },
      ],
      results: {
        BMP: { Na: 134, K: 6.4, Cl: 101, CO2: 24, BUN: 31, Creatinine: 1.5, Glucose: 238 },
        CBC: { WBC: 13.2, RBC: 3.3, Hgb: 9.2, Hct: 28.1, MCV: 68.5, PLT: 231 },
      },
      note: 'ED workup. Stat BMP and CBC. Potassium is flagged critical once analyzed.',
    },
    {
      id: 'ORD-1002',
      patient: {
        name: 'Marcus Lee',
        age: 71,
        sex: 'M',
        dob: '1955-09-02',
        mrn: '771903',
        location: 'Anticoagulation Clinic',
      },
      priority: 'ROUTINE',
      tests: ['PT_INR'],
      specimens: [
        {
          id: 'SPC-1002A',
          test: 'PT_INR',
          tube: 'LIGHT_BLUE_CITRATE',
          fillMl: 2.7,
          label: { name: 'Marcus Lee', dob: '1955-09-02', mrn: '771903' },
        },
      ],
      results: {
        PT_INR: { PT: 52.4, INR: 5.8 },
      },
      note: 'Warfarin monitoring. Citrate tube is a full draw at 2.7 mL.',
    },
    {
      id: 'ORD-1003',
      patient: {
        name: 'Aisha Patel',
        age: 29,
        sex: 'F',
        dob: '1997-04-12',
        mrn: '884213',
        location: 'OB Clinic',
      },
      priority: 'ROUTINE',
      tests: ['CBC', 'BMP'],
      specimens: [
        {
          id: 'SPC-1003A',
          test: 'CBC',
          tube: 'LAVENDER_EDTA',
          fillMl: 3.0,
          label: { name: 'Aisha Patel', dob: '1997-04-12', mrn: '884213' },
        },
        {
          id: 'SPC-1003B',
          test: 'BMP',
          tube: 'GOLD_SST',
          fillMl: 4.0,
          label: { name: 'Aisha Patel', dob: '1998-04-12', mrn: '884213' },
          labelMismatch: true,
        },
      ],
      results: {
        CBC: { WBC: 6.8, RBC: 3.95, Hgb: 11.4, Hct: 34.2, MCV: 86.6, PLT: 178 },
      },
      note: 'OB clinic prenatal panel. The SST label DOB does not match the requisition.',
    },
  ],
  qc: [
    { analyzer: 'CHEM', levels: [{ level: 1, sd: 1.2 }, { level: 2, sd: -0.8 }] },
    { analyzer: 'HEMA', levels: [{ level: 1, sd: -0.4 }, { level: 2, sd: 1.1 }] },
    {
      analyzer: 'COAG',
      levels: [{ level: 1, sd: 3.4 }],
      fail: { level: 1, rule: '1_3s' },
      repeat: { level: 1, sd: 0.6 },
    },
  ],
  quiz: QUIZ,
};
