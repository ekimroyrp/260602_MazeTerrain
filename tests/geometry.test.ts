import { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { createMazeGroup, createMazeTerrainGeometry, disposeMazeGroup } from '../src/core/geometry';
import { DEFAULT_SETTINGS, generateMaze } from '../src/core/maze';
import type { MazeGraph } from '../src/types';

const graph = generateMaze({
  ...DEFAULT_SETTINGS,
  width: 8,
  length: 8,
  seed: 4242,
  levelCount: 7,
  elevationRoughness: 0.72,
});

const renderSettings = {
  cellSize: graph.settings.cellSize,
  wallThickness: graph.settings.wallThickness,
  wallHeight: graph.settings.wallHeight,
  heightScale: graph.settings.heightScale,
  rampRatio: graph.settings.rampRatio,
  rampWidth: graph.settings.rampWidth,
  stairSteps: graph.settings.stairSteps,
  showMarkers: true,
};

function createTransitionGraph(): MazeGraph {
  return {
    width: 2,
    length: 1,
    cells: [
      { x: 0, y: 0, elevation: 0, links: ['east'] },
      { x: 1, y: 0, elevation: 2, links: ['west'] },
    ],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    settings: { ...DEFAULT_SETTINGS, width: 2, length: 1, heightScale: 0.5, levelCount: 3, maxHeightDelta: 2 },
    metadata: {
      algorithm: 'dfs',
      cellCount: 2,
      linkCount: 1,
      minElevation: 0,
      maxElevation: 2,
    },
  };
}

function hasRaisedTransitionVertex(geometry: ReturnType<typeof createMazeTerrainGeometry>, xMin: number, y: number): boolean {
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const vertexY = positions.getY(index);
    const z = positions.getZ(index);
    if (x > xMin && Math.abs(z) < 0.35 && Math.abs(vertexY - y) < 0.001) {
      return true;
    }
  }
  return false;
}

function hasBlockingSideTriangle(
  geometry: ReturnType<typeof createMazeTerrainGeometry>,
  sideX: number,
  topY: number,
  openingHalfDepth: number,
): boolean {
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 3) {
    const xs = [positions.getX(index), positions.getX(index + 1), positions.getX(index + 2)];
    if (!xs.every((x) => Math.abs(x - sideX) < 0.001)) {
      continue;
    }

    const ys = [positions.getY(index), positions.getY(index + 1), positions.getY(index + 2)];
    const zs = [positions.getZ(index), positions.getZ(index + 1), positions.getZ(index + 2)];
    if (Math.min(...ys) <= 0.001 && Math.max(...ys) >= topY - 0.001 && Math.min(...zs) < -openingHalfDepth && Math.max(...zs) > openingHalfDepth) {
      return true;
    }
  }
  return false;
}

describe('maze geometry', () => {
  it('creates finite terrain geometry with positions and normals', () => {
    const geometry = createMazeTerrainGeometry(graph, renderSettings);
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');

    expect(positions.count).toBeGreaterThan(0);
    expect(normals.count).toBe(positions.count);
    for (let index = 0; index < positions.array.length; index += 1) {
      expect(Number.isFinite(positions.array[index])).toBe(true);
    }

    geometry.dispose();
  });

  it('builds a shadow-ready maze group with marker meshes', () => {
    const group = createMazeGroup(graph, renderSettings);
    let meshCount = 0;
    group.traverse((object) => {
      if (object instanceof Mesh) {
        meshCount += 1;
        expect(object.geometry.getAttribute('position').count).toBeGreaterThan(0);
      }
    });

    expect(meshCount).toBeGreaterThanOrEqual(5);
    expect(group.getObjectByName('start-marker')).toBeDefined();
    expect(group.getObjectByName('end-marker')).toBeDefined();
    expect(group.getObjectByName('start-marker-form')).toBeDefined();
    expect(group.getObjectByName('end-marker-form')).toBeDefined();
    disposeMazeGroup(group);
  });

  it('omits start and end markers when markers are disabled', () => {
    const group = createMazeGroup(graph, { ...renderSettings, showMarkers: false });

    expect(group.getObjectByName('start-marker')).toBeUndefined();
    expect(group.getObjectByName('end-marker')).toBeUndefined();

    disposeMazeGroup(group);
  });

  it('does not add a ground plane to the maze group', () => {
    const group = createMazeGroup(graph, renderSettings);

    expect(group.getObjectByName('shadow-ground')).toBeUndefined();

    disposeMazeGroup(group);
  });

  it('extends stairs into the destination platform at platform height', () => {
    const transitionGraph = createTransitionGraph();
    const geometry = createMazeTerrainGeometry(transitionGraph, {
      ...renderSettings,
      heightScale: 0.5,
      rampRatio: 0,
      stairSteps: 5,
      showMarkers: false,
    });
    const highPlatformTop = 0.28 + 2 * 0.5;
    const transitionLift = 0.006;

    expect(hasRaisedTransitionVertex(geometry, 0.1, highPlatformTop + transitionLift)).toBe(true);

    geometry.dispose();
  });

  it('extends ramps into the destination platform at platform height', () => {
    const transitionGraph = createTransitionGraph();
    const geometry = createMazeTerrainGeometry(transitionGraph, {
      ...renderSettings,
      heightScale: 0.5,
      rampRatio: 1,
      showMarkers: false,
    });
    const highPlatformTop = 0.28 + 2 * 0.5;
    const transitionLift = 0.006;

    expect(hasRaisedTransitionVertex(geometry, 0.1, highPlatformTop + transitionLift)).toBe(true);

    geometry.dispose();
  });

  it('opens linked platform sides so transitions are not blocked by vertical faces', () => {
    const transitionGraph = createTransitionGraph();
    const settings = {
      ...renderSettings,
      heightScale: 0.5,
      rampRatio: 1,
      showMarkers: false,
    };
    const geometry = createMazeTerrainGeometry(transitionGraph, settings);
    const platformHalf = settings.cellSize * 0.88 * 0.5;
    const lowSideX = -settings.cellSize * 0.5 + platformHalf;
    const highSideX = settings.cellSize * 0.5 - platformHalf;
    const openingHalfDepth = settings.cellSize * settings.rampWidth * 0.5 * 0.9;

    expect(hasBlockingSideTriangle(geometry, lowSideX, 0.28, openingHalfDepth)).toBe(false);
    expect(hasBlockingSideTriangle(geometry, highSideX, 0.28 + 2 * 0.5, openingHalfDepth)).toBe(false);

    geometry.dispose();
  });
});
