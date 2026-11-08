import Phaser from 'phaser';
import { TESTS } from '../content/tests';
import { correctOrderOfDraw, tubeColor } from '../rules';
import type { AccessionDecision, OrderView, RejectReason, TubeType } from '../types';
import { haptic } from '../audio/AudioManager';
import { MinigameScene } from './base';

type Phase = 'scan' | 'verify' | 'reject' | 'order';

const REASONS: { label: string; reason: RejectReason }[] = [
  { label: 'Label mismatch', reason: 'label_mismatch' },
  { label: 'Short draw', reason: 'short_draw' },
  { label: 'Wrong tube', reason: 'wrong_tube' },
];

export class AccessionScene extends MinigameScene {
  private order: OrderView | null = null;
  private index = 0;
  private phase: Phase = 'scan';
  private selected = false;
  private checked = false;
  private decisions: AccessionDecision[] = [];
  private drawOrder: TubeType[] = [];
  private dragging = false;

  constructor() {
    super('AccessionScene');
  }

  create(data: { order?: OrderView | null }): void {
    this.setupStage();
    this.order = data.order ?? null;
    this.index = 0;
    this.phase = 'scan';
    this.selected = false;
    this.checked = false;
    this.decisions = [];
    this.drawOrder = [];
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerup', this.handlePointerUp, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    });
    this.render();
  }

  private handleResize = (): void => this.render();

  private handlePointerUp = (): void => {
    if (this.phase !== 'scan' || !this.dragging) return;
    this.dragging = false;
  };

