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
  showCheat: false,
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

function hasRaisedTransitionVertex(geometry: ReturnType<typeof createMazeTerrainGeometry>, xTarget: number, y: number): boolean {
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const vertexY = positions.getY(index);
    const z = positions.getZ(index);
    if (Math.abs(x - xTarget) < 0.01 && Math.abs(z) < 0.35 && Math.abs(vertexY - y) < 0.001) {
      return true;
    }
  }
  return false;
}

function getMaxRaisedTransitionX(geometry: ReturnType<typeof createMazeTerrainGeometry>, y: number): number {
  const positions = geometry.getAttribute('position');
  let maxX = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < positions.count; index += 1) {
    const vertexY = positions.getY(index);
    const z = positions.getZ(index);
    if (Math.abs(z) < 0.35 && Math.abs(vertexY - y) < 0.001) {
      maxX = Math.max(maxX, positions.getX(index));
    }
  }
  return maxX;
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

function hasSlabApronTriangle(
  geometry: ReturnType<typeof createMazeTerrainGeometry>,
  sideX: number,
  slabBottomY: number,
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
    if (
      Math.abs(Math.min(...ys) - slabBottomY) < 0.001 &&
      Math.abs(Math.max(...ys) - topY) < 0.001 &&
      Math.min(...zs) <= -openingHalfDepth &&
      Math.max(...zs) >= openingHalfDepth
    ) {
      return true;
    }
  }
  return false;
}

function hasSlabUndersideTriangle(
  geometry: ReturnType<typeof createMazeTerrainGeometry>,
  y: number,
  xMin: number,
  xMax: number,
  zMin: number,
  zMax: number,
): boolean {
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 3) {
    const ys = [positions.getY(index), positions.getY(index + 1), positions.getY(index + 2)];
    if (!ys.every((vertexY) => Math.abs(vertexY - y) < 0.001)) {
      continue;
    }

    const xs = [positions.getX(index), positions.getX(index + 1), positions.getX(index + 2)];
    const zs = [positions.getZ(index), positions.getZ(index + 1), positions.getZ(index + 2)];
    if (Math.min(...xs) <= xMin + 0.001 && Math.max(...xs) >= xMax - 0.001 && Math.min(...zs) <= zMin + 0.001 && Math.max(...zs) >= zMax - 0.001) {
      return true;
    }
  }
  return false;
}

