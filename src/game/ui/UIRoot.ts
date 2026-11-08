import type Phaser from 'phaser';
import { bus } from '../bus';
import { LAW_CARDS } from '../content/law';
import { TESTS } from '../content/tests';
import { analyzerFor, flagFor, refFor, tubeCssColor } from '../rules';
import { gradeFor, starsFor } from '../state/Scoring';
import type { SaveStore } from '../state/SaveStore';
import type { ShiftEngine } from '../state/ShiftEngine';
import type {
  AnalyzerId,
  Objective,
  ObjectiveKind,
  OrderView,
  Snapshot,
  SpecimenView,
  StationId,
  TestCode,
  TestStateView,
} from '../types';
import { STATION_NAMES } from '../world/map';
import type { LabScene } from '../world/LabScene';
import { button, clear, el, link } from './dom';

export type UIScreen = 'title' | 'intro' | 'lab' | 'scorecard';
export type ToastTone = 'info' | 'success' | 'error' | 'warn';

export interface ModalOptions {
  title: string;
  body: HTMLElement;
  footer?: HTMLElement[];
  dismissible?: boolean;
  id?: string;
  onClose?: () => void;
}

export interface ModalHandle {
  close: () => void;
  root: HTMLElement;
}

interface LabDom {
  topbar: HTMLElement;
  tag: HTMLElement;
  objectiveStation: HTMLElement;
  objectiveText: HTMLElement;
  chips: Record<'acc' | 'tat' | 'int', HTMLElement>;
  orderCard: HTMLElement;
  tray: HTMLElement;
  rail: HTMLElement;
  dockGo: HTMLButtonElement;
}

interface MinigameContext {
  key: string;
  test?: TestCode;
  analyzer?: AnalyzerId;
}

const STATION_COPY: Record<StationId, string> = {
  receiving: 'Samples arrive from the floors and clinics. Receive the next order to start the shift timer.',
  accession: 'Two identifiers, tube type, fill volume, order of draw. No relabeling — ever.',
  qc: 'Morning QC unlocks patient testing. Three analyzers, one shift.',
  centrifuge: 'Balance the rotor, pick the right preset, and let it finish.',
  aliquot: 'Pipette 500 µL into a sample cup for the analyzer.',
  chem: 'CHEM runs the BMP from a serum cup.',
  hema: 'HEMA runs the CBC from a lavender EDTA tube.',
  coag: 'COAG runs PT/INR from a citrate plasma cup.',
  microscope: 'RBC morphology review. The manual WBC differential is out of MLT scope.',
  report: 'Review flags, call criticals with read-back, release, close.',
  cls: 'Ask Maya Nguyen, CLS, for a hint or a scope call. No penalty.',
  fridge: 'Reagents: 2–8 °C. Do not store lunch next to the calibrators.',
  biohazard: 'Red bag, rigid sharps, and a lid that actually clicks.',
  eyewash: 'Fifteen minutes of irrigation, then report it. Always report it.',
  printer: 'The printer jams on Tuesdays. Today is Tuesday.',
};

const CLS_HINTS: Record<ObjectiveKind, string> = {
  qc: 'CHEM and HEMA are in range. COAG will throw a 1_3s — flag it, repeat the control, then accept.',
  receive: 'Sign for the rack at receiving. The shift clock starts with the first order.',
  accession: 'Compare two identifiers. A DOB that does not match is a rejected tube, not a relabel.',
  reject: 'You can still recover: reject the mislabeled tube at report and request a recollect.',
  centrifuge: 'Balance the tube opposite its pair. Serum needs 3,000 rpm for 10 minutes; citrate needs 15.',
  aliquot: 'Hold the pipette until the meniscus sits in the green band at 500 µL.',
  load: 'Load the cup or tube on the analyzer that matches the order, then run it.',
  run: 'QC must be green before any patient run. Press Run and let the analyzer finish.',
  review: 'Review every flag. A critical value is called before release, with read-back.',
  release: 'Release only after the critical is reported. If the specimen was rejected, request a recollect.',
  close: 'Close the order when every test is released or a recollect is requested.',
  complete: 'Shift done. Check the scorecard, then replay if you want the A.',
};

const SOURCES: { label: string; href: string }[] = [
  { label: 'NBME Laboratory Reference Values', href: 'https://www.nbme.org/sites/default/files/2025-03/NBME_Laboratory_Reference_Values.pdf' },
  { label: 'MedlinePlus — PT/INR', href: 'https://medlineplus.gov/ency/article/003652.htm' },
  { label: 'ARUP Critical Values List', href: 'https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf' },
  { label: 'CLSI order of blood draw', href: 'https://clsi.org/resources/insights/order-of-blood-draw-tubes-and-additives' },
  { label: '17 CCR §1030.6 — California MLT scope', href: 'https://www.law.cornell.edu/regulations/california/17-CCR-1030.6' },
];

const JOURNAL_TABS: { id: string; label: string; entries: string[] }[] = [
  { id: 'tests', label: 'Tests', entries: ['bmp', 'cbc', 'pt-inr'] },
  { id: 'order', label: 'Order of Draw', entries: ['order-of-draw'] },
  { id: 'crit', label: 'Critical Values', entries: ['critical-values'] },
  { id: 'law', label: 'CA Law', entries: ['ca-law'] },
  { id: 'qc', label: 'QC & Errors', entries: ['qc', 'preanalytical'] },
  { id: 'sources', label: 'Sources', entries: [] },
];

const TEST_LABEL: Record<TestCode, string> = { BMP: 'BMP', CBC: 'CBC', PT_INR: 'PT/INR' };

let modalSeq = 0;

export class UIRoot {
  readonly root: HTMLElement;
  private toastWrap: HTMLElement;
  private modalHost: HTMLElement;
  private screen: UIScreen = 'title';
  private screenHost: HTMLElement;
  private modalStack: { id: number; node: HTMLElement; dismissible: boolean; onClose?: () => void }[] = [];
  private toastTimer: number | null = null;
  private lab: LabDom | null = null;
  private engine: ShiftEngine;
  private unsubscribeEngine?: () => void;
  private uiPaused = false;
  private tatTimer: number | null = null;
  private hudSignature = '';
  private dockStation: StationId = 'receiving';
  private activeMinigame: MinigameContext | null = null;
  private mgChrome: HTMLElement | null = null;
  private criticalPulse: HTMLElement;

  onStartShift?: () => void;
  onClockIn?: () => void;
  onOpenJournal?: () => void;
  onRestartShift?: () => void;
  onQuitToTitle?: () => void;

  constructor(
    private readonly game: Phaser.Game,
    engine: ShiftEngine,
    private readonly save: SaveStore,
  ) {
    this.engine = engine;
    this.root = document.getElementById('ui') as HTMLElement;
    this.root.innerHTML = '';
    const vignette = el('div', 'vignette');
    this.screenHost = el('div', 'screen-host');
    this.screenHost.style.position = 'absolute';
    this.screenHost.style.inset = '0';
    this.screenHost.style.pointerEvents = 'none';
    this.toastWrap = el('div', 'toast-wrap');
    this.modalHost = el('div', 'modal-host');
    this.modalHost.style.position = 'absolute';
    this.modalHost.style.inset = '0';
    this.modalHost.style.pointerEvents = 'none';
    this.criticalPulse = el('div', 'critical-pulse hidden');
    this.root.append(vignette, this.criticalPulse, this.screenHost, this.toastWrap, this.modalHost);
    window.addEventListener('keydown', this.onKeyDown);

    bus.on('toast', (message: string, tone: ToastTone) => this.toast(message, tone));
    bus.on('ui:journal', () => this.openJournal());
    bus.on('ui:pause', () => this.openPause());
    bus.on('lab:objective', (objective: Objective) => this.setObjective(objective));
    bus.on('minigame:complete', (payload: { key: string; result: unknown }) => this.completeMinigame(payload));
    bus.on('minigame:exit', (payload: { key: string }) => this.exitMinigame(payload.key));
    this.bindEngine(engine);
    this.onOpenJournal = () => this.openJournal();
  }

  bindEngine(engine: ShiftEngine): void {
    this.unsubscribeEngine?.();
    this.engine = engine;
    this.hudSignature = '';
    this.unsubscribeEngine = engine.subscribe((snapshot) => this.onSnapshot(snapshot));
  }

  get currentScreen(): UIScreen {
    return this.screen;
  }

  get hasModal(): boolean {
    return this.modalStack.length > 0;
  }

  private setScreen(screen: UIScreen): void {
    this.screen = screen;
    clear(this.screenHost);
    this.criticalPulse.classList.add('hidden');
    this.screenHost.style.pointerEvents = 'none';
    this.lab = null;
    if (this.tatTimer !== null) {
      window.clearInterval(this.tatTimer);
      this.tatTimer = null;
    }
  }

