import type { StationId } from '../types';

export const TILE = 16;
export const MAP_COLS = 26;
export const MAP_ROWS_COUNT = 13;
export const SPAWN = { x: 13, y: 11 };

/** The lab, compacted for portrait/landscape fit. Every row is 26 characters. */
export const MAP_ROWS = [
  '##########################',
  '#.RRR....QQQ....KKK..HHH.#',
  '#.R.R....Q.Q....K.K..H.H.#',
  '#.AAA....CCC....LLL..GGG.#',
  '#.A.A....C.C....L.L..G.G.#',
  '#..~~~~~~....~~~~~~......#',
  '#..~....~....~....~......#',
  '#..~~~~~~....~~~~~~......#',
  '#.SSS...PPP....XXX..FFF..#',
  '#.S.S...P.P....X.X..F.F..#',
  '#..p....MMM.....B....e...#',
  '#........................#',
  '#############+############',
] as const;

export type TileKind = 'floor' | 'wall' | 'mat';

export interface TilePoint {
  x: number;
  y: number;
}

export interface StationDef {
  id: StationId;
  letter: string;
  label: string;
  tiles: TilePoint[];
  interactTiles: TilePoint[];
}

const STATION_LETTERS: Record<string, StationId> = {
  R: 'receiving',
  A: 'accession',
  Q: 'qc',
  C: 'centrifuge',
  L: 'aliquot',
  K: 'chem',
  H: 'hema',
  G: 'coag',
  S: 'cls',
  P: 'report',
  X: 'printer',
  F: 'fridge',
  M: 'microscope',
  B: 'biohazard',
  e: 'eyewash',
};

const STATION_LABELS: Record<StationId, string> = {
  receiving: 'RECEIVING',
  accession: 'ACCESSION',
  qc: 'QC',
  centrifuge: 'CENTRIFUGE',
  aliquot: 'ALIQUOT',
  chem: 'CHEM',
  hema: 'HEMA',
  coag: 'COAG',
  cls: 'CLS DESK',
  report: 'REPORT',
  microscope: 'MICROSCOPE',
  fridge: 'FRIDGE',
  biohazard: 'BIOHAZARD',
  eyewash: 'EYEWASH',
  printer: 'PRINTER',
};

export interface ParsedMap {
  walkable: boolean[][];
  kinds: TileKind[][];
  stations: StationDef[];
  mats: { x: number; y: number; w: number; h: number }[];
}

const key = (x: number, y: number): string => `${x},${y}`;

export function tileKey(x: number, y: number): string {
  return key(x, y);
}

export function parseMap(): ParsedMap {
  const walkable: boolean[][] = [];
  const kinds: TileKind[][] = [];
  const blockedLetters = new Set(Object.keys(STATION_LETTERS));

  for (let y = 0; y < MAP_ROWS.length; y++) {
    const row = MAP_ROWS[y];
    if (row.length !== MAP_COLS) throw new Error(`Map row ${y} has ${row.length} columns, expected ${MAP_COLS}`);
    const walkRow: boolean[] = [];
    const kindRow: TileKind[] = [];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const isWall = ch === '#';
      const isMat = ch === '~';
      const isFloor = ch === '.' || ch === ',';
      walkRow.push(isFloor || isMat);
      kindRow.push(isWall ? 'wall' : isMat ? 'mat' : 'floor');
    }
    walkable.push(walkRow);
    kinds.push(kindRow);
  }

  const stations: StationDef[] = [];
  const seenLetters = new Set<string>();
  for (let y = 0; y < MAP_ROWS.length; y++) {
    for (let x = 0; x < MAP_COLS; x++) {
      const letter = MAP_ROWS[y][x];
      const stationId = STATION_LETTERS[letter];
      if (!stationId || seenLetters.has(letter)) continue;
      if (!blockedLetters.has(letter)) continue;
      seenLetters.add(letter);
      const tiles: TilePoint[] = [];
      const stack: TilePoint[] = [{ x, y }];
      const visited = new Set<string>();
      while (stack.length) {
        const p = stack.pop() as TilePoint;
        const k = key(p.x, p.y);
        if (visited.has(k)) continue;
        if (p.y < 0 || p.y >= MAP_ROWS.length || p.x < 0 || p.x >= MAP_COLS) continue;
        if (MAP_ROWS[p.y][p.x] !== letter) continue;
        visited.add(k);
        tiles.push(p);
        stack.push({ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 });
      }
      const interactSet = new Map<string, TilePoint>();
      for (const t of tiles) {
        for (const n of [
          { x: t.x + 1, y: t.y },
          { x: t.x - 1, y: t.y },
          { x: t.x, y: t.y + 1 },
          { x: t.x, y: t.y - 1 },
        ]) {
          if (n.y < 0 || n.y >= MAP_ROWS.length || n.x < 0 || n.x >= MAP_COLS) continue;
          if (!walkable[n.y][n.x]) continue;
          interactSet.set(key(n.x, n.y), n);
        }
      }
      stations.push({
        id: stationId,
        letter,
        label: STATION_LABELS[stationId],
        tiles: tiles.sort((a, b) => a.y - b.y || a.x - b.x),
        interactTiles: [...interactSet.values()].sort((a, b) => a.y - b.y || a.x - b.x),
      });
    }
  }

  const mats: { x: number; y: number; w: number; h: number }[] = [];
  for (let y = 0; y < MAP_ROWS.length; y++) {
    let runStart = -1;
    for (let x = 0; x <= MAP_COLS; x++) {
      const isMat = x < MAP_COLS && MAP_ROWS[y][x] === '~';
      if (isMat && runStart < 0) runStart = x;
      if (!isMat && runStart >= 0) {
        mats.push({ x: runStart, y, w: x - runStart, h: 1 });
        runStart = -1;
      }
    }
  }

  return { walkable, kinds, stations, mats };
}

export function stationAt(parsed: ParsedMap, x: number, y: number): StationDef | null {
  return parsed.stations.find((s) => s.tiles.some((t) => t.x === x && t.y === y)) ?? null;
}

export const STATION_NAMES = STATION_LABELS;
