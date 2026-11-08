import Phaser from 'phaser';
import { tubeColor } from '../rules';
import type { TestCode, TubeType } from '../types';
import { haptic } from '../audio/AudioManager';
import { MinigameScene } from './base';

interface Payload {
  test?: TestCode;
  tube?: TubeType | null;
  minutes?: number;
}

type TubeId = 'sample' | 'balance';

const SLOT_COUNT = 12;
const ROTOR = { x: 0, y: -120, radius: 78 };

export class CentrifugeScene extends MinigameScene {
  private test: TestCode | null = null;
  private tube: TubeType = 'GOLD_SST';
  private requiredMinutes = 10;
  private placement = new Map<number, TubeId>();
  private selected: TubeId | null = null;
  private rpm = 3000;
  private minutes = 10;
  private spinning = false;

  constructor() {
    super('CentrifugeScene');
  }

  create(data: Payload): void {
    this.setupStage();
    this.test = data.test ?? null;
    this.tube = data.tube ?? 'GOLD_SST';
    this.requiredMinutes = data.minutes ?? 10;
    this.placement.clear();
    this.selected = null;
    this.rpm = 3000;
    this.minutes = this.requiredMinutes === 15 ? 10 : 15;
    this.spinning = false;
    this.render();
  }

  private render(): void {
    this.stage.removeAll(true);
    this.panel(-180, -320, 360, 640, 0x0b1220, 1);
    this.text(-164, -306, 'CENTRIFUGE', 18, '#5eead4', '"Kenney Pixel"');
    this.text(-164, -282, `Sample: ${this.tube.replaceAll('_', ' ')} · required 3,000 rpm × ${this.requiredMinutes} min`, 10, '#9fb3c8').setWordWrapWidth(328);
    if (!this.test) {
      this.text(-164, -240, 'Nothing to spin.', 15, '#ffd9e1');
      return;
    }

    const rotor = this.add.container(ROTOR.x, ROTOR.y);
    this.stage.add(rotor);
    const ring = this.add.circle(0, 0, ROTOR.radius + 24, 0x0e1a2b, 1).setStrokeStyle(3, 0x2b4a6f);
    rotor.add(ring);
    const inner = this.add.circle(0, 0, 24, 0x132238, 1).setStrokeStyle(2, 0x2b4a6f);
    rotor.add(inner);
    for (let i = 0; i < SLOT_COUNT; i++) {
      const angle = (i / SLOT_COUNT) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * ROTOR.radius;
      const y = Math.sin(angle) * ROTOR.radius;
      const slot = this.add.circle(x, y, 17, 0x132238, 1).setStrokeStyle(2, 0x2b4a6f);
      slot.setInteractive(new Phaser.Geom.Circle(0, 0, 26), Phaser.Geom.Circle.Contains);
      slot.on('pointerdown', () => this.tapSlot(i));
      rotor.add(slot);
      const occupant = this.placement.get(i);
      if (occupant) {
        const tubeObj = this.tubeGraphic(x, y, occupant);
        rotor.add(tubeObj);
      }
      this.text(
        ROTOR.x + Math.cos(angle) * (ROTOR.radius + 30),
        ROTOR.y + Math.sin(angle) * (ROTOR.radius + 30) - 5,
        String(i + 1),
        8,
        '#9fb3c8',
        '"Kenney Pixel"',
        'center',
      );
    }

    if (this.spinning) {
      this.text(0, ROTOR.y - 8, 'SPINNING', 14, '#ffb703', '"Kenney Pixel"', 'center');
    } else if (this.selected) {
      this.text(0, 2, `Selected: ${this.selected.toUpperCase()} — tap a slot`, 11, '#ffb703', '"Kenney Mini Square"', 'center').setWordWrapWidth(328);
    } else {
      this.text(0, 2, 'Tap a tube, then a slot.', 11, '#9fb3c8', '"Kenney Mini Square"', 'center');
    }

    const sampleInSlot = [...this.placement.entries()].some(([, id]) => id === 'sample');
    const balanceInSlot = [...this.placement.entries()].some(([, id]) => id === 'balance');
    this.text(-164, 26, 'TRAY', 11, '#9fb3c8', '"Kenney Pixel"');
    if (!sampleInSlot) {
      this.trayTube(-120, 72, 'sample');
      this.text(-120, 106, 'SAMPLE', 9, '#5eead4', '"Kenney Pixel"', 'center');
    }
    if (!balanceInSlot) {
      this.trayTube(-30, 72, 'balance');
      this.text(-30, 106, 'BALANCE', 9, '#5eead4', '"Kenney Pixel"', 'center');
    }
    if (sampleInSlot && balanceInSlot) {
      this.text(-164, 66, 'Both tubes loaded.\nTap a loaded slot to pull it back.', 10, '#9fb3c8').setWordWrapWidth(328);
    }

    this.text(0, 132, 'Opposite slots keep the rotor balanced.', 10, '#9fb3c8', '"Kenney Pixel"', 'center');

    this.text(-164, 152, 'PRESET', 11, '#9fb3c8', '"Kenney Pixel"');
    const presets: { rpm: number; minutes: number; label: string }[] = [
      { rpm: 3000, minutes: 10, label: '3,000 × 10' },
      { rpm: 3000, minutes: 15, label: '3,000 × 15' },
      { rpm: 1000, minutes: 5, label: '1,000 × 5' },
      { rpm: 5000, minutes: 5, label: '5,000 × 5' },
    ];
    presets.forEach((preset, i) => {
      const active = preset.rpm === this.rpm && preset.minutes === this.minutes;
      const x = i % 2 === 0 ? -84 : 84;
      const y = i < 2 ? 186 : 240;
      this.button(x, y, 160, 44, preset.label, () => {
        if (this.spinning) return;
        this.rpm = preset.rpm;
        this.minutes = preset.minutes;
        this.render();
      }, active ? 'primary' : 'ghost');
    });

    const start = this.button(0, 292, 320, 52, this.spinning ? 'Spinning…' : 'Start spin', () => this.startSpin(), this.spinning ? 'ghost' : 'primary');
    if (this.spinning) start.disableInteractive();

    if (this.spinning) {
      this.tweens.add({
        targets: rotor,
        angle: rotor.angle + 720,
        duration: 2500,
        ease: 'Cubic.InOut',
        onComplete: () => this.finishSpin(),
      });
    }
  }

