import Phaser from 'phaser';
import { bus } from './game/bus';
import { SHIFT_01 } from './game/content/shift01';
import { TESTS } from './game/content/tests';
import { BootScene } from './game/scenes/BootScene';
import { TitleScene } from './game/scenes/TitleScene';
import { AssetTestScene } from './game/scenes/AssetTestScene';
import { QcScene } from './game/minigames/QcScene';
import { AccessionScene } from './game/minigames/AccessionScene';
import { CentrifugeScene } from './game/minigames/CentrifugeScene';
import { PipetteScene } from './game/minigames/PipetteScene';
import { SaveStore } from './game/state/SaveStore';
import { AudioManager } from './game/audio/AudioManager';
import { ShiftEngine } from './game/state/ShiftEngine';
import { UIRoot } from './game/ui/UIRoot';
import { LabScene } from './game/world/LabScene';
import type { StationId } from './game/types';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b1220',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 2 },
  scene: [BootScene, TitleScene, LabScene, AssetTestScene, QcScene, AccessionScene, CentrifugeScene, PipetteScene],
};

const save = new SaveStore();
let engine = new ShiftEngine(SHIFT_01, TESTS, { save });
const game = new Phaser.Game(config);
const ui = new UIRoot(game, engine, save);
const audio = new AudioManager(game, save);
void audio;

window.setTimeout(() => {
  if (game.registry.get('audio-disabled')) {
    ui.toast('Audio could not be decoded — running silent.', 'warn', 5000);
  }
}, 1600);

game.registry.set('engine', engine);
game.registry.set('ui', ui);
game.registry.set('save', save);

function enterLab(): void {
  if (engine.getSnapshot().status === 'idle') engine.startShift();
  ui.showLab();
  game.scene.stop('TitleScene');
  game.scene.start('LabScene');
}

ui.onClockIn = enterLab;

function restartShift(): void {
  ui.closeAllModals();
  for (const key of ['QcScene', 'AccessionScene', 'CentrifugeScene', 'PipetteScene']) {
    if (game.scene.isActive(key)) game.scene.stop(key);
  }
  engine = new ShiftEngine(SHIFT_01, TESTS, { save });
  game.registry.set('engine', engine);
  ui.bindEngine(engine);
  if (window.__labrush) window.__labrush.engine = engine;
  enterLab();
}

ui.onRestartShift = restartShift;
ui.onQuitToTitle = () => ui.showTitle();

bus.on('station:open', (id: StationId) => {
  ui.openStation(id);
});

bus.on('minigame:result', (payload: unknown) => {
  if (window.__labrush) window.__labrush.lastMinigameResult = payload;
});

const assetTest = new URLSearchParams(window.location.search).get('asset-test') === '1';
if (!assetTest) ui.showTitle();

function startShift(): void {
  enterLab();
}

function openStation(id: string): void {
  const lab = game.scene.getScene('LabScene') as LabScene | null;
  if (lab && game.scene.isActive('LabScene')) {
    lab.openStation(id as StationId);
  } else {
    ui.openStation(id as StationId);
  }
}

if (import.meta.env.DEV || import.meta.env.VITE_E2E === '1') {
  window.__labrush = {
    game,
    ui,
    save,
    engine,
    lab: () => game.scene.getScene('LabScene') as LabScene,
    startShift,
    openStation,
    forceMinigame: (key: string) => ui.forceMinigame(key),
    lastMinigameResult: null,
  };
}

// Rotate prompt + tab visibility: both pause the scene and the shift timer.
const rotate = document.getElementById('rotate') as HTMLElement;
let envPaused = false;

function setEnvPaused(paused: boolean): void {
  if (paused === envPaused) return;
  envPaused = paused;
  if (paused) {
    engine.pauseTimer();
    if (game.scene.isActive('LabScene')) game.scene.pause('LabScene');
  } else {
    engine.resumeTimer();
    if (game.scene.isPaused('LabScene')) game.scene.resume('LabScene');
    ui.toast('Shift timer resumed.', 'info');
  }
}

function updateRotate(): void {
  const portrait = window.matchMedia('(orientation: portrait)').matches && window.innerWidth < 900;
  rotate.hidden = !portrait;
  setEnvPaused(portrait || document.visibilityState === 'hidden');
}
window.addEventListener('resize', updateRotate);
window.matchMedia('(orientation: portrait)').addEventListener('change', updateRotate);
document.addEventListener('visibilitychange', updateRotate);
updateRotate();

document.getElementById('boot-error-reload')?.addEventListener('click', () => window.location.reload());
