import { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { createMazeGroup, createMazeTerrainGeometry, disposeMazeGroup } from '../src/core/geometry';
import { DEFAULT_SETTINGS, generateMaze } from '../src/core/maze';

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
});
