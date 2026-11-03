import { MAP_COLS, MAP_ROWS_COUNT, tileKey } from './map';

export interface Point {
  x: number;
  y: number;
}

const NEIGHBORS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

interface Node extends Point {
  g: number;
  f: number;
}

/**
 * A* over the 4-neighbor grid to the nearest of a set of goals.
 * Manhattan distance to the nearest goal keeps distant stations cheap,
 * and the expansion budget stops a bad tap from stalling the frame.
 */
export function findPath(
  walkable: boolean[][],
  start: Point,
  goals: ReadonlySet<string>,
  maxVisited = 200,
): Point[] | null {
  const startKey = tileKey(start.x, start.y);
  if (goals.has(startKey)) return [];
  const goalPoints = [...goals].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  });
  const heuristic = (x: number, y: number): number => {
    let best = Infinity;
    for (const g of goalPoints) best = Math.min(best, Math.abs(g.x - x) + Math.abs(g.y - y));
    return best;
  };

  const open: Node[] = [{ x: start.x, y: start.y, g: 0, f: heuristic(start.x, start.y) }];
  const gScore = new Map<string, number>([[startKey, 0]]);
  const cameFrom = new Map<string, string>();
  let expanded = 0;

  while (open.length) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bestIndex].f) bestIndex = i;
    const current = open.splice(bestIndex, 1)[0];
    const currentKey = tileKey(current.x, current.y);
    if (goals.has(currentKey)) {
      const path: Point[] = [];
      let cursor = currentKey;
      while (cursor !== startKey) {
        const [cx, cy] = cursor.split(',').map(Number);
        path.push({ x: cx, y: cy });
        const prev = cameFrom.get(cursor);
        if (!prev) break;
        cursor = prev;
      }
      return path.reverse();
    }
    expanded++;
    if (expanded > maxVisited) return null;
    for (const d of NEIGHBORS) {
      const x = current.x + d.x;
      const y = current.y + d.y;
      if (x < 0 || y < 0 || x >= MAP_COLS || y >= MAP_ROWS_COUNT) continue;
      if (!walkable[y][x]) continue;
      const k = tileKey(x, y);
      const g = current.g + 1;
      const known = gScore.get(k);
      if (known !== undefined && known <= g) continue;
      gScore.set(k, g);
      cameFrom.set(k, currentKey);
      open.push({ x, y, g, f: g + heuristic(x, y) });
    }
  }
  return null;
}