function hasMeshVertexNearY(mesh: Mesh, y: number): boolean {
  const positions = mesh.geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    if (Math.abs(positions.getY(index) - y) < 0.025) {
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

  it('draws a red cheat path only when cheat mode is enabled', () => {
    const hiddenGroup = createMazeGroup(graph, renderSettings);
    const visibleGroup = createMazeGroup(graph, { ...renderSettings, showCheat: true });
    const cheatPath = visibleGroup.getObjectByName('cheat-path');

    expect(hiddenGroup.getObjectByName('cheat-path')).toBeUndefined();
    expect(cheatPath).toBeInstanceOf(Mesh);
    if (cheatPath instanceof Mesh) {
      expect(cheatPath.geometry.getAttribute('position').count).toBeGreaterThan(0);
    }

    disposeMazeGroup(hiddenGroup);
    disposeMazeGroup(visibleGroup);
  });

  it('routes the cheat path over stair transition heights', () => {
    const transitionGraph = createTransitionGraph();
    const group = createMazeGroup(transitionGraph, {
      ...renderSettings,
      heightScale: 0.5,
      rampRatio: 0,
      stairSteps: 5,
      showMarkers: false,
      showCheat: true,
    });
    const cheatPath = group.getObjectByName('cheat-path');
    const lowTop = 0.28;
    const highTop = 0.28 + 2 * 0.5;
    const cheatLift = 0.13;

    expect(cheatPath).toBeInstanceOf(Mesh);
    if (cheatPath instanceof Mesh) {
      for (let index = 0; index < 5; index += 1) {
        const heightRatio = index / 4;
        expect(hasMeshVertexNearY(cheatPath, lowTop + (highTop - lowTop) * heightRatio + cheatLift)).toBe(true);
      }
    }

    disposeMazeGroup(group);
  });

  it('does not add a ground plane to the maze group', () => {
    const group = createMazeGroup(graph, renderSettings);

    expect(group.getObjectByName('shadow-ground')).toBeUndefined();

    disposeMazeGroup(group);
  });

  it('extends stairs into the destination platform at platform height', () => {
    const transitionGraph = createTransitionGraph();
    const settings = {
      ...renderSettings,
      heightScale: 0.5,
      rampRatio: 0,
      stairSteps: 5,
      showMarkers: false,
    };
    const geometry = createMazeTerrainGeometry(transitionGraph, settings);
    const highPlatformTop = 0.28 + 2 * 0.5;
    const highPlatformEdge = settings.cellSize * 0.5 - settings.cellSize * 0.88 * 0.5;
    const transitionLift = 0.006;

    expect(hasRaisedTransitionVertex(geometry, highPlatformEdge, highPlatformTop + transitionLift)).toBe(true);
    expect(getMaxRaisedTransitionX(geometry, highPlatformTop + transitionLift)).toBeLessThanOrEqual(highPlatformEdge + 0.015);

    geometry.dispose();
  });

  it('extends ramps into the destination platform at platform height', () => {
    const transitionGraph = createTransitionGraph();
    const settings = {
      ...renderSettings,
      heightScale: 0.5,
      rampRatio: 1,
      showMarkers: false,
    };
    const geometry = createMazeTerrainGeometry(transitionGraph, settings);
    const highPlatformTop = 0.28 + 2 * 0.5;
    const highPlatformEdge = settings.cellSize * 0.5 - settings.cellSize * 0.88 * 0.5;
    const transitionLift = 0.006;

    expect(hasRaisedTransitionVertex(geometry, highPlatformEdge, highPlatformTop + transitionLift)).toBe(true);
    expect(getMaxRaisedTransitionX(geometry, highPlatformTop + transitionLift)).toBeLessThanOrEqual(highPlatformEdge + 0.015);

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

  it('keeps visible slab thickness at linked platform openings', () => {
    const transitionGraph = createTransitionGraph();
    const settings = {
      ...renderSettings,
      heightScale: 0.5,
      rampRatio: 1,
      showMarkers: false,
    };
    const geometry = createMazeTerrainGeometry(transitionGraph, settings);
    const platformHalf = settings.cellSize * 0.88 * 0.5;
    const lowTop = 0.28;
    const highTop = 0.28 + 2 * 0.5;
    const slabThickness = 0.16;
    const lowSideX = -settings.cellSize * 0.5 + platformHalf;
    const highSideX = settings.cellSize * 0.5 - platformHalf;
    const openingHalfDepth = settings.cellSize * settings.rampWidth * 0.5 * 0.9;
    const lowCenterX = -settings.cellSize * 0.5;
    const highCenterX = settings.cellSize * 0.5;

    expect(hasSlabApronTriangle(geometry, lowSideX, lowTop - slabThickness, lowTop, openingHalfDepth)).toBe(true);
    expect(hasSlabApronTriangle(geometry, highSideX, highTop - slabThickness, highTop, openingHalfDepth)).toBe(true);
    expect(
      hasSlabUndersideTriangle(
        geometry,
        lowTop - slabThickness,
        lowCenterX - platformHalf,
        lowCenterX + platformHalf,
        -platformHalf,
        platformHalf,
      ),
    ).toBe(true);
    expect(
      hasSlabUndersideTriangle(
        geometry,
        highTop - slabThickness,
        highCenterX - platformHalf,
        highCenterX + platformHalf,
        -platformHalf,
        platformHalf,
      ),
    ).toBe(true);

    geometry.dispose();
  });
});
