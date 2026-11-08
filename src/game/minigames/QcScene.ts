import Phaser from 'phaser';
import type { AnalyzerId, QcDef } from '../types';
import { haptic } from '../audio/AudioManager';
import { MinigameScene } from './base';

interface TabState {
  def: QcDef;
  cleared: boolean;
  failFlagged: boolean;
  repeatShown: boolean;
}

type Rule = 'accept' | '1_3s' | '2_2s';

const ANALYZERS: AnalyzerId[] = ['CHEM', 'HEMA', 'COAG'];
const CHART = { x: -164, y: -206, w: 328, h: 248, maxSd: 3.6 };
const SHEET = { x: -172, y: 52, w: 344, h: 164 };

export class QcScene extends MinigameScene {
  private tabs: Record<AnalyzerId, TabState> = {} as Record<AnalyzerId, TabState>;
  private active: AnalyzerId = 'CHEM';
  private sheet: { point: number; level: number; sd: number; kind: 'normal' | 'fail' | 'repeat' } | null = null;

  constructor() {
    super('QcScene');
  }

  create(data: { qc?: QcDef[] }): void {
    this.setupStage();
    const defs = data.qc ?? [];
    for (const id of ANALYZERS) {
      const def = defs.find((q) => q.analyzer === id) ?? { analyzer: id, levels: [] };
      this.tabs[id] = { def, cleared: false, failFlagged: false, repeatShown: false };
    }
    this.active = 'CHEM';
    this.sheet = null;
    this.render();
  }

  private yFor(sd: number): number {
    return CHART.y + CHART.h / 2 - (sd / CHART.maxSd) * (CHART.h / 2);
  }

  private xFor(run: number): number {
    return CHART.x + 48 + (run - 1) * 116;
  }

  private render(): void {
    this.stage.removeAll(true);
    const cleared = ANALYZERS.filter((id) => this.tabs[id].cleared).length;
    this.panel(-180, -320, 360, 640, 0x0b1220, 1);
    this.text(-164, -306, 'MORNING QC', 18, '#5eead4', '"Kenney Pixel"');
    this.text(100, -304, `${cleared}/3 CLEARED`, 11, cleared === 3 ? '#06d6a0' : '#9fb3c8', '"Kenney Pixel"', 'center');
    const sub = this.text(-164, -282, 'Levey–Jennings · mean 100, SD 5 · accept only within limits', 10, '#9fb3c8');
    sub.setWordWrapWidth(328);

    ANALYZERS.forEach((id, i) => {
      const state = this.tabs[id];
      const x = -110 + i * 110;
      const variant = state.cleared ? 'ghost' : id === this.active ? 'primary' : 'ghost';
      const label = state.cleared ? `${id} ✓` : id;
      this.button(x, -240, 104, 44, label, () => {
        this.active = id;
        this.sheet = null;
        this.render();
      }, variant);
    });

    this.drawChart();
    if (this.sheet) this.drawSheet();
    else this.drawIdle();
    this.drawFooter();
  }

