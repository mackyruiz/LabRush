import { describe, expect, it } from 'vitest';
import { MAP_COLS, MAP_ROWS, MAP_ROWS_COUNT, SPAWN, parseMap, tileKey } from '../src/game/world/map';
import { findPath } from '../src/game/world/pathing';

describe('lab map', () => {
  const parsed = parseMap();

  it('has 26 columns in every row', () => {
    expect(MAP_ROWS).toHaveLength(MAP_ROWS_COUNT);
    for (const row of MAP_ROWS) expect(row.length).toBe(MAP_COLS);
  });

  it('spawns on a walkable tile', () => {
    expect(parsed.walkable[SPAWN.y][SPAWN.x]).toBe(true);
  });

  it('parses every station footprint with at least one interact tile', () => {
    const ids = parsed.stations.map((s) => s.id).sort();
    expect(ids).toEqual(
      [
        'accession',
        'aliquot',
        'biohazard',
        'centrifuge',
        'chem',
        'cls',
        'coag',
        'eyewash',
        'fridge',
        'hema',
        'microscope',
        'printer',
        'qc',
        'receiving',
        'report',
      ].sort(),
    );
    for (const station of parsed.stations) {
      expect(station.tiles.length, station.id).toBeGreaterThan(0);
      expect(station.interactTiles.length, station.id).toBeGreaterThan(0);
    }
  });

  it('reaches an interact tile for every station from the spawn', () => {
    for (const station of parsed.stations) {
      const goals = new Set(station.interactTiles.map((t) => tileKey(t.x, t.y)));
      const path = findPath(parsed.walkable, SPAWN, goals, 200);
      expect(path, `${station.id} should be reachable`).not.toBeNull();
      expect((path ?? []).length, station.id).toBeGreaterThan(0);
    }
  });

  it('keeps the player out of counter tiles', () => {
    for (const station of parsed.stations) {
      for (const tile of station.tiles) {
        expect(parsed.walkable[tile.y][tile.x], `${station.id} ${tile.x},${tile.y}`).toBe(false);
      }
    }
  });

  it('returns null for unreachable goals outside the bounding search', () => {
    const goals = new Set(['0,0']);
    expect(findPath(parsed.walkable, SPAWN, goals, 200)).toBeNull();
  });
});
