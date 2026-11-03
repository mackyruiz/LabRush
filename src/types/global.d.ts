import type Phaser from 'phaser';
import type { SaveStore } from '../game/state/SaveStore';
import type { ShiftEngine } from '../game/state/ShiftEngine';
import type { UIRoot } from '../game/ui/UIRoot';
import type { LabScene } from '../game/world/LabScene';

export interface LabRushDebug {
  game: Phaser.Game;
  ui: UIRoot;
  save: SaveStore;
  engine: ShiftEngine;
  lab: () => LabScene;
  startShift: () => void;
  openStation: (id: string) => void;
  forceMinigame: (key: string) => void;
  lastMinigameResult: unknown;
}

declare global {
  interface Window {
    __labrush?: LabRushDebug;
  }
}

export {};
