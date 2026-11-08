import Phaser from 'phaser';
import type { TestCode } from '../types';
import { haptic } from '../audio/AudioManager';
import { MinigameScene } from './base';

interface Payload {
  test?: TestCode;
  fluid?: 'serum' | 'plasma';
}

const TARGET = 500;
const PERFECT = 25;
const ACCEPT = 50;
const MAX_VOLUME = 1000;
const RATE = 250; // µL per second
const GAUGE = { x: 90, top: -240, h: 260 };

export class PipetteScene extends MinigameScene {
  private test: TestCode | null = null;
  private fluid: 'serum' | 'plasma' = 'serum';
  private volume = 0;
  private holding = false;
  private attempts = 0;
  private overflowCount = 0;
  private busy = false;
  private liquid?: Phaser.GameObjects.Rectangle;
  private gaugeFill?: Phaser.GameObjects.Rectangle;
  private volumeText?: Phaser.GameObjects.Text;

  constructor() {
    super('PipetteScene');
  }

  create(data: Payload): void {
    this.setupStage();
    this.test = data.test ?? null;
    this.fluid = data.fluid ?? 'serum';
    this.volume = 0;
    this.holding = false;
    this.attempts = 0;
    this.overflowCount = 0;
    this.busy = false;
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.input.on('pointerup', this.stopHold, this);
    this.input.on('pointerupoutside', this.stopHold, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerup', this.stopHold, this);
      this.input.off('pointerupoutside', this.stopHold, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    });
    this.render();
  }

  private handleResize = (): void => this.render();

  private fluidColor(): number {
    return this.fluid === 'plasma' ? 0xe8e3b0 : 0xf2d16b;
  }

  update(_time: number, delta: number): void {
    if (!this.holding || this.busy) return;
    this.volume = Math.min(MAX_VOLUME, this.volume + (RATE * delta) / 1000);
    if (this.volume >= MAX_VOLUME) {
      this.holding = false;
      this.overflow();
    }
    this.updateLiquid();
  }

  private render(): void {
    this.stage.removeAll(true);
    this.panel(-180, -320, 360, 640, 0x0b1220, 1);
    this.text(-164, -306, 'ALIQUOT', 18, '#5eead4', '"Kenney Pixel"');
    this.text(-164, -282, `Pipette ${TARGET} µL ${this.fluid} into a sample cup`, 11, '#9fb3c8').setWordWrapWidth(328);

    // source tube
    const tubeX = -122;
    const tubeY = -150;
    const tube = this.add.rectangle(tubeX, tubeY, 48, 120, 0xdfe9f5, 0.9).setStrokeStyle(2, 0xffffff);
    const tubeLiquid = this.add.rectangle(tubeX, tubeY + 18, 40, 78, this.fluidColor(), 1);
    this.stage.add([tube, tubeLiquid]);
    this.text(tubeX, tubeY + 66, 'SOURCE', 9, '#9fb3c8', '"Kenney Pixel"', 'center');

    // pipette
    const pipetteX = -16;
    const pipette = this.add.container(pipetteX, -160);
    const body = this.add.rectangle(0, 0, 18, 150, 0xcfe8e6, 0.95).setStrokeStyle(2, 0xffffff);
    const tip = this.add.triangle(0, 84, -8, 0, 8, 0, 0, 18, 0xcfe8e6, 1);
    const plunger = this.add.rectangle(0, -84, 26, 14, 0x2b4a6f, 1).setStrokeStyle(2, 0x9fb3c8);
    this.liquid = this.add.rectangle(0, 0, 12, 1, this.fluidColor(), 1);
    pipette.add([body, tip, plunger, this.liquid]);
    pipette.setSize(96, 190);
    pipette.setInteractive({ useHandCursor: true });
    pipette.on('pointerdown', () => this.startHold());
    this.stage.add(pipette);
    this.text(pipetteX, -58, 'PIPETTE', 9, '#9fb3c8', '"Kenney Pixel"', 'center');

    // gauge
    const gauge = this.add.rectangle(GAUGE.x, GAUGE.top, 34, GAUGE.h, 0x0e1a2b, 1).setOrigin(0.5, 0).setStrokeStyle(2, 0x2b4a6f);
    this.stage.add(gauge);
    const bandH = ((ACCEPT * 2) / MAX_VOLUME) * GAUGE.h;
    const band = this.add.rectangle(GAUGE.x, GAUGE.top + GAUGE.h - (TARGET / MAX_VOLUME) * GAUGE.h - bandH / 2, 30, bandH, 0x06d6a0, 0.25);
    this.stage.add(band);
    this.gaugeFill = this.add.rectangle(GAUGE.x, GAUGE.top + GAUGE.h - 1, 28, 0, 0x2ec4b6, 0.85).setOrigin(0.5, 1);
    this.stage.add(this.gaugeFill);
    this.text(GAUGE.x, GAUGE.top - 20, 'µL', 10, '#9fb3c8', '"Kenney Pixel"', 'center');
    this.text(GAUGE.x, GAUGE.top + GAUGE.h + 6, '0', 10, '#9fb3c8', '"Kenney Pixel"', 'center');
    this.text(GAUGE.x, GAUGE.top - 6, `${MAX_VOLUME}`, 9, '#9fb3c8', '"Kenney Pixel"', 'center');
    this.volumeText = this.text(174, -210, `${Math.round(this.volume)} µL`, 15, '#e6f1ff', '"Kenney Pixel"', 'right');
    this.text(174, -188, `target ${TARGET} ±${ACCEPT}`, 9, '#06d6a0', '"Kenney Pixel"', 'right');

    // cup
    const cup = this.add.rectangle(142, -100, 64, 84, 0xcfe8e6, 0.35).setStrokeStyle(2, 0x9fe8e1);
    this.stage.add(cup);
    this.text(142, -52, 'SAMPLE CUP', 9, '#9fb3c8', '"Kenney Pixel"', 'center');

    this.text(0, 48, 'Hold to fill, release at target.', 11, '#9fb3c8', '"Kenney Mini Square"', 'center');

    // controls
    const aspirate = this.button(0, 110, 320, 72, 'Aspirate (hold)', () => undefined, 'primary');
    aspirate.on('pointerdown', () => this.startHold());
    aspirate.on('pointerup', () => this.stopHold());
    aspirate.on('pointerout', () => this.stopHold());
    const dispense = this.button(-82, 196, 160, 52, 'Dispense', () => this.dispense(), 'amber');
    if (this.volume <= 0) dispense.setAlpha(0.5);
    if (this.busy) {
      aspirate.disableInteractive();
      dispense.disableInteractive();
    }
    this.button(82, 196, 160, 52, 'Reset', () => {
      if (this.busy) return;
      this.volume = 0;
      this.updateLiquid();
      this.render();
    }, 'ghost');

    this.text(0, 254, `Attempts: ${this.attempts} · retry as needed; the first overflow is free`, 10, '#9fb3c8', '"Kenney Mini Square"', 'center');
    this.updateLiquid();
  }