  private drawChart(): void {
    const state = this.tabs[this.active];
    const g = this.add.graphics();
    g.fillStyle(0x0e1a2b, 1);
    g.fillRect(CHART.x, CHART.y, CHART.w, CHART.h);
    g.lineStyle(1, 0x2b4a6f, 0.9);
    g.strokeRect(CHART.x, CHART.y, CHART.w, CHART.h);
    for (const sd of [1, 2, 3, -1, -2, -3]) {
      g.lineStyle(sd === 3 || sd === -3 ? 1.5 : 1, sd === 3 || sd === -3 ? 0xef476f : 0x2b4a6f, 0.8);
      g.lineBetween(CHART.x, this.yFor(sd), CHART.x + CHART.w, this.yFor(sd));
    }
    g.lineStyle(2, 0x2ec4b6, 0.9);
    g.lineBetween(CHART.x, this.yFor(0), CHART.x + CHART.w, this.yFor(0));
    this.stage.add(g);

    this.text(CHART.x + 16, this.yFor(0) - 8, '0', 10, '#9fb3c8', '"Kenney Pixel"', 'center');
    for (const sd of [3, 2, 1, -1, -2, -3]) {
      this.text(CHART.x + 16, this.yFor(sd) - 8, `${sd > 0 ? '+' : ''}${sd}`, 10, '#9fb3c8', '"Kenney Pixel"', 'center');
    }
    this.text(CHART.x + CHART.w - 10, CHART.y + 8, this.active, 12, '#5eead4', '"Kenney Pixel"', 'center');

    for (let run = 1; run <= state.def.levels.length; run++) {
      this.text(this.xFor(run), CHART.y + CHART.h - 16, String(run), 10, '#9fb3c8', '"Kenney Pixel"', 'center');
    }

    if (!state.def.levels.length) {
      const note = this.text(
        CHART.x + CHART.w / 2,
        CHART.y + CHART.h / 2 - 10,
        'No control data',
        14,
        '#9fb3c8',
        '"Kenney Pixel"',
        'center',
      );
      note.setWordWrapWidth(CHART.w - 24);
      return;
    }

    state.def.levels.forEach((level, index) => {
      const isFail = state.def.fail?.level === level.level;
      const x = this.xFor(index + 1);
      const y = this.yFor(Math.max(-CHART.maxSd, Math.min(CHART.maxSd, level.sd)));
      const color = isFail && !state.failFlagged ? 0xef476f : 0x2ec4b6;
      const dot = this.add.circle(x, y, 9, color, 1).setStrokeStyle(2, 0xffffff, 0.85);
      dot.setInteractive(new Phaser.Geom.Circle(0, 0, 24), Phaser.Geom.Circle.Contains);
      dot.setName(`point-${level.level}`);
      dot.on('pointerdown', () => {
        this.sfx('click');
        this.sheet = { point: index, level: level.level, sd: level.sd, kind: isFail ? 'fail' : 'normal' };
        this.render();
      });
      this.stage.add(dot);
      const labelY = y < CHART.y + 44 ? y + 24 : y - 28;
      this.text(x, labelY, `${level.sd > 0 ? '+' : ''}${level.sd.toFixed(1)} SD`, 10, isFail ? '#ef476f' : '#e6f1ff', '"Kenney Pixel"', 'center');
      if (level.sd > CHART.maxSd) {
        const arrow = this.add.triangle(x, y - 12, 0, 8, 8, 8, 4, 0, 0xef476f, 1);
        this.stage.add(arrow);
      }
    });

    if (state.def.repeat && state.repeatShown) {
      const x = this.xFor(state.def.levels.length + 1);
      const y = this.yFor(state.def.repeat.sd);
      const dot = this.add.circle(x, y, 9, 0x06d6a0, 1).setStrokeStyle(2, 0xffffff, 0.85);
      dot.setInteractive(new Phaser.Geom.Circle(0, 0, 24), Phaser.Geom.Circle.Contains);
      dot.setName('point-repeat');
      dot.on('pointerdown', () => {
        this.sfx('click');
        this.sheet = { point: 99, level: state.def.repeat?.level ?? 1, sd: state.def.repeat?.sd ?? 0, kind: 'repeat' };
        this.render();
      });
      this.stage.add(dot);
      const labelY = y < CHART.y + 44 ? y + 24 : y - 28;
      this.text(x, labelY, `+${state.def.repeat.sd.toFixed(1)} SD`, 10, '#06d6a0', '"Kenney Pixel"', 'center');
      this.text(x, CHART.y + CHART.h - 16, 'R', 10, '#06d6a0', '"Kenney Pixel"', 'center');
    }
  }

