import Phaser from 'phaser';
import { bus } from '../bus';
import type { ShiftEngine } from '../state/ShiftEngine';
import type { Objective, StationId } from '../types';
import { MAP_COLS, MAP_ROWS_COUNT, SPAWN, TILE, parseMap, stationAt, tileKey, type ParsedMap } from './map';
import { findPath } from './pathing';
import { Player } from './Player';
import { Station } from './Station';

const ZOOM_SMALL = 2;
const ZOOM_MEDIUM = 3;
const ZOOM_LARGE = 4;

export class LabScene extends Phaser.Scene {
  private parsed!: ParsedMap;
  private stations: Station[] = [];
  private player!: Player;
  private engine?: ShiftEngine;

  private path: { x: number; y: number }[] = [];
  private pendingStation: StationId | null = null;
  private joy = { x: 0, y: 0 };
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private interactKey?: Phaser.Input.Keyboard.Key;
  private lastPrompt: StationId | null = null;
  private objectiveStation: StationId | null = null;
  private unsubscribeEngine?: () => void;
  private unsubs: (() => void)[] = [];
  private keyHandler?: (ev: KeyboardEvent) => void;

  constructor() {
    super('LabScene');
  }

  create(): void {
    this.path = [];
    this.pendingStation = null;
    this.joy = { x: 0, y: 0 };
    this.lastPrompt = null;
    this.objectiveStation = null;
    this.parsed = parseMap();
    this.engine = this.registry.get('engine') as ShiftEngine | undefined;

    this.cameras.main.setBackgroundColor('#0b1220');
    this.buildFloor();
    this.buildMats();
    this.buildDoor();
    this.stations = this.parsed.stations.map((def) => new Station(this, def));
    this.buildLabels();
    this.buildNpc();

    this.player = new Player(this, SPAWN.x, SPAWN.y);
    this.setupCamera();

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
    this.interactKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.setupKeyboardShortcuts();
    this.setupPointer();

    this.unsubs.push(
      bus.on('input:joystick', (v: { x: number; y: number }) => {
        this.joy = v;
      }),
      bus.on('input:interact', () => this.interactNearest()),
      bus.on('lab:walk-to', (id: StationId) => this.walkToStation(id)),
    );

    if (this.engine) {
      this.unsubscribeEngine = this.engine.subscribe((snapshot) => {
        this.setObjectiveStation(snapshot.status === 'complete' ? null : snapshot.objective.station);
        bus.emit('lab:objective', snapshot.objective as Objective);
      });
      const snapshot = this.engine.getSnapshot();
      this.setObjectiveStation(snapshot.status === 'complete' ? null : snapshot.objective.station);
      bus.emit('lab:objective', snapshot.objective);
      bus.emit('lab:snapshot', snapshot);
    }

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
    this.updatePrompt();
  }

  // ------------------------------------------------------------- rendering

  private buildFloor(): void {
    const data: number[][] = [];
    for (let y = 0; y < MAP_ROWS_COUNT; y++) {
      const row: number[] = [];
      for (let x = 0; x < MAP_COLS; x++) {
        const kind = this.parsed.kinds[y][x];
        row.push(kind === 'wall' ? 123 : 117);
      }
      data.push(row);
    }
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage('tiles', 'tiles-image', TILE, TILE, 0, 0);
    if (tileset) {
      const layer = map.createLayer(0, tileset, 0, 0);
      layer?.setDepth(0);
    }
  }

  private buildMats(): void {
    for (const mat of this.parsed.mats) {
      this.add
        .rectangle(mat.x * TILE, mat.y * TILE, mat.w * TILE, mat.h * TILE, 0x2ec4b6, 0.12)
        .setOrigin(0)
        .setDepth(0.5);
    }
  }

  private buildDoor(): void {
    const row = '#############+############';
    const x = row.indexOf('+');
    this.add
      .image(x * TILE + TILE / 2, (MAP_ROWS_COUNT - 1) * TILE + TILE / 2, 'tiles', 255)
      .setDepth((MAP_ROWS_COUNT - 1) * TILE + TILE);
  }