  // ---------------------------------------------------------------- title

  showTitle(): void {
    this.closeAllModals();
    this.setScreen('title');
    for (const key of ['LabScene', 'QcScene', 'AccessionScene', 'CentrifugeScene', 'PipetteScene']) {
      if (this.game.scene.isActive(key)) this.game.scene.stop(key);
    }
    const wrap = el('div', 'title-screen');
    wrap.style.pointerEvents = 'auto';
    const panel = el('div', 'title-panel');
    panel.append(
      el('h1', 'logo', 'LabRush'),
      el('p', 'tagline', 'Three orders. One shift.'),
      el('p', 'subtitle', 'Bay 7 Clinical Laboratory · Sacramento, CA'),
    );

    const actions = el('div', 'title-actions');
    actions.append(button('Start Shift', 'btn-primary', () => this.showIntro()));
    const secondary = el('div', 'title-secondary');
    secondary.append(
      button('Journal', 'btn-ghost', () => this.openJournal()),
      button('Settings', 'btn-ghost', () => this.openSettings()),
    );
    actions.append(secondary);
    panel.append(actions);

    const best = this.save.get().best;
    const details = el('div', 'title-details hidden');
    if (best) {
      details.append(
        el('div', 'best-line', `BEST SHIFT · ${best.grade} · ${best.overall.toFixed(0)}/100`),
        el(
          'div',
          'best-line',
          `ACC ${Math.round(best.accuracy)} · TAT ${Math.round(best.tat)} · INT ${Math.round(best.integrity)}`,
        ),
      );
    }
    details.append(
      el(
        'p',
        'disclaimer',
        'Educational simulation. Reference intervals and critical limits are teaching values; laboratory-validated intervals always prevail.',
      ),
    );
    const disclose = button(
      best ? 'BEST SHIFT' : 'ABOUT THIS SIMULATION',
      'title-disclose',
      () => disclose.setAttribute('aria-expanded', String(!details.classList.toggle('hidden'))),
    );
    disclose.setAttribute('aria-expanded', 'false');
    disclose.append(el('span', 'caret', '▾'));
    panel.append(disclose, details);
    wrap.append(panel);
    this.screenHost.append(wrap);
  }

  showIntro(): void {
    this.setScreen('intro');
    const wrap = el('div', 'intro-screen');
    wrap.style.pointerEvents = 'auto';
    const cards = el('div', 'intro-cards');
    const c1 = el('div', 'intro-card');
    c1.append(
      el('h3', undefined, 'You are Riley Chen, MLT'),
      el('p', undefined, 'First solo shift at Bay 7. Competency is verified, so you report your own results. Maya Nguyen, CLS, is at the desk for consults and scope calls.'),
    );
    const c2 = el('div', 'intro-card');
    c2.append(
      el('h3', undefined, 'Move and interact'),
      el('p', undefined, 'Tap a glowing station on the map: the avatar walks over and the panel opens. GO at the bottom walks you to the next one. The objective chip is always right.'),
    );
    const c3 = el('div', 'intro-card');
    c3.append(
      el('h3', undefined, 'Every sample'),
      el('p', undefined, 'Receive → accession → process → analyze → review → release. Morning QC comes first.'),
    );
    cards.append(c1, c2, c3);
    const clockIn = button('Clock in', 'btn-primary', () => this.onClockIn?.());
    wrap.append(cards, clockIn);
    this.screenHost.append(wrap);
  }

  // ---------------------------------------------------------------- lab

  showLab(): void {
    this.setScreen('lab');
    const screen = el('div', 'lab-screen');

    const topbar = el('header', 'topbar');
    const tag = el('div', 'shift-tag', 'SHIFT 01 · 07:00');
    const row = el('div', 'topbar-row');

    const chip = el('div', 'objective-chip');
    chip.tabIndex = 0;
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-label', 'Current objective');
    chip.addEventListener('click', () => this.openJournal(this.journalTabForObjective()));
    const objectiveStation = el('div', 'objective-station', 'BAY 7');
    const objectiveText = el('div', 'objective-text', 'Loading shift…');
    chip.append(objectiveStation, objectiveText);

    const metricChip = (label: string, icon: string): { wrap: HTMLElement; value: HTMLElement } => {
      const c = el('div', 'chip');
      c.setAttribute('aria-label', label);
      const value = el('span', 'chip-val', '100');
      c.append(el('span', 'chip-icon', icon), el('span', 'chip-label', label), value);
      return { wrap: c, value };
    };
    const acc = metricChip('ACCURACY', 'A');
    const tat = metricChip('TAT', 'T');
    const integrity = metricChip('INTEGRITY', 'I');
    const chips = el('div', 'hud-chips');
    chips.append(acc.wrap, tat.wrap, integrity.wrap);
    const journal = button('J', 'btn-icon', () => this.openJournal(), { ariaLabel: 'Open journal' });
    const pause = button('II', 'btn-icon', () => this.openPause(), { ariaLabel: 'Pause shift' });
    const actions = el('div', 'hud-actions');
    actions.append(journal, pause);
    row.append(tag, chips, actions);
    topbar.append(row, chip);

    // The Phaser camera viewport is pinned to this spacer; see LabScene.applyCameraMode.
    const boardSlot = el('div');
    boardSlot.id = 'board-slot';

    const rail = el('div', 'order-rail hidden');
    const orderCard = el('div');
    const tray = el('div', 'tray');
    rail.append(orderCard, tray);

    const dock = el('footer', 'dock');
    const dockGo = button('GO · BAY 7', 'btn-primary dock-go', () => this.walkToDockStation());
    dock.append(dockGo);

    screen.append(topbar, boardSlot, rail, dock);
    this.screenHost.append(screen);
    this.lab = {
      topbar,
      tag,
      objectiveStation,
      objectiveText,
      chips: { acc: acc.value, tat: tat.value, int: integrity.value },
      orderCard,
      tray,
      rail,
      dockGo,
    };
    this.onSnapshot(this.engine.getSnapshot());
    this.tatTimer = window.setInterval(() => this.updateTat(), 500);
  }

  /** Walk the avatar to the objective's station, then open it — same path as a board tap. */
  private walkToDockStation(): void {
    const lab = this.game.scene.getScene('LabScene') as LabScene | null;
    if (lab && this.game.scene.isActive('LabScene')) lab.openStation(this.dockStation);
    else this.openStation(this.dockStation);
  }

  private setObjective(objective: Objective): void {
    if (!this.lab) return;
    const station = STATION_NAMES[objective.station] ?? 'BAY 7';
    this.lab.objectiveStation.textContent = station;
    this.lab.objectiveText.textContent = objective.text;
    this.lab.dockGo.textContent = `GO · ${station}`;
    this.dockStation = objective.station;
  }

  // -------------------------------------------------------------- HUD data

  private onSnapshot(snapshot: Snapshot): void {
    if (snapshot.status === 'complete' && this.screen === 'lab') {
      this.showScorecard(snapshot);
      return;
    }
    if (!this.lab) return;
    this.setObjective(snapshot.objective);
    this.lab.dockGo.disabled = snapshot.status === 'complete';
    const { metrics } = snapshot;
    this.lab.chips.acc.textContent = String(Math.round(metrics.accuracy));
    this.lab.chips.int.textContent = String(Math.round(metrics.integrity));
    this.lab.chips.acc.parentElement?.classList.toggle('warn', metrics.accuracy < 90);
    this.lab.chips.acc.parentElement?.classList.toggle('bad', metrics.accuracy < 75);
    this.lab.chips.int.parentElement?.classList.toggle('warn', metrics.integrity < 90);
    this.lab.chips.int.parentElement?.classList.toggle('bad', metrics.integrity < 75);
    this.updateTat();
    this.renderOrder(snapshot.activeOrder);
    const unreported =
      snapshot.activeOrder?.testStates.some((t) => t.criticals.some((k) => !t.criticalReported.includes(k))) ?? false;
    this.criticalPulse.classList.toggle('hidden', !unreported);
  }

  private printAnimation(): void {
    const strip = el('div', 'print-anim', 'PRINTING REPORT…');
    this.root.append(strip);
    window.setTimeout(() => strip.remove(), 1400);
  }

  private updateTat(): void {
    if (!this.lab) return;
    const seconds = this.engine.getSnapshot().elapsedSec;
    const mm = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const ss = (seconds % 60).toString().padStart(2, '0');
    this.lab.chips.tat.textContent = `${mm}:${ss}`;
  }

