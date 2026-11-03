import Phaser from 'phaser';

/** Static, dimmed lab backdrop behind the DOM title panel. */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0b1220');
    if (!this.textures.exists('tiles-image')) return;

    const cols = 26;
    const rows = 18;
    const data: number[][] = [];
    for (let y = 0; y < rows; y++) {
      const row: number[] = [];
      for (let x = 0; x < cols; x++) {
        const border = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
        row.push(border ? 123 : 117);
      }
      data.push(row);
    }
    const map = this.make.tilemap({ data, tileWidth: 16, tileHeight: 16 });
    const tileset = map.addTilesetImage('tiles', 'tiles-image', 16, 16, 0, 0);
    if (tileset) map.createLayer(0, tileset, 0, 0);

    const cam = this.cameras.main;
    const zoom = Math.max(width / (cols * 16), height / (rows * 16));
    cam.setZoom(zoom);
    cam.centerOn((cols * 16) / 2, (rows * 16) / 2);
    cam.setBackgroundColor('#0b1220');

    this.add
      .rectangle(0, 0, cols * 16, rows * 16, 0x0b1220, 0.55)
      .setOrigin(0)
      .setDepth(1);
  }
}
