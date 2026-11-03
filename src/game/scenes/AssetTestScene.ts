import Phaser from 'phaser';
import { CHARACTER_TEXTURES } from './BootScene';

/** Debug scene: ?asset-test=1 shows the tile grid and every character texture. */
export class AssetTestScene extends Phaser.Scene {
  constructor() {
    super('AssetTestScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0b1220');
    this.add
      .text(4, 2, 'TILES 432x288 · 27x18 · frames 8/10/123', {
        fontFamily: '"Kenney Pixel"',
        fontSize: '8px',
        color: '#5eead4',
      })
      .setResolution(3);
    this.add.image(0, 16, 'tiles-image').setOrigin(0);

    this.add
      .text(444, 2, 'CHARACTERS', { fontFamily: '"Kenney Pixel"', fontSize: '8px', color: '#5eead4' })
      .setResolution(3);

    Object.entries(CHARACTER_TEXTURES).forEach(([key, idx], i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = 456 + col * 96;
      const y = 24 + row * 168;
      this.add.image(x, y, key).setOrigin(0, 0).setScale(4);
      this.add
        .text(x, y + 70, `${key} #${idx}`, {
          fontFamily: '"Kenney Pixel"',
          fontSize: '7px',
          color: '#e6f1ff',
        })
        .setResolution(3);
    });

    const keys = ['8', '10', '123', '292', '281', '253', '255', '264'];
    keys.forEach((frame, i) => {
      this.add.image(444 + i * 34, 372, 'tiles', frame).setOrigin(0).setScale(2);
    });
  }
}