  private renderOrder(order: OrderView | null): void {
    if (!this.lab) return;
    if (!order) {
      this.lab.rail.classList.add('hidden');
      clear(this.lab.tray);
      this.hudSignature = '';
      return;
    }
    const specimens = order.specimens;
    const signature = [
      order.id,
      order.closed,
      specimens.map((s) => `${s.id}:${s.status}`).join(','),
      order.testStates.map((t) => `${t.test}:${t.released}:${t.recollect}:${t.results ? 1 : 0}`).join(','),
    ].join('|');
    if (signature === this.hudSignature) return;
    this.hudSignature = signature;

    this.lab.rail.classList.remove('hidden');
    clear(this.lab.orderCard);
    const top = el('div', 'order-card-top');
    const name = el('div', 'order-name', order.patient.name);
    const badge = el('span', `badge ${order.priority.toLowerCase()}`, order.priority);
    top.append(name, badge);
    const tests = el('div', 'order-tests');
    for (const t of order.tests) tests.append(el('span', 'test-pill', TEST_LABEL[t]));
    this.lab.orderCard.append(top, tests);

    clear(this.lab.tray);
    for (const specimen of specimens) {
      const item = el('div', 'tray-item');
      const tube = el('div', 'tray-tube');
      tube.style.setProperty('--tube-color', tubeCssColor(specimen.tube));
      const label = el('div', 'tray-status', this.trayStatus(specimen, order));
      if (specimen.rejected) item.classList.add('rejected');
      if (specimen.analyzed || specimen.aliquoted) item.classList.add('done');
      item.append(tube, label);
      this.lab.tray.append(item);
    }
  }

  private trayStatus(specimen: SpecimenView, order: OrderView): string {
    const state = order.testStates.find((t) => t.test === specimen.test);
    if (specimen.rejected) return state?.recollect ? 'RECOLLECT' : 'REJECTED';
    if (state?.released) return 'RELEASED';
    if (specimen.analyzed) return 'ANALYZED';
    if (specimen.loaded) return 'LOADED';
    if (specimen.aliquoted) return 'ALIQUOTED';
    if (specimen.centrifuged) return 'CENTRIFUGED';
    if (specimen.accessioned) return 'ACCESSIONED';
    return 'COLLECTED';
  }

  // ------------------------------------------------------------- scorecard