  private trayTube(x: number, y: number, id: TubeId): void {
    const g = this.tubeGraphic(x, y, id);
    g.setSize(64, 80);
    g.setInteractive({ useHandCursor: true });
    g.on('pointerdown', () => {
      this.selected = id;
      this.sfx('click');
      this.render();
    });
    this.stage.add(g);
    if (this.selected === id) {
      const halo = this.add.circle(x, y, 30, 0x2ec4b6, 0.22).setStrokeStyle(2, 0x2ec4b6);
      this.stage.add(halo);
    }
  }

  private tubeGraphic(x: number, y: number, id: TubeId): Phaser.GameObjects.Container {
    const body = this.add.rectangle(0, 0, 18, 44, 0xcfe8e6, 0.95).setStrokeStyle(2, 0xffffff);
    const liquid = this.add.rectangle(0, 6, 14, 26, tubeColor(this.tube), 1);
    const cap = this.add.rectangle(0, -22, 20, 7, 0xe6f1ff, 1);
    const container = this.add.container(x, y, [body, liquid, cap]);
    container.setSize(26, 54);
    if (id === 'balance') container.setAlpha(0.75);
    return container;
  }

  private tapSlot(index: number): void {
    if (this.spinning) return;
    const occupant = this.placement.get(index);
    if (occupant) {
      this.placement.delete(index);
      this.selected = occupant;
      this.render();
      return;
    }
    if (!this.selected) {
      this.banner('Tap a tube first.', 'oops');
      return;
    }
    this.placement.set(index, this.selected);
    this.selected = null;
    this.sfx('glass');
    this.render();
  }

  private startSpin(): void {
    if (this.spinning) return;
    if (this.placement.size < 2) {
      this.banner('Place the sample and the balance tube.', 'oops');
      return;
    }
    const sample = [...this.placement.entries()].find(([, id]) => id === 'sample');
    const balance = [...this.placement.entries()].find(([, id]) => id === 'balance');
    if (!sample || !balance) {
      this.banner('Place the sample and the balance tube.', 'oops');
      return;
    }
    const balanced = (sample[0] + 6) % SLOT_COUNT === balance[0];
    if (!balanced) {
      this.engine()?.centrifuge(this.test as TestCode, {
        balanced: false,
        rpm: this.rpm,
        minutes: this.minutes,
        success: false,
      });
      this.sfx('error');
      haptic(24);
      this.banner('Rotor unbalanced. Place the tubes opposite each other.', 'oops');
      this.cameras.main.shake(220, 0.008);
      this.placement.clear();
      this.selected = null;
      this.render();
      return;
    }
    if (this.rpm !== 3000 || this.minutes !== this.requiredMinutes) {
      this.engine()?.centrifuge(this.test as TestCode, {
        balanced: true,
        rpm: this.rpm,
        minutes: this.minutes,
        success: false,
      });
      this.sfx('error');
      haptic(24);
      this.banner(`Wrong preset. Use 3,000 rpm × ${this.requiredMinutes} min.`, 'oops');
      this.render();
      return;
    }
    this.spinning = true;
    this.sfx('run');
    this.render();
  }

  private finishSpin(): void {
    if (!this.spinning || !this.test) return;
    this.spinning = false;
    haptic(12);
    this.banner('Spin complete. Balanced and on preset.', 'perfect');
    this.time.delayedCall(700, () => {
      this.finish({ balanced: true, rpm: this.rpm, minutes: this.minutes, success: true });
    });
  }
}