  private buildLabels(): void {
    const label = (x: number, y: number, text: string): void => {
      this.add
        .text(x, y, text, {
          fontFamily: '"Kenney Pixel"',
          fontSize: '8px',
          color: '#5eead4',
          backgroundColor: '#0b1220',
          padding: { x: 2, y: 1 },
        })
        .setOrigin(0.5, 1)
        .setResolution(4)
        .setDepth(10000);
    };
    label(2 * TILE + TILE, 2 * TILE - 2, 'RECEIVING');
    label(10 * TILE + TILE, 2 * TILE - 2, 'QC');
    label(10 * TILE + TILE, 5 * TILE - 2, 'CENTRIFUGE');
    label(17 * TILE + TILE, 5 * TILE - 2, 'ALIQUOT');
    label(19 * TILE + TILE, 2 * TILE - 2, 'ANALYZERS');
    label(9 * TILE + TILE, 12 * TILE - 2, 'REPORT');
  }

  private buildNpc(): void {
    const x = 5 * TILE + TILE / 2;
    const y = 12 * TILE + TILE;
    this.add.sprite(x, y, 'cls-down').setOrigin(0.5, 1).setDisplaySize(TILE, TILE).setDepth(y);
    this.add
      .text(x, y - TILE - 2, 'Nguyen, CLS', {
        fontFamily: '"Kenney Pixel"',
        fontSize: '7px',
        color: '#ffd9e2',
        backgroundColor: '#132238',
        padding: { x: 2, y: 1 },
      })
      .setOrigin(0.5, 1)
      .setResolution(4)
      .setDepth(10000);
  }