  showScorecard(snapshot: Snapshot): void {
    this.closeAllModals();
    this.setScreen('scorecard');
    const { metrics } = snapshot;
    const grade = gradeFor(metrics.overall);
    const improved = this.save.setBest({
      overall: metrics.overall,
      grade,
      accuracy: metrics.accuracy,
      tat: metrics.tat,
      integrity: metrics.integrity,
      at: new Date().toISOString(),
    });

    const card = el('div', 'scorecard');

    const hero = el('div', 'score-hero');
    const gradeEl = el('div', 'grade', grade);
    const heroCopy = el('div');
    heroCopy.append(
      el('div', 'order-name', improved ? 'New best shift' : 'Shift complete'),
      el('div', 'order-meta', `Overall ${metrics.overall.toFixed(1)} / 100 · 50% accuracy, 30% TAT, 20% integrity`),
    );
    hero.append(gradeEl, heroCopy);
    card.append(hero);

    const metricRow = (label: string, value: number): HTMLElement => {
      const row = el('div', 'metric-row');
      const bar = el('div', 'metric-bar');
      const fill = el('i');
      fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
      bar.append(fill);
      const stars = '★'.repeat(starsFor(value)) + '☆'.repeat(3 - starsFor(value));
      row.append(el('span', undefined, label), bar, el('span', 'metric-stars', `${Math.round(value)} ${stars}`));
      return row;
    };
    card.append(metricRow('ACCURACY', metrics.accuracy), metricRow('TAT', metrics.tat), metricRow('INTEGRITY', metrics.integrity));

    card.append(el('h3', undefined, 'Orders'));
    const table = el('table', 'order-summary');
    const head = el('tr');
    for (const h of ['ORDER', 'PATIENT', 'RELEASED', 'RECOLLECT', 'TAT']) head.append(el('th', undefined, h));
    table.append(head);
    for (const summary of snapshot.orderSummaries) {
      const tr = el('tr');
      tr.append(
        el('td', undefined, summary.id),
        el('td', undefined, summary.patient),
        el('td', undefined, summary.released.map((t) => TEST_LABEL[t]).join(', ') || '—'),
        el('td', undefined, summary.recollect.map((t) => TEST_LABEL[t]).join(', ') || '—'),
        el('td', undefined, summary.tatSec === null ? '—' : `${summary.tatSec}s`),
      );
      table.append(tr);
    }
    card.append(table);

    if (snapshot.penalties.length) {
      card.append(el('h3', undefined, 'Score notes'));
      const notes = el('div', 'state-card warn');
      const seen = new Set<string>();
      for (const penalty of snapshot.penalties) {
        const key = `${penalty.code}:${penalty.message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        notes.append(el('p', undefined, `• ${penalty.message}`));
      }
      card.append(notes);
    }

    card.append(el('h3', undefined, 'What you learned'));
    const learned = el('div', 'state-card good');
    for (const line of [
      'Preanalytical errors — a mismatched label, a short draw, a wrong tube — cannot be fixed at the analyzer.',
      'Critical potassium 6.4 mmol/L is called with two identifiers, value, limit, repeat, and read-back before release.',
      'A 1_3s QC violation rejects the run; repeat the control before any patient sample.',
      'The manual WBC differential is outside California MLT scope: escalate it to the CLS.',
      'A partial order can be released while the rejected test is recollected.',
    ]) {
      learned.append(el('p', undefined, `• ${line}`));
    }
    card.append(learned);

    card.append(el('h3', undefined, 'Knowledge check'));
    const quizWrap = el('div');
    let answered = 0;
    let correct = 0;
    const saveQuiz = (): void => {
      if (answered < snapshotQuizCount) return;
      this.save.setQuizBest(correct);
      const line = el('p', 'quiz-exp', `Knowledge check: ${correct} of ${snapshotQuizCount} correct. Best saved.`);
      quizWrap.append(line);
    };
    const quiz = this.engine.def_.quiz;
    const snapshotQuizCount = quiz.length;
    quiz.forEach((question, qi) => {
      const box = el('div', 'quiz-q');
      box.append(el('div', 'q', `${qi + 1}. ${question.prompt}`));
      const explanation = el('div', 'quiz-exp');
      let done = false;
      question.options.forEach((option) => {
        const b = button(option.text, 'quiz-opt', () => {
          if (done) return;
          done = true;
          answered += 1;
          if (option.correct) correct += 1;
          b.classList.add(option.correct ? 'correct' : 'wrong');
          explanation.textContent = option.explanation;
          if (answered === snapshotQuizCount) saveQuiz();
        });
        box.append(b);
      });
      box.append(explanation);
      quizWrap.append(box);
    });
    card.append(quizWrap);

    this.openModal({
      id: 'scorecard',
      title: 'SHIFT REPORT · BAY 7',
      body: card,
      dismissible: false,
      footer: [
        button('Replay shift', 'btn-primary', () => this.onRestartShift?.()),
        button('Journal', 'btn-ghost', () => this.openJournal()),
        button('Title', 'btn-ghost', () => this.onQuitToTitle?.()),
      ],
    });
  }

  // -------------------------------------------------------------- stations

  openStation(id: StationId): void {
    switch (id) {
      case 'receiving':
        return this.openReceiving();
      case 'qc':
        return this.openQc();
      case 'accession':
        return this.openAccession();
      case 'centrifuge':
        return this.openCentrifuge();
      case 'aliquot':
        return this.openAliquot();
      case 'chem':
        return this.openAnalyzer('CHEM');
      case 'hema':
        return this.openAnalyzer('HEMA');
      case 'coag':
        return this.openAnalyzer('COAG');
      case 'report':
        return this.openReport();
      case 'cls':
        return this.openCls();
      default:
        return this.openFlavor(id);
    }
  }

  private openFlavor(id: StationId): void {
    const body = el('div');
    body.append(el('p', undefined, STATION_COPY[id]));
    this.openModal({
      title: STATION_NAMES[id],
      body,
      footer: [button('Close', 'btn-primary', () => this.closeAllModals())],
    });
  }

  private openReceiving(): void {
    const snapshot = this.engine.getSnapshot();
    const body = el('div');
    if (snapshot.status === 'qc') {
      body.append(this.gateCard('Run morning QC first. Patient testing is locked until all three analyzers pass.'));
      this.openModal({
        title: 'RECEIVING',
        body,
        footer: [
          button('Go to QC', 'btn-primary', () => {
            this.closeAllModals();
            bus.emit('lab:walk-to', 'qc');
          }),
          button('Close', 'btn-ghost', () => this.closeAllModals()),
        ],
      });
      return;
    }
    if (snapshot.activeOrder) {
      body.append(el('p', undefined, `${snapshot.activeOrder.patient.name}'s order is already on the bench.`));
      body.append(this.specimenSummary(snapshot.activeOrder));
      this.openModal({
        title: 'RECEIVING',
        body,
        footer: [button('Close', 'btn-primary', () => this.closeAllModals())],
      });
      return;
    }
    if (snapshot.status === 'complete') {
      body.append(el('p', undefined, 'Every sample for this shift has been received.'));
      this.openModal({
        title: 'RECEIVING',
        body,
        footer: [button('Close', 'btn-primary', () => this.closeAllModals())],
      });
      return;
    }
    body.append(el('p', undefined, STATION_COPY.receiving));
    const next = this.nextOrderLabel();
    if (next) body.append(el('p', undefined, `Next rack: ${next}`));
    const receive = button('Receive samples', 'btn-primary', () => {
      this.engine.receiveNextOrder();
      this.closeAllModals();
      this.toast('Samples received. Start with accession.', 'success');
    });
    this.openModal({ title: 'RECEIVING', body, footer: [receive, button('Close', 'btn-ghost', () => this.closeAllModals())] });
  }

  private nextOrderLabel(): string {
    const shift = this.engine.def_;
    const snapshot = this.engine.getSnapshot();
    const order = shift.orders[snapshot.orderIndex];
    return order ? `${order.patient.name} · ${order.tests.map((t) => TEST_LABEL[t]).join(' + ')}` : '';
  }

  private openQc(): void {
    const snapshot = this.engine.getSnapshot();
    const body = el('div');
    body.append(el('p', undefined, STATION_COPY.qc));
    const list = el('div');
    for (const analyzer of ['CHEM', 'HEMA', 'COAG'] as AnalyzerId[]) {
      const cleared = snapshot.qc[analyzer].cleared;
      list.append(this.statusRow(analyzer, cleared ? 'CLEARED' : 'PENDING', cleared ? 'good' : 'warn'));
    }
    body.append(list);
    const start = button('Start QC', 'btn-primary', () => {
      this.closeAllModals();
      this.launchMinigame('QcScene', { key: 'QcScene' });
    });
    if (snapshot.qcComplete) {
      body.append(el('p', undefined, 'QC is complete. Patient testing is unlocked.'));
      start.disabled = true;
      start.textContent = 'QC complete';
    }
    this.openModal({ title: 'MORNING QC', body, footer: [start, button('Close', 'btn-ghost', () => this.closeAllModals())] });
  }

  private openAccession(): void {
    const order = this.engine.getSnapshot().activeOrder;
    const body = el('div');
    if (!order) {
      body.append(this.gateCard('Receive a sample at the receiving window first.'));
    } else if (order.specimens.every((s) => s.status !== 'collected')) {
      body.append(el('p', undefined, 'This rack is already accessioned.'));
      body.append(this.specimenSummary(order));
    } else {
      body.append(el('p', undefined, STATION_COPY.accession));
      body.append(this.specimenSummary(order));
    }
    const already = order ? order.specimens.every((s) => s.status !== 'collected') : false;
    const start = button(already ? 'Already accessioned' : 'Begin accession', 'btn-primary', () => {
      this.closeAllModals();
      this.launchMinigame('AccessionScene', { key: 'AccessionScene' });
    });
    if (!order || already) start.disabled = true;
    this.openModal({ title: 'ACCESSION', body, footer: [start, button('Close', 'btn-ghost', () => this.closeAllModals())] });
  }

  private openCentrifuge(): void {
    const snapshot = this.engine.getSnapshot();
    const target = this.findProcessTarget(snapshot, 'centrifuge');
    const body = el('div');
    if (!snapshot.activeOrder) {
      body.append(this.gateCard('Receive a sample first.'));
    } else if (snapshot.qcComplete === false) {
      body.append(this.gateCard('Run morning QC first.'));
    } else if (!target) {
      body.append(el('p', undefined, 'Nothing needs the rotor right now.'));
      const note = this.findTest(snapshot, 'CBC');
      if (note) body.append(el('p', undefined, 'EDTA whole blood — do not centrifuge for CBC. Load it straight on HEMA.'));
    } else {
      const def = TESTS[target];
      body.append(el('p', undefined, `Balance the tube and run 3,000 rpm × ${def.centrifugeMinutes} min.`));
    }
    const start = button('Open rotor', 'btn-primary', () => {
      if (!target) return;
      this.closeAllModals();
      this.launchMinigame('CentrifugeScene', { key: 'CentrifugeScene', test: target });
    });
    start.disabled = !target;
    this.openModal({ title: 'CENTRIFUGE', body, footer: [start, button('Close', 'btn-ghost', () => this.closeAllModals())] });
  }

  private openAliquot(): void {
    const snapshot = this.engine.getSnapshot();
    const target = this.findProcessTarget(snapshot, 'aliquot');
    const body = el('div');
    if (!snapshot.activeOrder) {
      body.append(this.gateCard('Receive a sample first.'));
    } else if (!target) {
      const pending = this.findUnspun(snapshot);
      body.append(
        pending
          ? this.gateCard(`Centrifuge the ${TESTS[pending].tube === 'LIGHT_BLUE_CITRATE' ? 'citrate tube' : 'gold SST'} before aliquoting.`)
          : el('p', undefined, 'Nothing needs an aliquot right now.'),
      );
    } else {
      body.append(el('p', undefined, STATION_COPY.aliquot));
    }
    const start = button('Open pipette', 'btn-primary', () => {
      if (!target) return;
      this.closeAllModals();
      this.launchMinigame('PipetteScene', { key: 'PipetteScene', test: target });
    });
    start.disabled = !target;
    this.openModal({ title: 'ALIQUOT', body, footer: [start, button('Close', 'btn-ghost', () => this.closeAllModals())] });
  }

  private openAnalyzer(id: AnalyzerId): void {
    const body = el('div');
    const refresh = (): void => {
      clear(body);
      const snapshot = this.engine.getSnapshot();
      const order = snapshot.activeOrder;
      const test = order?.tests.find((t) => analyzerFor(t) === id) ?? null;
      const copyKey: StationId = id === 'CHEM' ? 'chem' : id === 'HEMA' ? 'hema' : 'coag';
      body.append(el('p', undefined, `${id} analyzer. ${STATION_COPY[copyKey]}`));
      body.append(
        this.statusRow('QC', snapshot.qc[id].cleared ? 'CLEARED' : 'NOT RUN', snapshot.qc[id].cleared ? 'good' : 'bad'),
      );
      if (!order) {
        body.append(this.gateCard('Receive a sample first.'));
        return;
      }
      if (!test) {
        body.append(this.gateCard(`The ${id} analyzer does not run a test in this order.`));
        return;
      }
      const state = order.testStates.find((t) => t.test === test);
      const specimen = order.specimens.find((s) => s.test === test);
      if (!state || !specimen) return;
      body.append(this.statusRow(TEST_LABEL[test], this.specimenGate(specimen, state), state.released ? 'good' : 'warn'));
      const rack = el('div', 'rack');
      for (let i = 0; i < 3; i++) {
        const occupied = i === 0 && specimen.loaded;
        const slot = el('div', `rack-slot ${occupied ? 'loaded' : ''}`, occupied ? TEST_LABEL[test] : '');
        slot.setAttribute('aria-label', occupied ? `${TEST_LABEL[test]} loaded` : `Empty analyzer slot ${i + 1}`);
        rack.append(slot);
      }
      body.append(rack);

      const load = button(specimen.loaded ? 'Loaded' : 'Load sample', 'btn-primary', () => {
        const res = this.engine.loadAnalyzer(id);
        if (!res.ok) this.toast(res.reason ?? 'Cannot load that sample.', 'error');
        else this.toast(`${TEST_LABEL[test]} loaded on ${id}.`, 'success');
        refresh();
      });
      load.disabled = specimen.loaded || !!state.results;
      const run = button('Run', 'btn-primary', () => {
        if (!specimen.loaded || state.results) return;
        run.disabled = true;
        load.disabled = true;
        this.toast(`${id} is running ${TEST_LABEL[test]}…`, 'info');
        try {
          if (this.game.sound.get('run')) this.game.sound.play('run', { volume: 0.5 });
        } catch {
          /* audio is optional */
        }
        window.setTimeout(() => {
          const res = this.engine.runAnalyzer(id);
          if (!res.ok) this.toast(res.reason ?? 'Cannot run that sample.', 'error');
          else this.toast(`${TEST_LABEL[test]} results ready — review at report.`, 'success');
          refresh();
        }, 2000);
      });
      run.disabled = !specimen.loaded || !!state.results;
      if (state.results) body.append(el('p', undefined, 'Results ready — review at the report station.'));
      const actions = el('div', 'btn-row');
      actions.append(load, run);
      body.append(actions);
    };
    refresh();
    this.openModal({
      title: `${id} ANALYZER`,
      body,
      footer: [button('Close', 'btn-primary', () => this.closeAllModals())],
    });
  }

  private specimenGate(specimen: SpecimenView, state: TestStateView): string {
    if (state.released) return 'RELEASED';
    if (state.recollect) return 'RECOLLECT REQUESTED';
    if (specimen.rejected) return 'REJECTED';
    if (specimen.analyzed) return 'ANALYZED';
    if (specimen.loaded) return 'LOADED';
    if (specimen.labelMismatch) return 'LABEL MISMATCH';
    if (!specimen.centrifuged && TESTS[specimen.test].centrifuge) return 'NEEDS CENTRIFUGE';
    if (!specimen.aliquoted && TESTS[specimen.test].aliquot) return 'NEEDS ALIQUOT';
    if (specimen.accessioned) return 'READY TO LOAD';
    return 'NOT ACCESSIONED';
  }

  private openReport(): void {
    const body = el('div');
    let activeTest: TestCode | null = null;
    const refresh = (): void => {
      const snapshot = this.engine.getSnapshot();
      const order = snapshot.activeOrder;
      clear(body);
      if (!order) {
        body.append(this.gateCard('No active order. Receive a sample first.'));
        return;
      }
      this.engine.reviewOrder();
      if (!activeTest || !order.tests.includes(activeTest)) activeTest = order.tests[0] ?? null;
      const tabs = el('div', 'tabs');
      for (const test of order.tests) {
        const state = order.testStates.find((t) => t.test === test);
        const label = `${TEST_LABEL[test]}${state?.released ? ' ✓' : state?.recollect ? ' ⟳' : ''}`;
        tabs.append(
          button(label, `tab${test === activeTest ? ' active' : ''}`, () => {
            activeTest = test;
            refresh();
          }),
        );
      }
      body.append(tabs);
      if (activeTest) this.renderTestReport(body, order, activeTest, refresh);

      const pending = order.tests.filter((test) => {
        const state = order.testStates.find((t) => t.test === test);
        return state && !state.released && !state.recollect;
      });
      if (pending.length) {
        body.append(
          el('p', undefined, `Close unlocks after every test is released or a recollect is requested: ${pending.map((t) => TEST_LABEL[t]).join(', ')}.`),
        );
      }
      const close = button('Close order', 'btn-primary', () => {
        const res = this.engine.closeOrder();
        if (!res.ok) {
          this.toast(res.reason ?? 'Finish the order first.', 'error');
          return;
        }
        this.printAnimation();
        this.closeAllModals();
        this.toast('Order closed and results released.', 'success');
        const snap = this.engine.getSnapshot();
        if (snap.status === 'complete') this.toast('Shift complete.', 'success');
        else this.toast('Next rack is waiting at receiving.', 'info');
      });
      close.disabled = pending.length > 0;
      body.append(close);
    };
    refresh();
    this.openModal({
      title: 'REPORT',
      body,
      footer: [button('Close', 'btn-ghost', () => this.closeAllModals())],
    });
  }

  private renderTestReport(body: HTMLElement, order: OrderView, test: TestCode, refresh: () => void): void {
    const state = order.testStates.find((t) => t.test === test);
    const specimen = order.specimens.find((s) => s.test === test);
    if (!state || !specimen) return;
    const def = TESTS[test];

    if (!state.results) {
      const why = specimen.rejected
        ? 'Specimen rejected. A recollect is required before this test can run.'
        : specimen.labelMismatch && specimen.accessioned
          ? 'Label mismatch unresolved. Reject the specimen and request a recollect — the analyzer will refuse it.'
          : 'No result yet. Accession, process, and run the sample first.';
      const card = el('div', `state-card ${specimen.rejected || specimen.labelMismatch ? 'bad' : 'warn'}`);
      card.append(el('p', undefined, why));
      body.append(card);
      if (state.recollect) {
        body.append(el('p', undefined, 'Recollect requested — notify the collecting location.'));
      } else if (specimen.rejected || (specimen.labelMismatch && specimen.accessioned)) {
        body.append(
          button('Reject and request recollect', 'btn-amber', () => {
            const res = this.engine.requestRecollect(test);
            if (res.ok) this.toast('Recollect requested. Notify the collecting location.', 'warn');
            else this.toast(res.reason ?? 'Cannot request a recollect.', 'error');
            refresh();
          }),
        );
      }
      return;
    }

    const results = state.results;
    const tableWrap = el('div', 'table-wrap');
    const table = el('table', 'result-table');
    const head = el('tr');
    for (const label of ['ANALYTE', 'RESULT', 'REFERENCE', 'FLAG']) {
      head.append(el('th', undefined, label));
    }
    table.append(head);
    for (const analyte of def.analytes) {
      const value = results[analyte.key];
      if (value === undefined) continue;
      const flag = flagFor(analyte, value, order.patient.sex);
      const ref = refFor(analyte, order.patient.sex);
      const tr = el('tr', flag === 'C' ? 'critical' : undefined);
      tr.append(el('td', undefined, analyte.name));
      tr.append(el('td', undefined, `${value} ${analyte.unit}`));
      tr.append(el('td', undefined, `${ref.low}–${ref.high}`));
      const flagCell = el('td');
      if (flag) flagCell.append(el('span', `flag ${flag}`, flag === 'C' ? 'CRITICAL' : flag));
      tr.append(flagCell);
      table.append(tr);
    }
    tableWrap.append(table);
    body.append(tableWrap);
    if (state.comment) body.append(el('p', undefined, `Comment: ${state.comment}`));

    if (state.criticals.length) {
      const unreported = state.criticals.filter((k) => !state.criticalReported.includes(k));
      if (unreported.length) {
        const names = unreported.map((k) => def.analytes.find((a) => a.key === k)?.name ?? k);
        body.append(this.gateCard(`Critical: ${names.join(', ')}. Call the provider before release.`));
        body.append(
          button(`Call provider · ${TEST_LABEL[test]}`, 'btn-danger', () => {
            this.openCallback(order, test, state, refresh);
          }),
        );
      } else {
        body.append(this.statusRow('Critical reported', 'YES', 'good'));
      }
    }

    if (test === 'CBC' && order.id === 'ORD-1001' && !state.released) {
      body.append(
        button('Review smear', 'btn-ghost', () => {
          this.openSmear(test, refresh);
        }),
      );
    }

    const blockers = this.releaseBlockers(state, specimen);
    if (state.released) {
      body.append(this.statusRow(TEST_LABEL[test], 'RELEASED', 'good'));
      return;
    }
    if (blockers.length) {
      const list = el('div', 'state-card warn');
      for (const blocker of blockers) list.append(el('p', undefined, `• ${blocker}`));
      body.append(list);
    }
    const actions = el('div', 'btn-row');
    const release = button(`Release ${TEST_LABEL[test]}`, 'btn-primary', () => {
      const res = this.engine.releaseTest(test);
      if (!res.ok) this.toast(res.reason ?? 'Release blocked.', 'error');
      else this.toast(`${TEST_LABEL[test]} released.`, 'success');
      refresh();
    });
    release.disabled = blockers.length > 0;
    actions.append(release);
    if (specimen.rejected && !state.recollect) {
      actions.append(
        button('Request recollect', 'btn-amber', () => {
          const res = this.engine.requestRecollect(test);
          if (res.ok) this.toast('Recollect requested.', 'warn');
          else this.toast(res.reason ?? 'Cannot request a recollect.', 'error');
          refresh();
        }),
      );
    }
    if (specimen.labelMismatch && specimen.accessioned && !specimen.rejected) {
      actions.append(
        button('Reject and request recollect', 'btn-amber', () => {
          const res = this.engine.requestRecollect(test);
          if (res.ok) this.toast('Mislabeled specimen rejected. Recollect requested.', 'warn');
          else this.toast(res.reason ?? 'Cannot request a recollect.', 'error');
          refresh();
        }),
      );
    }
    body.append(actions);
  }

  private releaseBlockers(state: TestStateView, specimen: SpecimenView): string[] {
    const blockers: string[] = [];
    if (state.recollect) blockers.push('A recollect was requested for this test.');
    if (specimen.rejected) blockers.push('Specimen rejected — request a recollect.');
    if (specimen.labelMismatch && specimen.accessioned && !specimen.rejected) blockers.push('Label mismatch is unresolved.');
    if (!state.results) blockers.push('No result to release yet.');
    const unreported = state.criticals.filter((k) => !state.criticalReported.includes(k));
    if (unreported.length) blockers.push(`Critical unreported: ${unreported.join(', ')}.`);
    const qc = this.engine.getSnapshot().qc[TESTS[state.test].analyzer];
    if (!qc.cleared) blockers.push('QC is not cleared for this analyzer.');
    return blockers;
  }

  private openCallback(order: OrderView, test: TestCode, state: TestStateView, refresh: () => void): void {
    const def = TESTS[test];
    const results = state.results ?? {};
    const criticals = state.criticals.filter((k) => !state.criticalReported.includes(k));
    if (!criticals.length) return;
    const detail = criticals
      .map((key) => {
        const analyte = def.analytes.find((a) => a.key === key);
        if (!analyte) return '';
        const limit =
          analyte.criticalHigh !== undefined
            ? `above the critical high of ${analyte.criticalHigh} ${analyte.unit}`
            : `below the critical low of ${analyte.criticalLow} ${analyte.unit}`;
        return `${analyte.name} ${results[key]} ${analyte.unit}, ${limit}; repeat ${results[key]} ${analyte.unit}`;
      })
      .join(' and ');
    const steps: { prompt: string; options: { text: string; correct: boolean; explanation: string }[] }[] = [
      {
        prompt: 'Open the call.',
        options: [
          {
            text: `This is Riley Chen, MLT at Bay 7 Clinical Laboratory. Two identifiers: ${order.patient.name}, DOB ${order.patient.dob}.`,
            correct: true,
            explanation: 'Identify yourself, the laboratory, and two patient identifiers before giving any result.',
          },
          { text: 'Is this the emergency department?', correct: false, explanation: 'That does not identify you, the lab, or the patient.' },
          { text: `I have a critical on ${order.patient.name}.`, correct: false, explanation: 'A name alone is not two identifiers, and you have not identified yourself or the lab.' },
        ],
      },
      {
        prompt: 'State the result.',
        options: [
          {
            text: `Critical ${TEST_LABEL[test]}: ${detail}.`,
            correct: true,
            explanation: 'Test, value, units, the critical limit, and the repeat value — all stated clearly.',
          },
          { text: "It's a little high.", correct: false, explanation: 'A vague value cannot be acted on. State the number, units, and limit.' },
          { text: "It's probably hemolyzed, so ignore it.", correct: false, explanation: 'Do not editorialize or dismiss a critical. Report it and document the repeat.' },
        ],
      },
      {
        prompt: 'Close the loop.',
        options: [
          {
            text: 'Please read back the value so I can document the notification.',
            correct: true,
            explanation: 'Read-back confirms the receiver heard the value; then document who was notified and when.',
          },
          { text: 'Thanks, bye.', correct: false, explanation: 'No read-back means no proof the value was received correctly.' },
          { text: "I'll fax it over.", correct: false, explanation: 'A fax is not a critical-value notification. Call, read back, document.' },
        ],
      },
    ];
    let step = 0;
    const body = el('div');
    const feedback = el('div');
    const render = (): void => {
      clear(body);
      body.append(el('h3', undefined, `Critical callback · step ${step + 1} of 3`));
      body.append(el('p', undefined, steps[step].prompt));
      for (const option of steps[step].options) {
        body.append(
          button(option.text, 'quiz-opt', () => {
            if (option.correct) {
              step += 1;
              clear(feedback);
              if (step >= steps.length) {
                for (const key of criticals) this.engine.reportCritical(test, key);
                this.toast('Critical reported with read-back. Release is unlocked.', 'success');
                handle.close();
                refresh();
                return;
              }
              render();
              return;
            }
            this.engine.applyPenalty('wrong_callback_step', option.explanation);
            feedback.append(el('p', 'quiz-exp', option.explanation));
          }),
        );
      }
      body.append(feedback);
      body.append(el('p', 'quiz-exp', 'Many analyzers auto-repeat a critical before the call; the repeat here matches the reported value.'));
    };
    render();
    const handle = this.openModal({
      title: `CALL PROVIDER · ${TEST_LABEL[test]}`,
      body,
      footer: [button('Cancel call', 'btn-ghost', () => this.closeAllModals())],
    });
  }

  private openSmear(test: TestCode, refresh: () => void): void {
    const body = el('div');
    const svg = smearSvg();
    const smear = el('div', 'smear');
    smear.append(svg);
    body.append(smear);
    let morphology: string | null = null;
    let differential: string | null = null;
    const feedback = el('div');

    const q = (prompt: string, options: { text: string; correct: boolean; explanation: string }[], onPick: (o: { text: string; correct: boolean; explanation: string }) => void): void => {
      body.append(el('div', 'q', prompt));
      for (const option of options) {
        const b = button(option.text, 'quiz-opt', () => {
          onPick(option);
          b.dataset.selected = 'true';
        });
        body.append(b);
      }
    };

    q(
      'What RBC morphology do you see?',
      [
        { text: 'Microcytic, hypochromic RBCs', correct: true, explanation: 'Small cells with enlarged pale centers fit the low MCV and low Hgb.' },
        { text: 'Normal RBC morphology', correct: false, explanation: 'The cells are small with wide central pallor — not normal.' },
        { text: 'Schistocytes', correct: false, explanation: 'Schistocytes are fragmented cells; these are small and hypochromic.' },
      ],
      (option) => {
        morphology = option.text;
        if (!option.correct && !feedback.textContent) feedback.append(el('p', 'quiz-exp', option.explanation));
      },
    );
    q(
      'The provider asks for a manual WBC differential. What do you do?',
      [
        { text: 'Escalate to Nguyen, CLS', correct: true, explanation: '17 CCR §1030.6 excludes manual leukocyte differentials from MLT scope.' },
        { text: 'Perform it yourself', correct: false, explanation: 'A manual WBC differential is outside California MLT scope. Escalate it.' },
      ],
      (option) => {
        differential = option.text;
        if (!option.correct) {
          this.engine.applyPenalty('out_of_scope_diff', option.explanation);
          const card = el('div', 'state-card bad');
          card.append(el('h3', undefined, 'CA scope'), el('p', undefined, option.explanation));
          feedback.append(card);
        }
      },
    );
    body.append(feedback);

    const submit = button('Add comment', 'btn-primary', () => {
      if (!morphology || !differential) {
        this.toast('Answer both questions first.', 'warn');
        return;
      }
      const morphologyCorrect = morphology === 'Microcytic, hypochromic RBCs';
      const differentialCorrect = differential === 'Escalate to Nguyen, CLS';
      if (morphologyCorrect && differentialCorrect) {
        this.engine.setTestComment(test, 'Microcytic RBCs; manual WBC differential deferred to CLS');
        this.toast('Comment added to the CBC report.', 'success');
        this.closeAllModals();
        refresh();
      } else {
        this.toast('The comment needs both answers correct.', 'error');
      }
    });
    const actions = el('div', 'btn-row');
    actions.append(submit);
    body.append(actions);
    this.openModal({
      title: 'RBC MORPHOLOGY REVIEW',
      body,
      footer: [button('Skip review', 'btn-ghost', () => this.closeAllModals())],
    });
  }

  private openCls(): void {
    const snapshot = this.engine.getSnapshot();
    const body = el('div');
    const hint = el('p', undefined, CLS_HINTS[snapshot.objective.kind] ?? 'Keep the rack moving.');
    body.append(el('h3', undefined, 'Ask Nguyen, CLS'), hint);
    body.append(
      el(
        'p',
        undefined,
        'CA scope reminder: waived and moderate-complexity testing in chemistry, microbiology, diagnostic immunology, and hematology (coagulation and smear review other than manual WBC differentials). Competency is verified — you report your own results.',
      ),
    );
    this.pauseForUI();
    this.openModal({
      title: 'CLS DESK',
      body,
      footer: [button('Thanks', 'btn-primary', () => this.closeAllModals())],
      onClose: () => this.resumeFromUI(),
    });
  }

  private gateCard(message: string): HTMLElement {
    const card = el('div', 'state-card warn');
    card.append(el('p', undefined, message));
    return card;
  }

  private statusRow(label: string, value: string, tone: 'good' | 'warn' | 'bad'): HTMLElement {
    const row = el('div', 'status-row');
    row.append(el('span', 'status-label', label), el('span', `status-value ${tone}`, value));
    return row;
  }

  private specimenSummary(order: OrderView): HTMLElement {
    const list = el('div');
    for (const specimen of order.specimens) {
      const row = el('div', 'specimen-row');
      const tube = el('span', 'tube-dot');
      tube.style.background = tubeCssColor(specimen.tube);
      row.append(
        tube,
        el(
          'span',
          undefined,
          `${TEST_LABEL[specimen.test]} · ${specimen.label.name} · DOB ${specimen.label.dob} · ${specimen.fillMl.toFixed(1)} mL`,
        ),
      );
      list.append(row);
    }
    return list;
  }

  private findProcessTarget(snapshot: Snapshot, kind: 'centrifuge' | 'aliquot'): TestCode | null {
    const order = snapshot.activeOrder;
    if (!order) return null;
    for (const test of order.tests) {
      const def = TESTS[test];
      const specimen = order.specimens.find((s) => s.test === test);
      if (!specimen || !specimen.accessioned || specimen.rejected) continue;
      if (kind === 'centrifuge' && def.centrifuge && !specimen.centrifuged) return test;
      if (kind === 'aliquot' && def.aliquot && specimen.centrifuged && !specimen.aliquoted) return test;
    }
    return null;
  }

  private findUnspun(snapshot: Snapshot): TestCode | null {
    const order = snapshot.activeOrder;
    if (!order) return null;
    for (const test of order.tests) {
      const specimen = order.specimens.find((s) => s.test === test);
      if (specimen && specimen.accessioned && !specimen.rejected && TESTS[test].centrifuge && !specimen.centrifuged) {
        return test;
      }
    }
    return null;
  }

  private findTest(snapshot: Snapshot, test: TestCode): TestCode | null {
    return snapshot.activeOrder?.tests.includes(test) ? test : null;
  }

  // -------------------------------------------------------------- minigames

  launchMinigame(key: string, context: MinigameContext): void {
    const scene = this.game.scene.getScene(key);
    if (!scene || !this.game.scene.keys[key]) {
      this.toast('This station is not available yet.', 'warn');
      return;
    }
    this.activeMinigame = context;
    const payload = this.minigamePayload(key, context);
    const lab = this.game.scene.getScene('LabScene');
    if (!lab) {
      this.toast('The lab floor is not running.', 'warn');
      return;
    }
    lab.scene.launch(key, payload);
    lab.scene.pause();
    this.root.classList.add('minigame-open');
    this.showMinigameChrome(key);
  }

  private minigamePayload(key: string, context: MinigameContext): Record<string, unknown> {
    const snapshot = this.engine.getSnapshot();
    const order = snapshot.activeOrder;
    const test = context.test;
    switch (key) {
      case 'QcScene':
        return { qc: this.engine.def_.qc };
      case 'AccessionScene':
        return { order, sex: order?.patient.sex ?? 'F' };
      case 'CentrifugeScene':
        return {
          test,
          tube: test ? TESTS[test].tube : null,
          minutes: test ? TESTS[test].centrifugeMinutes : 10,
          minutesOptions: [10, 15, 5],
        };
      case 'PipetteScene':
        return {
          test,
          fluid: test === 'PT_INR' ? 'plasma' : 'serum',
        };
      default:
        return {};
    }
  }

  private completeMinigame(payload: { key: string; result: unknown }): void {
    const context = this.activeMinigame;
    this.activeMinigame = null;
    this.game.scene.stop(payload.key);
    if (this.game.scene.isPaused('LabScene')) this.game.scene.resume('LabScene');
    this.root.classList.remove('minigame-open');
    this.removeMinigameChrome();
    const result = payload.result as Record<string, unknown> | null;
    if (!result) return;
    if (payload.key === 'QcScene') {
      this.engine.completeQc(result as never);
      this.toast('QC accepted. Patient testing unlocked.', 'success');
    } else if (payload.key === 'AccessionScene') {
      this.engine.accession(result as never);
    } else if (payload.key === 'CentrifugeScene' && context?.test) {
      this.engine.centrifuge(context.test, result as never);
    } else if (payload.key === 'PipetteScene' && context?.test) {
      this.engine.aliquot(context.test, result as never);
    }
    bus.emit('minigame:result', payload);
  }

  private showMinigameChrome(key: string): void {
    this.removeMinigameChrome();
    const wrap = el('div', 'mg-controls');
    const help = button('?', 'btn-icon', () => this.openMinigameHelp(key), { ariaLabel: 'Minigame help' });
    const exit = button('Exit', 'btn-small', () => this.exitMinigame(key), { ariaLabel: 'Leave this station' });
    wrap.append(help, exit);
    this.root.append(wrap);
    this.mgChrome = wrap;
  }

  private removeMinigameChrome(): void {
    this.mgChrome?.remove();
    this.mgChrome = null;
  }

  private openMinigameHelp(key: string): void {
    const help: Record<string, string> = {
      QcScene: 'Tap a control point, then choose Accept or the rule it violates. COAG level 1 sits beyond 3 SD: flag 1_3s, repeat the control, then accept the repeat.',
      AccessionScene: 'Drag each tube to the scanner, check identifiers, then accept or reject. Answer the order-of-draw question when it appears.',
      CentrifugeScene: 'Place the sample tube and its balance tube in opposite slots, choose the correct preset, then start the spin.',
      PipetteScene: 'Press and hold Aspirate until the gauge reaches 500 µL, release, then dispense into the cup.',
    };
    const body = el('div');
    body.append(el('p', undefined, help[key] ?? 'Follow the on-screen instructions.'));
    this.openModal({ title: 'HOW THIS WORKS', body, footer: [button('Got it', 'btn-primary', () => this.closeAllModals())] });
  }

  exitMinigame(key: string): void {
    this.game.scene.stop(key);
    if (this.game.scene.isPaused('LabScene')) this.game.scene.resume('LabScene');
    this.root.classList.remove('minigame-open');
    this.removeMinigameChrome();
    this.activeMinigame = null;
    this.toast('Left the station. The objective is unchanged.', 'info');
  }

  forceMinigame(key: string): void {
    const snapshot = this.engine.getSnapshot();
    if (key === 'QcScene') this.launchMinigame(key, { key });
    else if (key === 'AccessionScene') this.launchMinigame(key, { key });
    else if (key === 'CentrifugeScene') {
      const test = this.findProcessTarget(snapshot, 'centrifuge');
      if (test) this.launchMinigame(key, { key, test });
    } else if (key === 'PipetteScene') {
      const test = this.findProcessTarget(snapshot, 'aliquot');
      if (test) this.launchMinigame(key, { key, test });
    }
  }

  // ---------------------------------------------------------------- pause

  private pauseForUI(): void {
    if (this.engine.isPaused()) return;
    this.engine.pauseTimer();
    this.uiPaused = true;
  }

  private resumeFromUI(): void {
    if (!this.uiPaused) return;
    this.uiPaused = false;
    this.engine.resumeTimer();
    this.toast('Shift timer resumed.', 'info');
  }

  private journalTabForObjective(): string {
    const kind = this.engine.getObjective().kind;
    if (kind === 'qc') return 'qc';
    if (kind === 'accession' || kind === 'reject' || kind === 'centrifuge' || kind === 'aliquot') return 'order';
    if (kind === 'review' || kind === 'release' || kind === 'close') return 'crit';
    return 'tests';
  }

  openJournal(startTab = 'tests'): void {
    this.pauseForUI();
    const body = el('div');
    const tabs = el('div', 'tabs');
    const content = el('div');
    const unlocked = this.unlockedEntries();
    let active = startTab;
    const renderTab = (): void => {
      clear(content);
      const tab = JOURNAL_TABS.find((t) => t.id === active) ?? JOURNAL_TABS[0];
      for (const entryId of tab.entries) {
        const card = LAW_CARDS.find((c) => c.id === entryId);
        if (!card) continue;
        if (!unlocked.has(entryId)) {
          const locked = el('div', 'journal-entry locked');
          locked.append(el('h3', undefined, card.title), el('p', undefined, 'Run the related sample to unlock.'));
          content.append(locked);
          continue;
        }
        const entry = el('div', 'journal-entry');
        entry.append(el('h3', undefined, card.title), el('p', undefined, card.body));
        if (card.source.startsWith('http')) {
          const src = el('div', 'src');
          src.append(link(new URL(card.source).hostname, card.source));
          entry.append(src);
        }
        content.append(entry);
      }
      if (tab.id === 'sources') {
        for (const source of SOURCES) {
          const entry = el('div', 'journal-entry');
          entry.append(el('h3', undefined, source.label), link(new URL(source.href).hostname, source.href));
          content.append(entry);
        }
        const note = el('div', 'journal-entry');
        note.append(
          el('h3', undefined, 'Simulation values'),
          el('p', undefined, 'All laboratory numbers in this game are teaching values. Laboratory-validated intervals always prevail.'),
        );
        content.append(note);
      }
      for (const node of Array.from(tabs.children)) {
        node.classList.toggle('active', (node as HTMLElement).dataset.tab === active);
      }
    };
    for (const tab of JOURNAL_TABS) {
      const b = button(tab.label, 'tab', () => {
        active = tab.id;
        renderTab();
      });
      b.dataset.tab = tab.id;
      tabs.append(b);
    }
    body.append(tabs, content);
    renderTab();
    this.openModal({
      title: 'JOURNAL',
      body,
      footer: [button('Close', 'btn-primary', () => this.closeAllModals())],
      onClose: () => this.resumeFromUI(),
    });
  }

  private unlockedEntries(): Set<string> {
    const unlocked = new Set<string>(this.save.journal);
    for (const id of this.engine.getSnapshot().journalUnlocked) unlocked.add(id);
    return unlocked;
  }

  openPause(): void {
    this.pauseForUI();
    const body = el('div');
    const settings = this.save.settings;
    const mute = button(settings.muted ? 'Unmute' : 'Mute', 'btn-ghost', () => {
      const muted = !this.save.settings.muted;
      this.save.setSettings({ muted });
      mute.textContent = muted ? 'Unmute' : 'Mute';
      bus.emit('audio:settings', { muted, volume: this.save.settings.volume });
    });
    const volume = el('input');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '100';
    volume.value = String(Math.round(settings.volume * 100));
    volume.setAttribute('aria-label', 'Volume');
    volume.addEventListener('input', () => {
      const vol = Number(volume.value) / 100;
      this.save.setSettings({ volume: vol });
      bus.emit('audio:settings', { muted: this.save.settings.muted, volume: vol });
    });
    const volumeRow = el('div', 'volume-row');
    volumeRow.append(el('span', undefined, 'Volume'), volume);
    body.append(mute, volumeRow);
    const restart = button('Restart shift', 'btn-danger', () => {
      this.confirm('Restart shift?', 'Current progress and score will be discarded.', () => this.onRestartShift?.());
    });
    const quit = button('Quit to title', 'btn-danger', () => {
      this.confirm('Quit to title?', 'Current shift progress will be lost.', () => this.onQuitToTitle?.());
    });
    const row = el('div', 'btn-row');
    row.append(restart, quit);
    body.append(row);
    this.openModal({
      title: 'PAUSED',
      body,
      footer: [
        button('Resume', 'btn-primary', () => this.closeAllModals()),
        button('Close', 'btn-ghost', () => this.closeAllModals()),
      ],
      onClose: () => this.resumeFromUI(),
    });
  }

  openSettings(): void {
    const body = el('div');
    const settings = this.save.settings;
    body.append(el('p', undefined, 'Audio settings are shared across shifts.'));
    const mute = button(settings.muted ? 'Unmute' : 'Mute', 'btn-primary', () => {
      const muted = !this.save.settings.muted;
      this.save.setSettings({ muted });
      bus.emit('audio:settings', { muted, volume: this.save.settings.volume });
      this.closeAllModals();
    });
    body.append(mute);
    this.openModal({ title: 'SETTINGS', body, footer: [button('Close', 'btn-ghost', () => this.closeAllModals())] });
  }

  private confirm(title: string, message: string, action: () => void): void {
    const body = el('div');
    body.append(el('p', undefined, message));
    this.openModal({
      title,
      body,
      footer: [
        button('Cancel', 'btn-ghost', () => this.closeAllModals()),
        button('Confirm', 'btn-danger', () => {
          this.closeAllModals();
          action();
        }),
      ],
    });
  }

  // ---------------------------------------------------------------- toasts

  toast(message: string, tone: ToastTone = 'info', ms = 2500): void {
    const node = el('div', `toast ${tone}`, message);
    this.toastWrap.append(node);
    while (this.toastWrap.children.length > 2) this.toastWrap.firstElementChild?.remove();
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      node.remove();
      this.toastTimer = null;
    }, ms);
  }

  // ---------------------------------------------------------------- modals

  openModal(opts: ModalOptions): ModalHandle {
    const id = ++modalSeq;
    const backdrop = el('div', 'modal-backdrop');
    backdrop.style.pointerEvents = 'auto';
    backdrop.dataset.modalId = String(id);
    const modal = el('div', 'modal');
    if (opts.id) modal.id = opts.id;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', opts.title);
    const head = el('div', 'modal-head');
    const title = el('div', 'modal-title', opts.title);
    const closeBtn = button('✕', 'btn-icon modal-close', () => this.closeModal(id), { ariaLabel: 'Close dialog' });
    head.append(title, closeBtn);
    const body = el('div', 'modal-body');
    body.append(opts.body);
    modal.append(head, body);
    if (opts.footer && opts.footer.length) {
      const foot = el('div', 'modal-foot');
      foot.append(...opts.footer);
      modal.append(foot);
    }
    backdrop.append(modal);
    const dismissible = opts.dismissible !== false;
    closeBtn.style.display = dismissible ? '' : 'none';
    this.modalHost.append(backdrop);
    this.modalStack.push({ id, node: backdrop, dismissible, onClose: opts.onClose });
    this.root.classList.add('modal-open');
    backdrop.addEventListener('pointerdown', (ev) => {
      if (ev.target === backdrop && dismissible) this.closeModal(id);
    });
    const first = Array.from(
      modal.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea'),
    ).find((n) => n.offsetParent !== null);
    body.scrollTop = 0;
    window.setTimeout(() => first?.focus({ preventScroll: true }), 0);
    return { root: backdrop, close: () => this.closeModal(id) };
  }

  closeModal(id: number): void {
    const idx = this.modalStack.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const [entry] = this.modalStack.splice(idx, 1);
    entry.node.remove();
    entry.onClose?.();
    if (!this.modalStack.length) this.root.classList.remove('modal-open');
    const top = this.modalStack[this.modalStack.length - 1];
    if (top) {
      const focusable = top.node.querySelector<HTMLElement>('button:not([disabled]), a[href], input');
      focusable?.focus({ preventScroll: true });
    }
  }

  closeAllModals(): void {
    while (this.modalStack.length) {
      const entry = this.modalStack.pop();
      entry?.node.remove();
      entry?.onClose?.();
    }
    this.root.classList.remove('modal-open');
  }

  private onKeyDown = (ev: KeyboardEvent): void => {
    const top = this.modalStack[this.modalStack.length - 1];
    if (!top) return;
    if (ev.key === 'Escape' && top.dismissible) {
      ev.preventDefault();
      ev.stopPropagation();
      this.closeModal(top.id);
      return;
    }
    if (ev.key !== 'Tab') return;
    const focusable = Array.from(
      top.node.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])'),
    ).filter((n) => n.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (ev.shiftKey && active === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault();
      first.focus();
    }
  };

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.unsubscribeEngine?.();
    this.closeAllModals();
    this.root.innerHTML = '';
  }
}