  /** Canvas-space point -> stage-local point; the stage container is scaled and centered. */
  private stageLocal(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.stage.x) / this.stageScale, y: (y - this.stage.y) / this.stageScale };
  }

  private specimen(): OrderView['specimens'][number] | null {
    return this.order?.specimens[this.index] ?? null;
  }

  private render(): void {
    this.stage.removeAll(true);
    if (!this.order) {
      this.text(-164, -306, 'ACCESSION', 18, '#5eead4', '"Kenney Pixel"');
      this.text(-164, -282, 'Receive a sample first.', 13, '#ffd9e1');
      return;
    }
    this.panel(-180, -320, 360, 640, 0x0b1220, 1);
    this.text(-164, -306, 'ACCESSION', 18, '#5eead4', '"Kenney Pixel"');
    this.text(
      100,
      -304,
      `TUBE ${Math.min(this.index + 1, this.order.specimens.length)} / ${this.order.specimens.length}`,
      11,
      '#9fb3c8',
      '"Kenney Pixel"',
      'center',
    );
    if (this.phase === 'scan') this.renderScan();
    else if (this.phase === 'verify' || this.phase === 'reject') this.renderVerify();
    else if (this.phase === 'order') this.renderOrderOfDraw();
  }

  // ------------------------------------------------------------------ scan

  private renderScan(): void {
    const specimen = this.specimen();
    if (!specimen) return;
    this.text(-164, -282, `${this.order?.patient.name} · ${TESTS[specimen.test].name}`, 12, '#e6f1ff').setWordWrapWidth(328);
    const hint = this.text(-164, -262, 'Drag the tube onto the scanner, or tap the tube then the scanner.', 10, '#9fb3c8');
    hint.setWordWrapWidth(328);

    const scannerX = 0;
    const scannerY = -140;
    const scanner = this.add.rectangle(scannerX, scannerY, 130, 180, 0x0e1a2b, 1).setStrokeStyle(2, 0x2ec4b6);
    scanner.setInteractive({ useHandCursor: true });
    this.stage.add(scanner);
    const beam = this.add.rectangle(scannerX, scannerY, 104, 6, 0x2ec4b6, 0.6);
    this.stage.add(beam);
    this.tweens.add({ targets: beam, y: scannerY + 60, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.text(scannerX, scannerY + 96, 'SCANNER', 10, '#5eead4', '"Kenney Pixel"', 'center');

    const tubeX = 0;
    const tubeY = 88;
    const tube = this.drawTube(0, 0, specimen.tube, 54, 128);
    const cap = this.add.rectangle(0, -64, 54, 14, 0xe6f1ff, 1).setStrokeStyle(1, 0x0b1220);
    const label = this.add.rectangle(0, 14, 40, 52, 0xffffff, 0.92);
    const ink = this.add.rectangle(0, 8, 30, 3, 0x132238, 0.8).setOrigin(0.5);
    tube.add([cap, label, ink]);
    const container = this.add.container(tubeX, tubeY, [tube]);
    container.setSize(60, 140);
    container.setInteractive({ draggable: true, useHandCursor: true });
    this.input.setDraggable(container);
    this.stage.add(container);
    const home = { x: tubeX, y: tubeY };
    let grabX = 0;
    let grabY = 0;
    container.on('dragstart', (pointer: Phaser.Input.Pointer) => {
      const p = this.stageLocal(pointer.x, pointer.y);
      grabX = container.x - p.x;
      grabY = container.y - p.y;
    });
    container.on('drag', (pointer: Phaser.Input.Pointer) => {
      this.dragging = true;
      const p = this.stageLocal(pointer.x, pointer.y);
      container.setPosition(p.x + grabX, p.y + grabY);
    });
    container.on('dragend', () => {
      const near = Math.hypot(container.x - scannerX, container.y - scannerY) < 110;
      if (near) this.scan();
      else container.setPosition(home.x, home.y);
    });
    container.on('pointerup', () => {
      if (!this.dragging) {
        this.selected = true;
        this.tintSelected(container);
      }
      this.dragging = false;
    });
    scanner.on('pointerdown', () => {
      if (this.selected || Phaser.Math.Distance.Between(container.x, container.y, scannerX, scannerY) < 110) {
        this.scan();
      }
    });

    this.text(tubeX, tubeY + 84, `${TESTS[specimen.test].tube.replaceAll('_', ' ')} · ${specimen.fillMl.toFixed(1)} mL`, 10, '#9fb3c8', '"Kenney Pixel"', 'center');
    this.text(-164, 220, 'Two identifiers. Never relabel a tube.', 11, '#ffb703').setWordWrapWidth(328);
  }

  private tintSelected(container: Phaser.GameObjects.Container): void {
    container.setAlpha(0.85);
    this.time.delayedCall(200, () => container.setAlpha(1));
  }

  private scan(): void {
    this.sfx('scan');
    this.banner('Barcode read.', 'good');
    this.phase = 'verify';
    this.checked = false;
    this.render();
  }

  // ---------------------------------------------------------------- verify

  private renderVerify(): void {
    const specimen = this.specimen();
    if (!specimen || !this.order) return;
    const patient = this.order.patient;
    const mismatch = specimen.label.dob !== patient.dob;
    const card = (x: number, y: number, title: string, rows: [string, string][], highlight: boolean): void => {
      this.panel(x, y, 344, 112, 0x132238, 1);
      this.text(x + 12, y + 10, title, 11, '#5eead4', '"Kenney Pixel"');
      rows.forEach(([k, v], i) => {
        const bad = highlight && k === 'DOB' && mismatch && this.checked;
        this.text(x + 12, y + 34 + i * 26, k.toUpperCase(), 9, '#9fb3c8', '"Kenney Pixel"');
        this.text(x + 96, y + 32 + i * 26, v, 13, bad ? '#ef476f' : '#e6f1ff');
        if (bad) {
          const line = this.add.rectangle(x + 96, y + 47 + i * 26, 150, 2, 0xef476f, 1).setOrigin(0, 0.5);
          this.stage.add(line);
        }
      });
    };
    card(-172, -250, 'REQUISITION', [
      ['Name', patient.name],
      ['DOB', patient.dob],
      ['MRN', patient.mrn],
    ], false);
    card(-172, -130, 'TUBE LABEL', [
      ['Name', specimen.label.name],
      ['DOB', specimen.label.dob],
      ['MRN', specimen.label.mrn],
    ], true);

    this.text(-164, -2, `Tube: ${TESTS[specimen.test].tube.replaceAll('_', ' ')}   Fill: ${specimen.fillMl.toFixed(1)} mL   Min: ${TESTS[specimen.test].minFillMl.toFixed(1)} mL`, 11, '#e6f1ff').setWordWrapWidth(328);
    if (this.checked) {
      this.text(
        -164,
        18,
        mismatch ? 'DOB does not match the requisition.' : 'Identifiers and fill volume match.',
        12,
        mismatch ? '#ef476f' : '#06d6a0',
      ).setWordWrapWidth(328);
    }

    if (this.phase === 'reject') {
      REASONS.forEach((r, i) => {
        this.button(0, 74 + i * 52, 320, 44, r.label, () => this.decide(false, r.reason), 'danger');
      });
      this.button(0, 240, 320, 44, 'Cancel', () => {
        this.phase = 'verify';
        this.render();
      }, 'ghost');
      return;
    }

    this.button(0, 74, 320, 44, 'Check identifiers', () => {
      this.checked = true;
      this.sfx('click');
      this.render();
    }, 'ghost');

    this.button(-82, 134, 160, 52, 'Accept', () => this.decide(true), 'primary');
    this.button(82, 134, 160, 52, 'Reject', () => {
      this.phase = 'reject';
      this.render();
    }, 'danger');
    this.text(-164, 200, 'Rejecting a valid, correctly labeled tube costs integrity.', 11, '#9fb3c8').setWordWrapWidth(328);
  }

  private decide(accepted: boolean, reason?: RejectReason): void {
    const specimen = this.specimen();
    if (!specimen) return;
    this.decisions.push({ specimenId: specimen.id, accepted, reason });
    this.sfx(accepted ? 'confirm' : 'error', 0.5);
    haptic(accepted ? 12 : 24);
    this.index += 1;
    this.checked = false;
    this.phase = this.index >= (this.order?.specimens.length ?? 0) ? 'order' : 'scan';
    this.render();
  }

  // -------------------------------------------------------- order of draw

  private renderOrderOfDraw(): void {
    if (!this.order) return;
    this.phase = 'order';
    const tubes = [...new Set(this.order.specimens.map((s) => s.tube))];
    if (tubes.length < 2) {
      this.finish({ decisions: this.decisions });
      return;
    }
    this.text(-164, -262, 'Order of draw', 14, '#5eead4', '"Kenney Pixel"');
    this.text(-164, -240, 'Tap the tubes in the order they should be drawn.', 10, '#9fb3c8').setWordWrapWidth(328);
    const tubeTest = new Map<TubeType, string>();
    for (const spec of this.order.specimens) tubeTest.set(spec.tube, TESTS[spec.test].tube);
    tubes.forEach((tube, i) => {
      const y = -160 + i * 96;
      this.button(0, y, 320, 84, '', () => {
        if (this.drawOrder.includes(tube)) return;
        this.drawOrder.push(tube);
        this.sfx('click');
        this.render();
      }, 'ghost');
      const color = tubeColor(tube);
      const tubeShape = this.add.rectangle(-128, y, 26, 56, color, 1).setStrokeStyle(2, 0xe6f1ff);
      this.stage.add(tubeShape);
      this.text(-104, y - 12, (tubeTest.get(tube) ?? tube).replaceAll('_', ' '), 10, '#e6f1ff', '"Kenney Pixel"');
      const picked = this.drawOrder.indexOf(tube);
      if (picked >= 0) this.text(-104, y + 10, `#${picked + 1}`, 14, '#ffb703', '"Kenney Pixel"');
    });
    this.text(-164, 96, this.drawOrder.length ? `Selected: ${this.drawOrder.map((t) => t.replaceAll('_', ' ')).join(' → ')}` : 'Nothing selected yet.', 11, '#e6f1ff').setWordWrapWidth(328);
    this.button(-82, 160, 160, 52, 'Undo', () => {
      this.drawOrder.pop();
      this.render();
    }, 'ghost');
    this.button(82, 160, 160, 52, 'Confirm order', () => this.confirmOrder(), 'primary');
  }

  private confirmOrder(): void {
    if (!this.order) return;
    const tubes = [...new Set(this.order.specimens.map((s) => s.tube))];
    if (this.drawOrder.length !== tubes.length) {
      this.banner('Place every tube in the draw order first.', 'oops');
      return;
    }
    const expected = correctOrderOfDraw(tubes);
    const correct = this.drawOrder.every((tube, i) => tube === expected[i]);
    if (correct) {
      this.finish({ decisions: this.decisions, orderOfDraw: this.drawOrder });
      return;
    }
    this.banner(`Correct order: ${expected.map((t) => t.replaceAll('_', ' ')).join(' → ')}`, 'oops');
    this.time.delayedCall(1700, () => this.finish({ decisions: this.decisions, orderOfDraw: this.drawOrder }));
  }

  private drawTube(x: number, y: number, tube: TubeType, w: number, h: number): Phaser.GameObjects.Container {
    const body = this.add.rectangle(0, 0, w, h, 0xdfe9f5, 0.95).setStrokeStyle(2, 0xffffff);
    const liquid = this.add.rectangle(0, h / 4, w - 8, h / 2, tubeColor(tube), 1);
    const shine = this.add.rectangle(-w / 4, -h / 4, 4, h / 2, 0xffffff, 0.4);
    return this.add.container(x, y, [body, liquid, shine]);
  }
}