  // ----------------------------------------------------------------- camera

  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_COLS * TILE, MAP_ROWS_COUNT * TILE);
    cam.startFollow(this.player.container, true, 0.12, 0.12);
    cam.setRoundPixels(true);
    cam.setZoom(this.zoomForWidth(this.scale.width));
  }

  private zoomForWidth(width: number): number {
    if (width >= 1600) return ZOOM_LARGE;
    if (width >= 900) return ZOOM_MEDIUM;
    return ZOOM_SMALL;
  }

  private onResize(): void {
    this.cameras.main.setZoom(this.zoomForWidth(this.scale.width));
  }

  // ------------------------------------------------------------------ input

  private setupKeyboardShortcuts(): void {
    this.keyHandler = (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      const key = ev.key.toLowerCase();
      if (key === 'j') {
        ev.preventDefault();
        bus.emit('ui:journal');
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        bus.emit('ui:pause');
      } else if (ev.key === ' ' || key === 'e') {
        ev.preventDefault();
        this.interactNearest();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private setupPointer(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      const cam = this.cameras.main;
      const world = cam.getWorldPoint(pointer.x, pointer.y);
      const tx = Math.floor(world.x / TILE);
      const ty = Math.floor(world.y / TILE);
      if (tx < 0 || ty < 0 || tx >= MAP_COLS || ty >= MAP_ROWS_COUNT) return;

      const tapped = stationAt(this.parsed, tx, ty);
      const adjacentStation = this.parsed.stations.find((s) => s.interactTiles.some((t) => t.x === tx && t.y === ty));
      const station = tapped ?? adjacentStation;
      if (station) {
        this.walkToStation(station.id);
        return;
      }
      if (!this.parsed.walkable[ty][tx]) return;
      const goal = new Set([tileKey(tx, ty)]);
      const path = findPath(this.parsed.walkable, this.player.position(), goal, 200);
      if (!path) {
        bus.emit('toast', 'No path to that spot.', 'warn');
        return;
      }
      this.path = path;
      this.pendingStation = null;
    });
  }

  private walkToStation(id: StationId): void {
    const station = this.stations.find((s) => s.def.id === id);
    if (!station) return;
    const goals = new Set(station.def.interactTiles.map((t) => tileKey(t.x, t.y)));
    if (goals.has(tileKey(this.player.tileX, this.player.tileY))) {
      this.path = [];
      this.pendingStation = null;
      bus.emit('station:open', id);
      return;
    }
    const path = findPath(this.parsed.walkable, this.player.position(), goals, 200);
    if (!path) {
      bus.emit('toast', 'No path to that station.', 'warn');
      return;
    }
    this.path = path;
    this.pendingStation = id;
  }

  interactNearest(): void {
    const station = this.nearestStation();
    if (!station) {
      bus.emit('toast', 'Stand next to a station, then press A.', 'warn');
      return;
    }
    bus.emit('station:open', station.def.id);
  }

  private nearestStation(): Station | null {
    const p = this.player.position();
    return (
      this.stations.find((s) => s.def.interactTiles.some((t) => t.x === p.x && t.y === p.y)) ?? null
    );
  }

  private readInput(): { x: number; y: number } | null {
    const down = (key?: Phaser.Input.Keyboard.Key): boolean => key?.isDown === true;
    let kx = 0;
    let ky = 0;
    if (down(this.cursors?.left) || down(this.wasd?.left)) kx -= 1;
    if (down(this.cursors?.right) || down(this.wasd?.right)) kx += 1;
    if (down(this.cursors?.up) || down(this.wasd?.up)) ky -= 1;
    if (down(this.cursors?.down) || down(this.wasd?.down)) ky += 1;
    if (kx !== 0 || ky !== 0) {
      if (kx !== 0 && ky !== 0) return { x: kx, y: 0 };
      return { x: kx, y: ky };
    }
    const { x, y } = this.joy;
    if (Math.hypot(x, y) < 0.25) return null;
    return Math.abs(x) > Math.abs(y) ? { x: Math.sign(x), y: 0 } : { x: 0, y: Math.sign(y) };
  }

  private isBlocked(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= MAP_COLS || y >= MAP_ROWS_COUNT) return true;
    return !this.parsed.walkable[y][x];
  }

  // ----------------------------------------------------------------- update

  update(): void {
    if (!this.player) return;
    if (this.interactKey && Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      this.interactNearest();
    }
    if (this.player.isMoving) return;
    const dir = this.readInput();
    if (dir) {
      this.path = [];
      this.pendingStation = null;
      this.player.tryStep(dir.x, dir.y, (x, y) => this.isBlocked(x, y));
    } else if (this.path.length) {
      const next = this.path.shift() as { x: number; y: number };
      const dx = next.x - this.player.tileX;
      const dy = next.y - this.player.tileY;
      if (!this.player.tryStep(dx, dy, (x, y) => this.isBlocked(x, y))) {
        this.path = [];
        this.pendingStation = null;
      }
    } else if (this.pendingStation) {
      const id = this.pendingStation;
      this.pendingStation = null;
      bus.emit('station:open', id);
    }
    this.updatePrompt();
  }

  private updatePrompt(): void {
    const station = this.nearestStation();
    const id = station?.def.id ?? null;
    if (id === this.lastPrompt) return;
    this.lastPrompt = id;
    bus.emit('lab:prompt', station ? station.def.label : null);
  }

  private setObjectiveStation(id: StationId | null): void {
    if (id === this.objectiveStation) return;
    this.objectiveStation = id;
    for (const station of this.stations) station.setGlow(station.def.id === id);
  }

  private onShutdown(): void {
    this.unsubscribeEngine?.();
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    for (const station of this.stations) station.setGlow(false);
  }

  /** Debug API helpers. */
  get playerTile(): { x: number; y: number } {
    return this.player.position();
  }

  stationCenter(id: StationId): { x: number; y: number } | null {
    return this.stations.find((s) => s.def.id === id)?.center() ?? null;
  }

  openStation(id: StationId): void {
    this.walkToStation(id);
  }
}
