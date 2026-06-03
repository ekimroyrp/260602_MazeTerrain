import { describe, expect, it } from 'vitest';
import type { MazeAlgorithm, MazeGraph } from '../src/types';
import {
  DEFAULT_SETTINGS,
  findSolutionPath,
  generateMaze,
  getCell,
  getDirectionDelta,
  getLinkedElevationViolations,
  getReachableCellKeys,
  hasPathBetween,
} from '../src/core/maze';

const algorithms: MazeAlgorithm[] = ['dfs', 'prim', 'kruskal', 'division'];

function graphSignature(graph: MazeGraph): string {
  return graph.cells
    .map((cell) => `${cell.x},${cell.y}:${cell.elevation}:${[...cell.links].sort().join('|')}`)
    .join(';');
}

describe('maze generation', () => {
  it.each(algorithms)('generates deterministic %s mazes by seed', (algorithm) => {
    const settings = { ...DEFAULT_SETTINGS, width: 12, length: 10, seed: 2468, algorithm };
    const first = generateMaze(settings);
    const second = generateMaze(settings);

    expect(graphSignature(first)).toBe(graphSignature(second));
  });

  it.each(algorithms)('keeps every %s cell reachable', (algorithm) => {
    const graph = generateMaze({ ...DEFAULT_SETTINGS, width: 11, length: 9, seed: 1357, algorithm });
    const reachable = getReachableCellKeys(graph);

    expect(reachable.size).toBe(graph.cells.length);
    expect(hasPathBetween(graph, graph.start, graph.end)).toBe(true);
  });

  it.each(algorithms)('finds a linked start-to-end solution path for %s', (algorithm) => {
    const graph = generateMaze({ ...DEFAULT_SETTINGS, width: 11, length: 9, seed: 97531, algorithm });
    const path = findSolutionPath(graph);

    expect(path[0]).toEqual(graph.start);
    expect(path[path.length - 1]).toEqual(graph.end);
    for (let index = 0; index < path.length - 1; index += 1) {
      const current = getCell(graph, path[index].x, path[index].y);
      expect(current).not.toBeNull();
      if (!current) {
        throw new Error('solution path referenced a missing cell');
      }
      const next = path[index + 1];
      const direction = current.links.find((link) => {
        const delta = getDirectionDelta(link);
        return current.x + delta.x === next.x && current.y + delta.y === next.y;
      });
      expect(direction).toBeDefined();
    }
  });

  it.each(algorithms)('limits linked elevation deltas for %s', (algorithm) => {
    const graph = generateMaze({
      ...DEFAULT_SETTINGS,
      width: 14,
      length: 12,
      seed: 999,
      algorithm,
      levelCount: 12,
      elevationRoughness: 1,
      maxHeightDelta: 2,
    });

    expect(getLinkedElevationViolations(graph)).toHaveLength(0);
  });

  it('opens extra links when loop chance is increased', () => {
    const base = generateMaze({ ...DEFAULT_SETTINGS, width: 12, length: 12, seed: 77, loopChance: 0 });
    const looped = generateMaze({ ...DEFAULT_SETTINGS, width: 12, length: 12, seed: 77, loopChance: 0.2 });

    expect(looped.metadata.linkCount).toBeGreaterThan(base.metadata.linkCount);
  });
});