  private startHold(): void {
    if (this.busy) return;
    this.holding = true;
  }

  private stopHold = (): void => {
    this.holding = false;
  };

  private updateLiquid(): void {
    if (this.liquid) {
      const h = (this.volume / MAX_VOLUME) * 118;
      this.liquid.height = Math.max(1, h);
      this.liquid.y = 74 - h / 2;
    }
    if (this.gaugeFill) {
      this.gaugeFill.height = (this.volume / MAX_VOLUME) * GAUGE.h;
      this.gaugeFill.setOrigin(0.5, 1);
    }
    if (this.volumeText) {
      this.volumeText.setText(`${Math.round(this.volume)} µL`);
      this.volumeText.setColor(Math.abs(this.volume - TARGET) <= PERFECT ? '#06d6a0' : '#e6f1ff');
    }
  }

  private overflow(): void {
    this.overflowCount += 1;
    this.sfx('error');
    haptic(24);
    if (this.overflowCount > 1) {
      this.engine()?.applyPenalty('pipette_miss_small', 'Overfilled the pipette past 1,000 µL.');
      this.banner('Overflow again — accuracy penalty.', 'oops');
    } else {
      this.banner('Overflow. Reset and try again.', 'oops');
    }
    this.volume = 0;
    this.updateLiquid();
    this.render();
  }

  private dispense(): void {
    if (this.busy) return;
    if (this.volume <= 0) {
      this.banner('Aspirate first.', 'oops');
      return;
    }
    this.attempts += 1;
    const diff = Math.abs(this.volume - TARGET);
    if (diff > ACCEPT) {
      this.sfx('error');
      haptic(24);
      if (this.test) {
        this.engine()?.aliquot(this.test, { volumeUl: this.volume, attempts: this.attempts, success: false });
      }
      this.banner(`OOPS · ${Math.round(this.volume)} µL. The cup is rejected — try again.`, 'oops');
      this.volume = 0;
      this.updateLiquid();
      this.render();
      return;
    }
    this.busy = true;
    haptic(12);
    const volume = this.volume;
    this.sfx('glass2');
    if (diff <= PERFECT) this.banner('PERFECT · 500 µL in the green band.', 'perfect');
    else this.banner('GOOD · within 50 µL, small accuracy hit.', 'good');
    this.time.delayedCall(900, () => {
      this.finish({ volumeUl: volume, attempts: this.attempts, success: true });
    });
  }
}
