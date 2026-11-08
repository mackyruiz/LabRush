import Phaser from 'phaser';
import { bus } from '../bus';
import type { ShiftEngine } from '../state/ShiftEngine';

export const STAGE_W = 360;
export const STAGE_H = 640;

export type BannerTone = 'perfect' | 'good' | 'oops';

/** Shared 360x640 portrait logical stage for every minigame. */
export class MinigameScene extends Phaser.Scene {
  protected stage!: Phaser.GameObjects.Container;
  protected stageScale = 1;
  private bannerText?: Phaser.GameObjects.Text;

  protected setupStage(): void {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x04080f, 0.78).setOrigin(0).setDepth(0);
    this.stage = this.add.container(width / 2, height / 2).setDepth(1);
    this.layoutStage();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutStage, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutStage, this);
      bus.emit('minigame:closed', { key: this.scene.key });
    });
  }

  private layoutStage = (): void => {
    if (!this.stage) return;
    const { width, height } = this.scale;
    this.stageScale = Math.min(width / STAGE_W, height / STAGE_H);
    this.stage.setPosition(width / 2, height / 2).setScale(this.stageScale);
  };

  protected sfx(key: string, volume = 0.45): void {
    try {
      if (this.sound.get(key)) this.sound.play(key, { volume });
    } catch {
      /* audio is optional */
    }
  }

  protected engine(): ShiftEngine | undefined {
    return this.registry.get('engine') as ShiftEngine | undefined;
  }

  protected panel(x: number, y: number, w: number, h: number, fill = 0x132238, alpha = 0.98): Phaser.GameObjects.Rectangle {
    const rect = this.add.rectangle(x, y, w, h, fill, alpha).setOrigin(0, 0);
    rect.setStrokeStyle(2, 0x2b4a6f);
    this.stage.add(rect);
    return rect;
  }

  protected text(
    x: number,
    y: number,
    value: string,
    size = 15,
    color = '#e6f1ff',
    family = '"Kenney Mini Square"',
    align: 'left' | 'center' | 'right' = 'left',
  ): Phaser.GameObjects.Text {
    const t = this.add
      .text(x, y, value, { fontFamily: family, fontSize: `${size}px`, color, align })
      .setResolution(2);
    if (align === 'center') t.setOrigin(0.5, 0);
    else if (align === 'right') t.setOrigin(1, 0);
    this.stage.add(t);
    return t;
  }

  protected button(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    onClick: () => void,
    variant: 'primary' | 'ghost' | 'danger' | 'amber' = 'primary',
  ): Phaser.GameObjects.Container {
    const colors: Record<string, { fill: number; stroke: number; text: string }> = {
      primary: { fill: 0x2ec4b6, stroke: 0x9bfff6, text: '#04222b' },
      ghost: { fill: 0x132238, stroke: 0x2b4a6f, text: '#e6f1ff' },
      danger: { fill: 0x4a1524, stroke: 0xef476f, text: '#ffd9e2' },
      amber: { fill: 0x4a3405, stroke: 0xffb703, text: '#fff3d1' },
    };
    const c = colors[variant];
    const rect = this.add.rectangle(0, 0, w, h, c.fill, 1).setOrigin(0.5);
    rect.setStrokeStyle(2, c.stroke);
    const t = this.add
      .text(0, 0, label, { fontFamily: '"Kenney Mini Square"', fontSize: '15px', color: c.text })
      .setOrigin(0.5)
      .setResolution(2);
    const container = this.add.container(x, y, [rect, t]);
    // Keep a >=56 logical hit target even when the visual button is shorter.
    container.setSize(Math.max(w, 56), Math.max(h, 56));
    container.setInteractive({ useHandCursor: true });
    const baseFill = c.fill;
    container.on('pointerdown', () => {
      this.sfx('click');
      rect.setFillStyle(0x0e1a2b, 1);
      this.time.delayedCall(70, () => rect.setFillStyle(baseFill, 1));
      onClick();
    });
    container.on('pointerover', () => rect.setStrokeStyle(2, 0x9bfff6));
    container.on('pointerout', () => rect.setStrokeStyle(2, c.stroke));
    this.stage.add(container);
    return container;
  }

  protected banner(message: string, tone: BannerTone = 'good'): void {
    this.bannerText?.destroy();
    const color = tone === 'oops' ? '#ef476f' : tone === 'perfect' ? '#5eead4' : '#06d6a0';
    const t = this.add
      .text(0, -30, message, {
        fontFamily: '"Kenney Pixel"',
        fontSize: '18px',
        color,
        backgroundColor: '#0b1220',
        padding: { x: 12, y: 8 },
        align: 'center',
        wordWrap: { width: 300 },
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(10);
    this.stage.add(t);
    this.bannerText = t;
    t.setScale(0.92);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.Out' });
    this.time.delayedCall(2600, () => {
      if (this.bannerText === t) {
        this.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => t.destroy() });
        this.bannerText = undefined;
      }
    });
  }

  protected finish(result: unknown): void {
    bus.emit('minigame:complete', { key: this.scene.key, result });
  }

  protected exit(): void {
    bus.emit('minigame:exit', { key: this.scene.key });
  }
}