  private drawIdle(): void {
    const state = this.tabs[this.active];
    if (state.failFlagged && !state.repeatShown && state.def.repeat) {
      this.text(-164, 60, 'Run rejected at 1_3s. Repeat the control before accepting.', 11, '#9fb3c8').setWordWrapWidth(328);
      this.button(0, 138, 320, 52, 'Repeat control', () => {
        state.repeatShown = true;
        this.sheet = null;
        this.banner('Run rejected at 1_3s. Repeat the control.', 'oops');
        this.render();
      }, 'amber');
      return;
    }
    this.text(-164, 60, 'Tap a control point to review it.', 12, '#9fb3c8').setWordWrapWidth(328);
  }

  private drawSheet(): void {
    const sheet = this.sheet;
    if (!sheet) return;
    this.panel(SHEET.x, SHEET.y, SHEET.w, SHEET.h, 0x0e1a2b, 1);
    const label =
      sheet.kind === 'fail'
        ? `Level ${sheet.level} · ${sheet.sd > 0 ? '+' : ''}${sheet.sd.toFixed(1)} SD — beyond 3 SD`
        : sheet.kind === 'repeat'
          ? `Repeat control · ${sheet.sd > 0 ? '+' : ''}${sheet.sd.toFixed(1)} SD`
          : `Level ${sheet.level} · ${sheet.sd > 0 ? '+' : ''}${sheet.sd.toFixed(1)} SD — within limits`;
    this.text(SHEET.x + 12, SHEET.y + 10, label, 11, '#e6f1ff').setWordWrapWidth(SHEET.w - 24);
    this.button(-82, 126, 160, 48, 'Accept', () => this.choose('accept'), 'primary');
    this.button(82, 126, 160, 48, '1_3s', () => this.choose('1_3s'), 'danger');
    this.button(-82, 184, 160, 48, '2_2s', () => this.choose('2_2s'), 'danger');
    this.button(82, 184, 160, 48, 'Cancel', () => {
      this.sheet = null;
      this.render();
    }, 'ghost');
  }

  private drawFooter(): void {
    const allCleared = ANALYZERS.every((id) => this.tabs[id].cleared);
    const complete = this.button(0, 268, 320, 56, 'QC complete', () => {
      this.finish({
        cleared: { CHEM: true, HEMA: true, COAG: true },
        flagged: this.tabs.COAG.failFlagged ? [{ analyzer: 'COAG', level: 1, rule: '1_3s' }] : [],
      });
    }, allCleared ? 'primary' : 'ghost');
    if (!allCleared) {
      complete.disableInteractive();
      complete.setAlpha(0.5);
    }
  }

  private choose(rule: Rule): void {
    if (!this.sheet) return;
    const { kind, level } = this.sheet;
    const state = this.tabs[this.active];
    const engine = this.engine();

    if (kind === 'fail') {
      if (rule === '1_3s') {
        state.failFlagged = true;
        haptic(12);
        this.sheet = null;
        this.banner('1_3s violation. Run rejected — repeat the control.', 'oops');
        this.render();
        return;
      }
      if (rule === '2_2s') {
        engine?.applyPenalty('false_qc_flag', 'This is a single point beyond 3 SD: 1_3s, not 2_2s.');
        haptic(24);
        this.sheet = null;
        this.banner('One point beyond 3 SD is 1_3s, not 2_2s.', 'oops');
        this.render();
        return;
      }
      engine?.applyPenalty('accept_failed_qc', `Accepted level ${level} at ${this.sheet.sd.toFixed(1)} SD: 1_3s violation.`);
      haptic(24);
      this.sheet = null;
      this.banner('1_3s violation — patient results would be invalid.', 'oops');
      this.render();
      return;
    }

    if (rule !== 'accept') {
      engine?.applyPenalty('false_qc_flag', 'Flagged a control point that is within limits.');
      haptic(24);
      this.sheet = null;
      this.banner('That point is within limits. Flagging it costs accuracy.', 'oops');
      this.render();
      return;
    }

    state.cleared = true;
    haptic(12);
    this.sheet = null;
    this.banner(`${this.active} accepted.`, 'good');
    this.render();
  }
}
