import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Direction, GridPoint, MazeCell, MazeGraph, MazeRenderSettings } from '../types';
import { getCell, getDirectionDelta } from './maze';

const FOUNDATION_THICKNESS = 0.28;
const CONNECTOR_THICKNESS = 0.12;
const RAMP_THICKNESS = 0.08;
const MARKER_GOLD = 0xd8aa2f;
const MAZE_WHITE = 0xe9e9e3;

type WorldCell = {
  x: number;
  z: number;
  top: number;
};

function disposeGeometryList(geometries: BufferGeometry[]): void {
  for (const geometry of geometries) {
    geometry.dispose();
  }
}

function createBox(width: number, height: number, depth: number, x: number, y: number, z: number): BufferGeometry {
  const base = new BoxGeometry(width, height, depth);
  const geometry = base.toNonIndexed();
  base.dispose();
  geometry.deleteAttribute('uv');
  geometry.translate(x, y, z);
  return geometry;
}

function pushFace(positions: number[], a: Vector3, b: Vector3, c: Vector3, d: Vector3): void {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
}

function createRamp(
  start: GridPoint,
  end: GridPoint,
  startTop: number,
  endTop: number,
  width: number,
): BufferGeometry {
  const startVector = new Vector3(start.x, 0, start.y);
  const endVector = new Vector3(end.x, 0, end.y);
  const axis = endVector.clone().sub(startVector).normalize();
  const side = new Vector3(-axis.z, 0, axis.x).multiplyScalar(width * 0.5);
  const bottomStart = Math.max(0.02, startTop - RAMP_THICKNESS);
  const bottomEnd = Math.max(0.02, endTop - RAMP_THICKNESS);

  const topStartLeft = startVector.clone().add(side).setY(startTop);
  const topStartRight = startVector.clone().sub(side).setY(startTop);
  const topEndLeft = endVector.clone().add(side).setY(endTop);
  const topEndRight = endVector.clone().sub(side).setY(endTop);
  const bottomStartLeft = startVector.clone().add(side).setY(bottomStart);
  const bottomStartRight = startVector.clone().sub(side).setY(bottomStart);
  const bottomEndLeft = endVector.clone().add(side).setY(bottomEnd);
  const bottomEndRight = endVector.clone().sub(side).setY(bottomEnd);

  const positions: number[] = [];
  pushFace(positions, topStartLeft, topEndLeft, topEndRight, topStartRight);
  pushFace(positions, bottomStartRight, bottomEndRight, bottomEndLeft, bottomStartLeft);
  pushFace(positions, topStartLeft, bottomStartLeft, bottomEndLeft, topEndLeft);
  pushFace(positions, topEndRight, bottomEndRight, bottomStartRight, topStartRight);
  pushFace(positions, topStartRight, bottomStartRight, bottomStartLeft, topStartLeft);
  pushFace(positions, topEndLeft, bottomEndLeft, bottomEndRight, topEndRight);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function stableTransitionValue(seed: number, a: MazeCell, b: MazeCell): number {
  let value = seed ^ (a.x * 374761393) ^ (a.y * 668265263) ^ (b.x * 2246822519) ^ (b.y * 3266489917);
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function getWorldCell(graph: MazeGraph, cell: MazeCell, settings: MazeRenderSettings): WorldCell {
  return {
    x: (cell.x - (graph.width - 1) * 0.5) * settings.cellSize,
    z: (cell.y - (graph.length - 1) * 0.5) * settings.cellSize,
    top: FOUNDATION_THICKNESS + cell.elevation * settings.heightScale,
  };
}

function hasLinkedDirection(cell: MazeCell, direction: Direction): boolean {
  return cell.links.includes(direction);
}

function addPlatformGeometry(geometries: BufferGeometry[], graph: MazeGraph, cell: MazeCell, settings: MazeRenderSettings): void {
  const world = getWorldCell(graph, cell, settings);
  const platformSize = settings.cellSize * 0.88;
  geometries.push(createBox(platformSize, world.top, platformSize, world.x, world.top * 0.5, world.z));
}

function addWallGeometry(geometries: BufferGeometry[], graph: MazeGraph, cell: MazeCell, settings: MazeRenderSettings): void {
  const world = getWorldCell(graph, cell, settings);
  const platformSize = settings.cellSize * 0.88;
  const wallTop = world.top + settings.wallHeight * 0.5;
  const wallLength = platformSize + settings.wallThickness;
  const halfPlatform = platformSize * 0.5;

  if (!hasLinkedDirection(cell, 'north')) {
    geometries.push(createBox(wallLength, settings.wallHeight, settings.wallThickness, world.x, wallTop, world.z - halfPlatform));
  }
  if (!hasLinkedDirection(cell, 'south')) {
    geometries.push(createBox(wallLength, settings.wallHeight, settings.wallThickness, world.x, wallTop, world.z + halfPlatform));
  }
  if (!hasLinkedDirection(cell, 'west')) {
    geometries.push(createBox(settings.wallThickness, settings.wallHeight, wallLength, world.x - halfPlatform, wallTop, world.z));
  }
  if (!hasLinkedDirection(cell, 'east')) {
    geometries.push(createBox(settings.wallThickness, settings.wallHeight, wallLength, world.x + halfPlatform, wallTop, world.z));
  }
}

function addFlatConnector(
  geometries: BufferGeometry[],
  a: WorldCell,
  b: WorldCell,
  direction: Direction,
  settings: MazeRenderSettings,
): void {
  const platformSize = settings.cellSize * 0.88;
  const connectorLength = settings.cellSize - platformSize + settings.wallThickness * 2.3;
  const pathWidth = settings.cellSize * settings.rampWidth;
  const x = (a.x + b.x) * 0.5;
  const z = (a.z + b.z) * 0.5;
  const y = a.top - CONNECTOR_THICKNESS * 0.5;
  if (direction === 'east') {
    geometries.push(createBox(connectorLength, CONNECTOR_THICKNESS, pathWidth, x, y, z));
  } else {
    geometries.push(createBox(pathWidth, CONNECTOR_THICKNESS, connectorLength, x, y, z));
  }
}

function addStairs(
  geometries: BufferGeometry[],
  low: WorldCell,
  high: WorldCell,
  direction: Direction,
  settings: MazeRenderSettings,
): void {
  const steps = Math.max(1, Math.round(settings.stairSteps));
  const pathWidth = settings.cellSize * settings.rampWidth;
  const stepLength = (settings.cellSize * 0.96) / steps;
  const xDelta = high.x - low.x;
  const zDelta = high.z - low.z;

  for (let index = 0; index < steps; index += 1) {
    const ratio = (index + 0.5) / steps;
    const top = low.top + (high.top - low.top) * ratio;
    const x = low.x + xDelta * ratio;
    const z = low.z + zDelta * ratio;
    if (direction === 'east' || direction === 'west') {
      geometries.push(createBox(stepLength, top, pathWidth, x, top * 0.5, z));
    } else {
      geometries.push(createBox(pathWidth, top, stepLength, x, top * 0.5, z));
    }
  }
}

function addHeightConnector(
  geometries: BufferGeometry[],
  graph: MazeGraph,
  cell: MazeCell,
  next: MazeCell,
  direction: Direction,
  settings: MazeRenderSettings,
): void {
  const currentWorld = getWorldCell(graph, cell, settings);
  const nextWorld = getWorldCell(graph, next, settings);
  const heightDelta = nextWorld.top - currentWorld.top;
  if (Math.abs(heightDelta) <= 1e-6) {
    addFlatConnector(geometries, currentWorld, nextWorld, direction, settings);
    return;
  }

  const low = heightDelta > 0 ? currentWorld : nextWorld;
  const high = heightDelta > 0 ? nextWorld : currentWorld;
  const rampChance = stableTransitionValue(graph.settings.seed, cell, next);
  if (rampChance < settings.rampRatio) {
    geometries.push(
      createRamp(
        { x: low.x, y: low.z },
        { x: high.x, y: high.z },
        low.top,
        high.top,
        settings.cellSize * settings.rampWidth,
      ),
    );
  } else {
    addStairs(geometries, low, high, direction, settings);
  }
}

export function createMazeTerrainGeometry(graph: MazeGraph, settings: MazeRenderSettings): BufferGeometry {
  const geometries: BufferGeometry[] = [];
  for (const cell of graph.cells) {
    addPlatformGeometry(geometries, graph, cell, settings);
  }
  for (const cell of graph.cells) {
    addWallGeometry(geometries, graph, cell, settings);
  }
  for (const cell of graph.cells) {
    for (const direction of cell.links) {
      if (direction !== 'east' && direction !== 'south') {
        continue;
      }
      const delta = getDirectionDelta(direction);
      const next = getCell(graph, cell.x + delta.x, cell.y + delta.y);
      if (!next) {
        continue;
      }
      addHeightConnector(geometries, graph, cell, next, direction, settings);
    }
  }

  const merged = mergeGeometries(geometries, false);
  disposeGeometryList(geometries);
  if (!merged) {
    return new BufferGeometry();
  }
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function createMarker(graph: MazeGraph, point: GridPoint, settings: MazeRenderSettings, goldMaterial: MeshStandardMaterial): Group {
  const cell = getCell(graph, point.x, point.y);
  const group = new Group();
  if (!cell) {
    return group;
  }
  const world = getWorldCell(graph, cell, settings);
  const baseGeometry = new BoxGeometry(settings.cellSize * 0.26, 0.08, settings.cellSize * 0.26);
  const baseMaterial = new MeshStandardMaterial({ color: MAZE_WHITE, roughness: 0.72, metalness: 0.02 });
  const base = new Mesh(baseGeometry, baseMaterial);
  base.position.set(world.x, world.top + 0.04, world.z);
  base.castShadow = true;
  base.receiveShadow = true;

  const markerGeometry = new ConeGeometry(settings.cellSize * 0.12, settings.cellSize * 0.46, 5);
  const marker = new Mesh(markerGeometry, goldMaterial);
  marker.position.set(world.x, world.top + settings.cellSize * 0.27, world.z);
  marker.rotation.y = (point.x + point.y) * 0.35;
  marker.castShadow = true;
  marker.receiveShadow = true;

  group.add(base, marker);
  return group;
}

export function createMazeGroup(graph: MazeGraph, settings: MazeRenderSettings): Group {
  const group = new Group();
  group.name = 'maze-terrain';

  const terrainGeometry = createMazeTerrainGeometry(graph, settings);
  const terrainMaterial = new MeshStandardMaterial({
    color: MAZE_WHITE,
    metalness: 0.02,
    roughness: 0.74,
  });
  const terrain = new Mesh(terrainGeometry, terrainMaterial);
  terrain.castShadow = true;
  terrain.receiveShadow = true;
  group.add(terrain);

  const groundSize = Math.max(graph.width, graph.length) * settings.cellSize * 1.25;
  const groundGeometry = new PlaneGeometry(groundSize, groundSize);
  const groundMaterial = new MeshStandardMaterial({
    color: 0x050505,
    roughness: 0.9,
    metalness: 0,
  });
  const ground = new Mesh(groundGeometry, groundMaterial);
  ground.name = 'shadow-ground';
  ground.rotation.x = -Math.PI * 0.5;
  ground.position.y = -0.015;
  ground.receiveShadow = true;
  group.add(ground);

  if (settings.showMarkers) {
    const goldMaterial = new MeshStandardMaterial({
      color: MARKER_GOLD,
      metalness: 0.14,
      roughness: 0.48,
    });
    group.add(createMarker(graph, graph.start, settings, goldMaterial));
    group.add(createMarker(graph, graph.end, settings, goldMaterial));
  }

  return group;
}

export function disposeMazeGroup(group: Group): void {
  group.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    object.geometry.dispose();
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => material.dispose());
    } else {
      object.material.dispose();
    }
  });
}
