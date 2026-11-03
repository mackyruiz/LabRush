import Phaser from 'phaser';
import { TILE, type StationDef } from './map';
import type { StationId } from '../types';

// Frames are read from the packed Kenney RPG Urban sheet (27 columns).
const PRIMARY: Record<StationId, number> = {
  receiving: 297,
  accession: 297,
  centrifuge: 297,
  aliquot: 297,
  cls: 297,
  report: 297,
  microscope: 297,
  qc: 298,
  chem: 298,
  hema: 298,
  coag: 298,
  printer: 271,
  fridge: 272,
  biohazard: 251,
  eyewash: 297,
};

const OVERLAY: Partial<Record<StationId, number>> = {
  receiving: 273,
  accession: 281,
  centrifuge: 302,
  aliquot: 303,
  cls: 271,
  report: 281,
  microscope: 308,
  qc: 281,
  chem: 281,
  hema: 281,
  coag: 300,
  printer: 281,
  eyewash: 307,
};

export class Station {
  private glow?: Phaser.GameObjects.Ellipse;
  private glowing = false;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly def: StationDef,
  ) {
    const primary = PRIMARY[def.id];
    const xs = def.tiles.map((t) => t.x);
    const ys = def.tiles.map((t) => t.y);
    const minX = Math.min(...xs) * TILE;
    const maxX = (Math.max(...xs) + 1) * TILE;
    const minY = Math.min(...ys) * TILE;
    const maxY = (Math.max(...ys) + 1) * TILE;
    scene.add
      .rectangle(minX - 1, minY - 1, maxX - minX + 2, maxY - minY + 2, 0x132238, 0.22)
      .setOrigin(0)
      .setStrokeStyle(1, 0x2b4a6f, 0.55)
      .setDepth(0.45);
    for (const tile of def.tiles) {
      scene.add
        .image(tile.x * TILE + TILE / 2, tile.y * TILE + TILE / 2, 'tiles', primary)
        .setDepth(tile.y * TILE + TILE);
    }
    const overlayFrame = OVERLAY[def.id];
    if (overlayFrame !== undefined) {
      const center = this.centerTile();
      scene.add
        .image(center.x * TILE + TILE / 2, center.y * TILE + TILE / 2, 'tiles', overlayFrame)
        .setDepth(center.y * TILE + TILE + 1);
    }
    if (def.id === 'biohazard') {
      const center = this.center();
      scene.add
        .text(center.x, center.y - 2, 'BIOHAZARD', {
          fontFamily: '"Kenney Pixel"',
          fontSize: '7px',
          color: '#ffffff',
          backgroundColor: '#b01b32',
          padding: { x: 2, y: 1 },
        })
        .setOrigin(0.5, 1)
        .setResolution(4)
        .setDepth(10000);
    }
  }

  centerTile(): { x: number; y: number } {
    const sum = this.def.tiles.reduce((acc, t) => ({ x: acc.x + t.x, y: acc.y + t.y }), { x: 0, y: 0 });
    return { x: Math.round(sum.x / this.def.tiles.length), y: Math.round(sum.y / this.def.tiles.length) };
  }

  center(): { x: number; y: number } {
    const tiles = this.def.tiles;
    const minX = Math.min(...tiles.map((t) => t.x));
    const maxX = Math.max(...tiles.map((t) => t.x));
    const minY = Math.min(...tiles.map((t) => t.y));
    const maxY = Math.max(...tiles.map((t) => t.y));
    return {
      x: ((minX + maxX + 1) * TILE) / 2,
      y: ((minY + maxY + 1) * TILE) / 2,
    };
  }

  setGlow(on: boolean): void {
    if (on === this.glowing) return;
    this.glowing = on;
    if (!this.glow) {
      const xs = this.def.tiles.map((t) => t.x);
      const ys = this.def.tiles.map((t) => t.y);
      const minX = Math.min(...xs) * TILE;
      const maxX = (Math.max(...xs) + 1) * TILE;
      const minY = Math.min(...ys) * TILE;
      const maxY = (Math.max(...ys) + 1) * TILE;
      this.glow = this.scene.add
        .ellipse((minX + maxX) / 2, (minY + maxY) / 2, maxX - minX + 10, maxY - minY + 10, 0x2ec4b6, 0.28)
        .setDepth(0.6);
    }
    this.glow.setVisible(on);
    if (on) {
      this.scene.tweens.add({
        targets: this.glow,
        alpha: { from: 0.12, to: 0.4 },
        duration: 900,
        yoyo: true,
        repeat: -1,
      });
    } else {
      this.scene.tweens.killTweensOf(this.glow);
    }
  }
}
