import type Phaser from 'phaser';
import { bus } from '../bus';
import type { SaveStore } from '../state/SaveStore';

/** Master mute/volume, first-gesture unlock, and a silent fallback if OGG decode fails. */
export class AudioManager {
  private unlocked = false;

  constructor(
    private readonly game: Phaser.Game,
    private readonly save: SaveStore,
  ) {
    const settings = save.settings;
    this.apply(settings.muted, settings.volume);
    bus.on('audio:settings', (s: { muted: boolean; volume: number }) => {
      this.save.setSettings({ muted: s.muted, volume: s.volume });
      this.apply(s.muted, s.volume);
    });
    window.addEventListener('pointerdown', this.unlock, { once: true });
    window.addEventListener('keydown', this.unlock, { once: true });
  }

  private unlock = (): void => {
    if (this.unlocked) return;
    this.unlocked = true;
    const manager = this.game.sound as Phaser.Sound.WebAudioSoundManager;
    if (!manager) return;
    try {
      const ctx = manager.context;
      if (ctx && ctx.state === 'suspended') void ctx.resume();
    } catch {
      /* audio is non-essential */
    }
  };

  private apply(muted: boolean, volume: number): void {
    try {
      this.game.sound.mute = muted;
      this.game.sound.volume = Math.max(0, Math.min(1, volume));
    } catch {
      /* audio is non-essential */
    }
  }
}

export function haptic(ms = 12): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* vibration is optional */
  }
}