const CELLS: [number, number, number][] = [
  [28, 30, 8], [58, 22, 7], [88, 34, 9], [124, 24, 8], [156, 36, 7], [188, 22, 9],
  [222, 32, 8], [254, 24, 7], [288, 34, 8], [42, 56, 7], [74, 50, 9], [108, 60, 8],
  [142, 52, 7], [176, 62, 9], [210, 52, 8], [244, 60, 7], [278, 52, 9], [24, 86, 7],
  [56, 92, 8], [90, 84, 7], [122, 96, 8], [158, 86, 9], [192, 96, 7], [226, 86, 8],
  [260, 96, 9], [294, 86, 7], [38, 122, 8], [72, 116, 7], [104, 126, 9], [138, 118, 8],
  [172, 128, 7], [206, 118, 9], [240, 126, 8], [274, 118, 7], [306, 128, 8], [12, 60, 6],
  [310, 60, 6], [12, 112, 6], [310, 112, 6],
];

function smearSvg(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 320 150');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Peripheral smear: small red cells with wide pale centers');
  svg.classList.add('smear-svg');
  for (const [cx, cy, r] of CELLS) {
    const outer = document.createElementNS(NS, 'circle');
    outer.setAttribute('cx', String(cx));
    outer.setAttribute('cy', String(cy));
    outer.setAttribute('r', String(r));
    outer.setAttribute('fill', '#f2a0b4');
    outer.setAttribute('stroke', '#b0193f');
    outer.setAttribute('stroke-width', '1');
    svg.append(outer);
    const center = document.createElementNS(NS, 'circle');
    center.setAttribute('cx', String(cx));
    center.setAttribute('cy', String(cy));
    center.setAttribute('r', String(r * 0.32));
    center.setAttribute('fill', '#fbe3ea');
    svg.append(center);
  }
  for (const [cx, cy] of [
    [20, 18], [70, 78], [150, 16], [200, 78], [240, 12], [300, 96], [96, 138], [266, 140],
  ]) {
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', String(cx));
    dot.setAttribute('cy', String(cy));
    dot.setAttribute('r', '1.6');
    dot.setAttribute('fill', '#ffd9e2');
    svg.append(dot);
  }
  return svg;
}
