import Phaser from 'phaser';
import { bus } from '../bus';
import type { ShiftEngine } from '../state/ShiftEngine';
import type { Objective, StationId } from '../types';
import { MAP_COLS, MAP_ROWS_COUNT, SPAWN, TILE, parseMap, type ParsedMap, type StationDef } from './map';
import { Player } from './Player';
import { Station } from './Station';

export class LabScene extends Phaser.Scene {
  private parsed!: ParsedMap;
  private stations: Station[] = [];
  private player!: Player;
  private engine?: ShiftEngine;
  private objectiveStation: StationId | null = null;
  private unsubscribeEngine?: () => void;
  private unsubs: (() => void)[] = [];
  private keyHandler?: (ev: KeyboardEvent) => void;
  private boardObserver?: ResizeObserver;

  constructor() {
    super('LabScene');
  }

  create(): void {
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
    this.setupPointer();
    this.setupKeyboardShortcuts();

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
    void row;
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
    label(2 * TILE + TILE, 1 * TILE - 2, 'RECEIVING');
    label(2 * TILE + TILE, 3 * TILE - 6, 'ACCESSION');
    label(10 * TILE + TILE, 1 * TILE - 2, 'QC');
    label(10 * TILE + TILE, 3 * TILE - 2, 'CENTRIFUGE');
    label(17 * TILE + TILE, 3 * TILE - 2, 'ALIQUOT');
    label(19 * TILE + TILE, 1 * TILE - 2, 'ANALYZERS');
    label(9 * TILE + TILE, 8 * TILE - 2, 'REPORT');
  }

  private buildNpc(): void {
    const x = 5 * TILE + TILE / 2;
    const y = 8 * TILE + TILE;
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
    cam.setRoundPixels(true);
    this.applyCameraMode();
    const slot = document.getElementById('board-slot');
    if (slot && typeof ResizeObserver !== 'undefined') {
      this.boardObserver = new ResizeObserver(() => this.applyCameraMode());
      this.boardObserver.observe(slot);
    }
  }

  /**
   * Fit the whole 26x13 lab into the DOM `#board-slot` row of the lab grid.
   * CSS px are converted to canvas px because the canvas is DPI-scaled.
   */
  private applyCameraMode(): void {
    const cam = this.cameras.main;
    const canvas = this.game.canvas.getBoundingClientRect();
    const slot = document.getElementById('board-slot')?.getBoundingClientRect();
    const sx = canvas.width ? this.scale.width / canvas.width : 1;
    const sy = canvas.height ? this.scale.height / canvas.height : 1;
    const r =
      slot && slot.width > 8 && slot.height > 8
        ? { x: (slot.left - canvas.left) * sx, y: (slot.top - canvas.top) * sy, w: slot.width * sx, h: slot.height * sy }
        : { x: 0, y: 0, w: this.scale.width, h: this.scale.height };
    cam.setViewport(r.x, r.y, r.w, r.h);
    const mapW = MAP_COLS * TILE;
    const mapH = MAP_ROWS_COUNT * TILE;
    const zoom = Math.min(r.w / mapW, r.h / mapH);
    cam.setZoom(zoom);
    cam.setScroll((mapW - r.w / zoom) / 2, (mapH - r.h / zoom) / 2);
  }

  private onResize(): void {
    this.applyCameraMode();
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
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private setupPointer(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      const cam = this.cameras.main;
      if (pointer.x < cam.x || pointer.y < cam.y || pointer.x > cam.x + cam.width || pointer.y > cam.y + cam.height) return;
      const wx = (pointer.x - cam.x) / cam.zoom + cam.scrollX;
      const wy = (pointer.y - cam.y) / cam.zoom + cam.scrollY;
      const tapped = this.stationNear(Math.floor(wx / TILE), Math.floor(wy / TILE));
      if (tapped) {
        bus.emit('station:open', tapped.id);
        this.movePlayerToStation(tapped.id);
      }
    });
  }

  /**
   * At the zoom a 390px column gives (390/416 ~ 0.94) a 2x2-tile station is only
   * ~30 CSS px wide. Grow the footprint by one tile on every side, which makes
   * every station ~60 CSS px, and return the nearest one when regions overlap.
   */
  private stationNear(tx: number, ty: number): StationDef | null {
    let best: StationDef | null = null;
    let bestDist = Infinity;
    for (const s of this.parsed.stations) {
      const xs = s.tiles.map((t) => t.x);
      const ys = s.tiles.map((t) => t.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      if (tx < minX - 1 || tx > maxX + 1 || ty < minY - 1 || ty > maxY + 1) continue;
      const d = (tx - (minX + maxX) / 2) ** 2 + (ty - (minY + maxY) / 2) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  // ----------------------------------------------------------------- player

  private movePlayerToStation(id: StationId): void {
    const st = this.stations.find(s => s.def.id === id);
    if (!st) return;
    // find a walkable tile adjacent to the station footprint
    const interact = st.def.interactTiles[0];
    if (!interact) return;
    const px = interact.x * TILE + TILE / 2;
    const py = interact.y * TILE + TILE;
    this.tweens.add({
      targets: this.player.container,
      x: px,
      y: py,
      duration: 250,
      ease: 'Sine.InOut',
      onComplete: () => {
        this.player.tileX = interact.x;
        this.player.tileY = interact.y;
        this.player.container.setDepth(py);
      },
    });
    const facing: 'left' | 'right' = px < this.player.container.x ? 'left' : 'right';
    this.player.setFacing(facing);
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
    this.boardObserver?.disconnect();
    this.boardObserver = undefined;
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    for (const station of this.stations) station.setGlow(false);
  }

  /** Search API for debug. */
  get playerTile(): { x: number; y: number } {
    return this.player.position();
  }

  stationCenter(id: StationId): { x: number; y: number } | null {
    return this.stations.find((s) => s.def.id === id)?.center() ?? null;
  }

  openStation(id: StationId): void {
    bus.emit('station:open', id);
    this.movePlayerToStation(id);
  }
}
