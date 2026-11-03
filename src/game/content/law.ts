import type { LawCard } from '../types';

export const LAW_CARDS: LawCard[] = [
  {
    id: 'order-of-draw',
    title: 'Order of draw (CLSI)',
    body: 'For the tubes in this shift: light blue citrate → gold SST (serum) → lavender EDTA. Citrate goes first so additive carryover does not activate or contaminate coagulation samples; EDTA goes last because it chelates calcium. Fill citrate tubes to the marked volume — a short draw changes the blood-to-additive ratio and invalidates PT/INR.',
    source: 'https://clsi.org/resources/insights/order-of-blood-draw-tubes-and-additives',
  },
  {
    id: 'ca-law',
    title: 'California MLT scope — 17 CCR §1030.6',
    body: 'A licensed MLT may perform waived and moderate-complexity testing in chemistry (including urinalysis), microbiology, diagnostic immunology, and hematology (including coagulation and blood-smear review other than manual leukocyte differentials), plus moderate-complexity ABO/Rh. The MLT works under onsite CLS or physician supervision (maximum 1:8 supervisor-to-MLT for moderate complexity) and may report results only after competency is documented and signed by the laboratory director or designee. Riley starts this shift with competency verified. The CLS desk is for consultation and escalation — not a co-sign on every result. The manual WBC differential is out of MLT scope.',
    source: 'https://www.law.cornell.edu/regulations/california/17-CCR-1030.6',
  },
  {
    id: 'preanalytical',
    title: 'Preanalytical errors and rejection',
    body: 'Verify two identifiers (name plus DOB or MRN) against the requisition before accessioning. Never relabel a mislabeled tube: reject it, document the reason, and request a recollect. Short draws and wrong tubes are rejected for the same reason — the result would not be trustworthy, and no analyzer can fix a collection error.',
    source: 'CLSI order-of-draw and specimen-acceptance guidance',
  },
  {
    id: 'qc',
    title: 'QC rules: 1_3s and 2_2s',
    body: 'Westgard multirule basics: 1_3s means one control point is more than 3 SD from the mean — reject the run. 2_2s means two consecutive control points exceed 2 SD on the same side — reject the run. After a rejection, repeat the control; patient testing stays locked until QC passes. Accepting a failed control invalidates every patient result from that analyzer.',
    source: 'CLSI QC guidance; Westgard multirule QC',
  },
  {
    id: 'bmp',
    title: 'BMP — chemistry panel',
    body: 'Sodium 136–146 mmol/L (critical <120 or >160). Potassium 3.5–5.0 mmol/L (critical <3.0 or >6.1 — 6.1 itself is not critical). Chloride 95–105. CO2 22–28 (critical <10 or >40). BUN 7–18 mg/dL. Creatinine 0.6–1.2 mg/dL. Random glucose 70–140 mg/dL (fasting 70–100; critical <55 or >450). Serum separator tube, clotted, spun 3,000 rpm × 10 min, then 500 µL serum aliquoted to a cup.',
    source: 'https://www.nbme.org/sites/default/files/2025-03/NBME_Laboratory_Reference_Values.pdf',
  },
  {
    id: 'cbc',
    title: 'CBC — hematology',
    body: 'WBC 4.5–11.0 ×10⁹/L (critical ≤2.0 or ≥40). RBC 3.5–5.5 (F) / 4.3–5.9 (M) ×10¹²/L. Hgb 12.0–16.0 (F) / 13.5–17.5 (M) g/dL (critical <7.0 or >22.0). Hct 36–46% (F) / 41–53% (M). MCV 80–100 fL. PLT 150–400 ×10⁹/L (critical ≤20 or ≥1000). Lavender EDTA whole blood is analyzed directly — do not centrifuge it for a CBC. RBC morphology review is in scope; the manual WBC differential is not and must go to the CLS.',
    source: 'https://www.nbme.org/sites/default/files/2025-03/NBME_Laboratory_Reference_Values.pdf',
  },
  {
    id: 'pt-inr',
    title: 'PT/INR — coagulation',
    body: 'PT 11.0–13.5 s (critical ≥44.2 s). INR 0.8–1.1 (critical ≥5.0). The citrate tube must be a full draw at the marked volume; centrifuge 3,000 rpm × 15 min and aliquot 500 µL plasma. Warfarin monitoring targets are patient-specific and often 2.0–3.0. A critical INR is called to the ordering provider, who decides on holding warfarin per protocol.',
    source: 'https://medlineplus.gov/ency/article/003652.htm',
  },
  {
    id: 'critical-values',
    title: 'Critical value callback',
    body: 'Call immediately. Identify yourself and the laboratory, verify two patient identifiers, state the test, the value with units, and the critical limit, then give the repeat value. Obtain read-back of the value, document who was notified and when, and release only after the call is complete. Many analyzers automatically repeat a critical result before the call — the repeat is not a substitute for notification.',
    source: 'https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf',
  },
];
