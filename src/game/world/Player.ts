import Phaser from 'phaser';
import { TILE } from './map';

export type Facing = 'down' | 'up' | 'left' | 'right';

export class Player {
  readonly container: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly walkTimer: Phaser.Time.TimerEvent;
  private bob = false;

  tileX: number;
  tileY: number;
  facing: Facing = 'down';
  isMoving = false;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
  ) {
    this.tileX = x;
    this.tileY = y;
    const px = x * TILE + TILE / 2;
    const py = y * TILE + TILE;
    this.shadow = scene.add.ellipse(0, -1, 12, 4, 0x000000, 0.38);
    this.sprite = scene.add.sprite(0, 0, 'player-down').setOrigin(0.5, 1);
    this.sprite.setDisplaySize(TILE, TILE);
    this.container = scene.add.container(px, py, [this.shadow, this.sprite]);
    this.container.setDepth(py);
    this.walkTimer = scene.time.addEvent({
      delay: 120,
      loop: true,
      paused: true,
      callback: () => {
        if (!this.isMoving) return;
        this.bob = !this.bob;
        this.sprite.y = this.bob ? -1 : 0;
        if (this.facing === 'left' || this.facing === 'right') this.sprite.setFlipX(this.bob);
      },
    });
  }

  setFacing(facing: Facing): void {
    this.facing = facing;
    this.sprite.setTexture(`player-${facing}`);
  }

  tryStep(dx: number, dy: number, blocked: (x: number, y: number) => boolean): boolean {
    if (this.isMoving) return false;
    const nx = this.tileX + dx;
    const ny = this.tileY + dy;
    if (dx === 0 && dy === 0) return false;
    if (blocked(nx, ny)) return false;
    const facing: Facing = dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right';
    this.setFacing(facing);
    this.isMoving = true;
    this.walkTimer.paused = false;
    const px = nx * TILE + TILE / 2;
    const py = ny * TILE + TILE;
    this.scene.tweens.add({
      targets: this.container,
      x: px,
      y: py,
      duration: 110,
      ease: 'Linear',
      onComplete: () => {
        this.tileX = nx;
        this.tileY = ny;
        this.isMoving = false;
        this.walkTimer.paused = true;
        this.bob = false;
        this.sprite.y = 0;
        this.sprite.setFlipX(false);
        this.container.setDepth(py);
        this.scene.events.emit('player:step-complete');
      },
    });
    return true;
  }

  position(): { x: number; y: number } {
    return { x: this.tileX, y: this.tileY };
  }

  setPosition(x: number, y: number): void {
    this.tileX = x;
    this.tileY = y;
    const px = x * TILE + TILE / 2;
    const py = y * TILE + TILE;
    this.container.setPosition(px, py);
    this.container.setDepth(py);
  }
}
