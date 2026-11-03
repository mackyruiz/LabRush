import Phaser from 'phaser';

export const AUDIO_KEYS = [
  'click',
  'confirm',
  'error',
  'scan',
  'glass',
  'glass2',
  'open',
  'close',
  'switch',
  'run',
  'footstep00',
  'footstep01',
  'footstep02',
  'footstep03',
  'door',
] as const;

// The RPG Urban characters are one 16x16 tile each, four directions per row:
// [left, down, up, right]. These frames are verified against the packed sheet.
export const CHARACTER_TEXTURES: Record<string, number> = {
  'player-left': 185,
  'player-down': 186,
  'player-up': 187,
  'player-right': 188,
  'cls-left': 239,
  'cls-down': 240,
  'cls-up': 241,
  'cls-right': 242,
};

export class BootScene extends Phaser.Scene {
  private missing: string[] = [];
  private audioFailed = false;

  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.missing.push(file.key);
      if (file.type === 'audio') this.audioFailed = true;
    });

    this.load.image('tiles-image', 'assets/kenney/tiles.png');
    this.load.spritesheet('tiles', 'assets/kenney/tiles.png', { frameWidth: 16, frameHeight: 16 });
    for (const key of AUDIO_KEYS) {
      this.load.audio(key, `assets/audio/${key}.ogg`);
    }
  }

  create(): void {
    const critical = this.missing.filter((key) => !AUDIO_KEYS.includes(key as (typeof AUDIO_KEYS)[number]));
    if (critical.length) {
      showBootError(`Missing asset: ${critical.join(', ')}`);
      return;
    }
    if (this.audioFailed) {
      this.registry.set('audio-disabled', true);
    }

    void this.finishBoot();
  }

  private async finishBoot(): Promise<void> {
    try {
      await Promise.all([
        document.fonts.load('16px "Kenney Pixel"'),
        document.fonts.load('16px "Kenney Mini Square"'),
      ]);
      await document.fonts.ready;
    } catch {
      showBootError('Fonts failed to load (Kenney Pixel / Kenney Mini Square).');
      return;
    }
    this.createCharacterTextures();
    if (new URLSearchParams(window.location.search).get('asset-test') === '1') {
      this.scene.start('AssetTestScene');
    } else {
      this.scene.start('TitleScene');
    }
  }

  private createCharacterTextures(): void {
    const source = this.textures.get('tiles-image').getSourceImage() as CanvasImageSource;
    for (const [key, idx] of Object.entries(CHARACTER_TEXTURES)) {
      if (this.textures.exists(key)) continue;
      const tex = this.textures.createCanvas(key, 16, 16);
      if (!tex) continue;
      const ctx = tex.getContext();
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 16, 16);
      ctx.drawImage(source, (idx % 27) * 16, Math.floor(idx / 27) * 16, 16, 16, 0, 0, 16, 16);
      tex.refresh();
    }
  }
}

export function showBootError(message: string): void {
  const box = document.getElementById('boot-error');
  const msg = document.getElementById('boot-error-msg');
  if (box && msg) {
    msg.textContent = message;
    box.hidden = false;
  }
}
