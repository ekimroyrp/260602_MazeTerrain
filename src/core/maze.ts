import type { Direction, GridPoint, MazeAlgorithm, MazeCell, MazeGraph, MazeSettings } from '../types';
import { DIRECTIONS } from '../types';

export const DEFAULT_SETTINGS: MazeSettings = {
  width: 18,
  length: 18,
  seed: 260602,
  algorithm: 'dfs',
  cellSize: 1.2,
  wallThickness: 0.13,
  wallHeight: 0.72,
  levelCount: 7,
  heightScale: 0.55,
  elevationRoughness: 0.64,
  maxHeightDelta: 2,
  loopChance: 0.04,
  corridorBias: 0.62,
  frontierRandomness: 0.78,
  kruskalVerticalBias: 0.5,
  divisionOrientationBias: 0.5,
  divisionMinRoomSize: 3,
};

type Random = () => number;

type Edge = {
  from: number;
  to: number;
  direction: Direction;
};

type DisjointSet = {
  parent: number[];
  rank: number[];
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

export function normalizeSettings(settings: Partial<MazeSettings>): MazeSettings {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  const width = clampInt(merged.width, 2, 80);
  const length = clampInt(merged.length, 2, 80);
  const levelCount = clampInt(merged.levelCount, 1, 32);
  return {
    ...merged,
    width,
    length,
    seed: clampInt(merged.seed, 1, 999999),
    cellSize: clamp(merged.cellSize, 0.4, 4),
    wallThickness: clamp(merged.wallThickness, 0.02, merged.cellSize * 0.35),
    wallHeight: clamp(merged.wallHeight, 0, 8),
    levelCount,
    heightScale: clamp(merged.heightScale, 0.05, 8),
    elevationRoughness: clamp(merged.elevationRoughness, 0, 1),
    maxHeightDelta: clampInt(merged.maxHeightDelta, 1, Math.max(1, levelCount - 1)),
    loopChance: clamp(merged.loopChance, 0, 0.8),
    corridorBias: clamp(merged.corridorBias, 0, 1),
    frontierRandomness: clamp(merged.frontierRandomness, 0, 1),
    kruskalVerticalBias: clamp(merged.kruskalVerticalBias, 0, 1),
    divisionOrientationBias: clamp(merged.divisionOrientationBias, 0, 1),
    divisionMinRoomSize: clampInt(merged.divisionMinRoomSize, 1, 16),
  };
}

export function createSeededRandom(seed: number): Random {
  let state = Math.trunc(seed) >>> 0;
  if (state === 0) {
    state = 0x6d2b79f5;
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function getDirectionDelta(direction: Direction): GridPoint {
  switch (direction) {
    case 'north':
      return { x: 0, y: -1 };
    case 'east':
      return { x: 1, y: 0 };
    case 'south':
      return { x: 0, y: 1 };
    case 'west':
      return { x: -1, y: 0 };
  }
}

export function getOppositeDirection(direction: Direction): Direction {
  switch (direction) {
    case 'north':
      return 'south';
    case 'east':
      return 'west';
    case 'south':
      return 'north';
    case 'west':
      return 'east';
  }
}

export function getCellIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

export function getCell(graph: MazeGraph, x: number, y: number): MazeCell | null {
  if (x < 0 || y < 0 || x >= graph.width || y >= graph.length) {
    return null;
  }
  return graph.cells[getCellIndex(graph.width, x, y)] ?? null;
}

function inBounds(settings: MazeSettings, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < settings.width && y < settings.length;
}

function createCells(settings: MazeSettings): MazeCell[] {
  const cells: MazeCell[] = [];
  for (let y = 0; y < settings.length; y += 1) {
    for (let x = 0; x < settings.width; x += 1) {
      cells.push({ x, y, elevation: 0, links: [] });
    }
  }
  return cells;
}

function hasLink(cells: MazeCell[], width: number, from: number, direction: Direction): boolean {
  return cells[from].links.includes(direction);
}

function linkCells(cells: MazeCell[], width: number, from: number, direction: Direction): void {
  const current = cells[from];
  const delta = getDirectionDelta(direction);
  const to = getCellIndex(width, current.x + delta.x, current.y + delta.y);
  const opposite = getOppositeDirection(direction);
  if (!current.links.includes(direction)) {
    current.links.push(direction);
  }
  if (!cells[to].links.includes(opposite)) {
    cells[to].links.push(opposite);
  }
}

function unlinkCells(cells: MazeCell[], width: number, from: number, direction: Direction): void {
  const current = cells[from];
  const delta = getDirectionDelta(direction);
  const to = getCellIndex(width, current.x + delta.x, current.y + delta.y);
  const opposite = getOppositeDirection(direction);
  current.links = current.links.filter((link) => link !== direction);
  cells[to].links = cells[to].links.filter((link) => link !== opposite);
}

function getNeighborEdges(settings: MazeSettings, index: number): Edge[] {
  const x = index % settings.width;
  const y = Math.floor(index / settings.width);
  const edges: Edge[] = [];
  for (const direction of DIRECTIONS) {
    const delta = getDirectionDelta(direction);
    const nextX = x + delta.x;
    const nextY = y + delta.y;
    if (!inBounds(settings, nextX, nextY)) {
      continue;
    }
    edges.push({
      from: index,
      to: getCellIndex(settings.width, nextX, nextY),
      direction,
    });
  }
  return edges;
}

function chooseRandom<T>(items: T[], random: Random): T {
  return items[Math.floor(random() * items.length)];
}

function generateDepthFirst(cells: MazeCell[], settings: MazeSettings, random: Random): void {
  const visited = new Set<number>();
  const start = Math.floor(random() * cells.length);
  const stack: Array<{ index: number; direction: Direction | null }> = [{ index: start, direction: null }];
  visited.add(start);

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const unvisited = getNeighborEdges(settings, current.index).filter((edge) => !visited.has(edge.to));
    if (unvisited.length === 0) {
      stack.pop();
      continue;
    }

    let edge = chooseRandom(unvisited, random);
    if (current.direction && random() < settings.corridorBias) {
      const straight = unvisited.find((candidate) => candidate.direction === current.direction);
      if (straight) {
        edge = straight;
      }
    }

    linkCells(cells, settings.width, edge.from, edge.direction);
    visited.add(edge.to);
    stack.push({ index: edge.to, direction: edge.direction });
  }
}

function addPrimFrontier(settings: MazeSettings, visited: Set<number>, frontier: Edge[], index: number): void {
  for (const edge of getNeighborEdges(settings, index)) {
    if (!visited.has(edge.to)) {
      frontier.push(edge);
    }
  }
}

function generatePrim(cells: MazeCell[], settings: MazeSettings, random: Random): void {
  const visited = new Set<number>();
  const start = Math.floor(random() * cells.length);
  const frontier: Edge[] = [];
  visited.add(start);
  addPrimFrontier(settings, visited, frontier, start);

  while (frontier.length > 0) {
    const randomIndex = Math.floor(random() * frontier.length);
    const stackIndex = frontier.length - 1;
    const pickIndex = random() < settings.frontierRandomness ? randomIndex : stackIndex;
    const edge = frontier.splice(pickIndex, 1)[0];
    if (visited.has(edge.from) && visited.has(edge.to)) {
      continue;
    }
    const from = visited.has(edge.from) ? edge.from : edge.to;
    const to = visited.has(edge.from) ? edge.to : edge.from;
    const direction = edge.from === from ? edge.direction : getOppositeDirection(edge.direction);
    linkCells(cells, settings.width, from, direction);
    visited.add(to);
    addPrimFrontier(settings, visited, frontier, to);
  }
}

function createDisjointSet(count: number): DisjointSet {
  return {
    parent: Array.from({ length: count }, (_, index) => index),
    rank: Array.from({ length: count }, () => 0),
  };
}

function findSet(set: DisjointSet, index: number): number {
  let parent = set.parent[index];
  if (parent !== index) {
    parent = findSet(set, parent);
    set.parent[index] = parent;
  }
  return parent;
}

function unionSet(set: DisjointSet, a: number, b: number): boolean {
  const rootA = findSet(set, a);
  const rootB = findSet(set, b);
  if (rootA === rootB) {
    return false;
  }
  if (set.rank[rootA] < set.rank[rootB]) {
    set.parent[rootA] = rootB;
  } else if (set.rank[rootA] > set.rank[rootB]) {
    set.parent[rootB] = rootA;
  } else {
    set.parent[rootB] = rootA;
    set.rank[rootA] += 1;
  }
  return true;
}

function getUndirectedEdges(settings: MazeSettings): Edge[] {
  const edges: Edge[] = [];
  for (let y = 0; y < settings.length; y += 1) {
    for (let x = 0; x < settings.width; x += 1) {
      const from = getCellIndex(settings.width, x, y);
      if (x + 1 < settings.width) {
        edges.push({ from, to: getCellIndex(settings.width, x + 1, y), direction: 'east' });
      }
      if (y + 1 < settings.length) {
        edges.push({ from, to: getCellIndex(settings.width, x, y + 1), direction: 'south' });
      }
    }
  }
  return edges;
}

function generateKruskal(cells: MazeCell[], settings: MazeSettings, random: Random): void {
  const set = createDisjointSet(cells.length);
  const verticalBias = settings.kruskalVerticalBias - 0.5;
  const edges = getUndirectedEdges(settings).map((edge) => {
    const verticalEdge = edge.direction === 'south';
    const bias = verticalEdge ? -verticalBias * 0.25 : verticalBias * 0.25;
    return { edge, sort: random() + bias };
  });
  edges.sort((a, b) => a.sort - b.sort);

  for (const { edge } of edges) {
    if (unionSet(set, edge.from, edge.to)) {
      linkCells(cells, settings.width, edge.from, edge.direction);
    }
  }
}

function linkAllAdjacentCells(cells: MazeCell[], settings: MazeSettings): void {
  for (const edge of getUndirectedEdges(settings)) {
    linkCells(cells, settings.width, edge.from, edge.direction);
  }
}

function generateRecursiveDivision(cells: MazeCell[], settings: MazeSettings, random: Random): void {
  linkAllAdjacentCells(cells, settings);
  const minRoom = settings.divisionMinRoomSize;

  const divide = (x: number, y: number, width: number, length: number): void => {
    const canVertical = width >= minRoom * 2;
    const canHorizontal = length >= minRoom * 2;
    if (!canVertical && !canHorizontal) {
      return;
    }

    let vertical = canVertical && (!canHorizontal || random() < settings.divisionOrientationBias);
    if (width > length + 2 && canVertical) {
      vertical = true;
    } else if (length > width + 2 && canHorizontal) {
      vertical = false;
    }

    if (vertical) {
      const maxOffset = width - minRoom;
      if (maxOffset <= minRoom) {
        return;
      }
      const wallOffset = minRoom + Math.floor(random() * (maxOffset - minRoom));
      const wallX = x + wallOffset - 1;
      const gapY = y + Math.floor(random() * length);
      for (let nextY = y; nextY < y + length; nextY += 1) {
        if (nextY !== gapY) {
          unlinkCells(cells, settings.width, getCellIndex(settings.width, wallX, nextY), 'east');
        }
      }
      divide(x, y, wallOffset, length);
      divide(x + wallOffset, y, width - wallOffset, length);
      return;
    }

    const maxOffset = length - minRoom;
    if (maxOffset <= minRoom) {
      return;
    }
    const wallOffset = minRoom + Math.floor(random() * (maxOffset - minRoom));
    const wallY = y + wallOffset - 1;
    const gapX = x + Math.floor(random() * width);
    for (let nextX = x; nextX < x + width; nextX += 1) {
      if (nextX !== gapX) {
        unlinkCells(cells, settings.width, getCellIndex(settings.width, nextX, wallY), 'south');
      }
    }
    divide(x, y, width, wallOffset);
    divide(x, y + wallOffset, width, length - wallOffset);
  };

  divide(0, 0, settings.width, settings.length);
}

function applyLoopChance(cells: MazeCell[], settings: MazeSettings, random: Random): void {
  if (settings.loopChance <= 0) {
    return;
  }
  for (const edge of getUndirectedEdges(settings)) {
    if (!hasLink(cells, settings.width, edge.from, edge.direction) && random() < settings.loopChance) {
      linkCells(cells, settings.width, edge.from, edge.direction);
    }
  }
}

function smoothElevations(levels: number[], settings: MazeSettings): number[] {
  const iterations = Math.round((1 - settings.elevationRoughness) * 5);
  let current = levels;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = [...current];
    for (let y = 0; y < settings.length; y += 1) {
      for (let x = 0; x < settings.width; x += 1) {
        let sum = current[getCellIndex(settings.width, x, y)];
        let count = 1;
        for (const direction of DIRECTIONS) {
          const delta = getDirectionDelta(direction);
          const nx = x + delta.x;
          const ny = y + delta.y;
          if (!inBounds(settings, nx, ny)) {
            continue;
          }
          sum += current[getCellIndex(settings.width, nx, ny)];
          count += 1;
        }
        next[getCellIndex(settings.width, x, y)] = clampInt(sum / count, 0, settings.levelCount - 1);
      }
    }
    current = next;
  }
  return current;
}

function clampLinkedElevationDeltas(cells: MazeCell[], settings: MazeSettings): void {
  for (let pass = 0; pass < settings.width + settings.length; pass += 1) {
    let changed = false;
    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells[index];
      for (const direction of cell.links) {
        const delta = getDirectionDelta(direction);
        const next = cells[getCellIndex(settings.width, cell.x + delta.x, cell.y + delta.y)];
        const difference = next.elevation - cell.elevation;
        if (Math.abs(difference) <= settings.maxHeightDelta) {
          continue;
        }
        if (difference > 0) {
          next.elevation = cell.elevation + settings.maxHeightDelta;
        } else {
          cell.elevation = next.elevation + settings.maxHeightDelta;
        }
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }

  let minElevation = Math.min(...cells.map((cell) => cell.elevation));
  if (minElevation > 0) {
    for (const cell of cells) {
      cell.elevation -= minElevation;
    }
  }

  const maxAllowed = settings.levelCount - 1;
  for (const cell of cells) {
    cell.elevation = clampInt(cell.elevation, 0, maxAllowed);
  }
}

function applyElevations(cells: MazeCell[], settings: MazeSettings, random: Random): void {
  const centerX = (settings.width - 1) * 0.5;
  const centerY = (settings.length - 1) * 0.5;
  const maxDistance = Math.max(1, Math.hypot(centerX, centerY));
  const raw = cells.map((cell) => {
    const radial = 1 - Math.hypot(cell.x - centerX, cell.y - centerY) / maxDistance;
    const noise = random();
    const blended = noise * settings.elevationRoughness + radial * (1 - settings.elevationRoughness);
    return clampInt(blended * (settings.levelCount - 1), 0, settings.levelCount - 1);
  });
  const smoothed = smoothElevations(raw, settings);
  cells.forEach((cell, index) => {
    cell.elevation = smoothed[index];
  });
  clampLinkedElevationDeltas(cells, settings);
}

function countLinks(cells: MazeCell[]): number {
  return cells.reduce((sum, cell) => sum + cell.links.length, 0) / 2;
}

function getElevationRange(cells: MazeCell[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const cell of cells) {
    min = Math.min(min, cell.elevation);
    max = Math.max(max, cell.elevation);
  }
  return { min, max };
}

export function generateMaze(inputSettings: Partial<MazeSettings>): MazeGraph {
  const settings = normalizeSettings(inputSettings);
  const random = createSeededRandom(settings.seed);
  const cells = createCells(settings);

  switch (settings.algorithm) {
    case 'dfs':
      generateDepthFirst(cells, settings, random);
      break;
    case 'prim':
      generatePrim(cells, settings, random);
      break;
    case 'kruskal':
      generateKruskal(cells, settings, random);
      break;
    case 'division':
      generateRecursiveDivision(cells, settings, random);
      break;
  }

  applyLoopChance(cells, settings, random);
  applyElevations(cells, settings, random);

  const range = getElevationRange(cells);
  return {
    width: settings.width,
    length: settings.length,
    cells,
    start: { x: 0, y: settings.length - 1 },
    end: { x: settings.width - 1, y: 0 },
    settings,
    metadata: {
      algorithm: settings.algorithm,
      cellCount: cells.length,
      linkCount: countLinks(cells),
      minElevation: range.min,
      maxElevation: range.max,
    },
  };
}

export function getReachableCellKeys(graph: MazeGraph, start: GridPoint = graph.start): Set<string> {
  const reachable = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const point = stack.pop();
    if (!point) {
      continue;
    }
    const key = `${point.x},${point.y}`;
    if (reachable.has(key)) {
      continue;
    }
    reachable.add(key);
    const cell = getCell(graph, point.x, point.y);
    if (!cell) {
      continue;
    }
    for (const direction of cell.links) {
      const delta = getDirectionDelta(direction);
      stack.push({ x: cell.x + delta.x, y: cell.y + delta.y });
    }
  }
  return reachable;
}

export function hasPathBetween(graph: MazeGraph, start: GridPoint, end: GridPoint): boolean {
  return getReachableCellKeys(graph, start).has(`${end.x},${end.y}`);
}

export function findSolutionPath(graph: MazeGraph, start: GridPoint = graph.start, end: GridPoint = graph.end): GridPoint[] {
  const startKey = `${start.x},${start.y}`;
  const endKey = `${end.x},${end.y}`;
  const queue: GridPoint[] = [start];
  const visited = new Set([startKey]);
  const previous = new Map<string, GridPoint | null>([[startKey, null]]);

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const point = queue[cursor];
    const key = `${point.x},${point.y}`;
    if (key === endKey) {
      break;
    }

    const cell = getCell(graph, point.x, point.y);
    if (!cell) {
      continue;
    }

    for (const direction of cell.links) {
      const delta = getDirectionDelta(direction);
      const next = { x: cell.x + delta.x, y: cell.y + delta.y };
      const nextKey = `${next.x},${next.y}`;
      if (visited.has(nextKey)) {
        continue;
      }
      visited.add(nextKey);
      previous.set(nextKey, point);
      queue.push(next);
    }
  }

  if (!previous.has(endKey)) {
    return [];
  }

  const path: GridPoint[] = [];
  let current: GridPoint | null = end;
  while (current) {
    path.push(current);
    current = previous.get(`${current.x},${current.y}`) ?? null;
  }
  return path.reverse();
}

export function getLinkedElevationViolations(graph: MazeGraph): Array<{ from: GridPoint; to: GridPoint; delta: number }> {
  const violations: Array<{ from: GridPoint; to: GridPoint; delta: number }> = [];
  for (const cell of graph.cells) {
    for (const direction of cell.links) {
      if (direction === 'west' || direction === 'north') {
        continue;
      }
      const offset = getDirectionDelta(direction);
      const next = getCell(graph, cell.x + offset.x, cell.y + offset.y);
      if (!next) {
        continue;
      }
      const delta = Math.abs(next.elevation - cell.elevation);
      if (delta > graph.settings.maxHeightDelta) {
        violations.push({
          from: { x: cell.x, y: cell.y },
          to: { x: next.x, y: next.y },
          delta,
        });
      }
    }
  }
  return violations;
}

export function getAlgorithmLabel(algorithm: MazeAlgorithm): string {
  switch (algorithm) {
    case 'dfs':
      return 'DFS Backtracker';
    case 'prim':
      return 'Prim';
    case 'kruskal':
      return 'Kruskal';
    case 'division':
      return 'Recursive Division';
  }
}
