import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Direction, GridPoint, MazeCell, MazeGraph, MazeRenderSettings } from '../types';
import { getCell, getDirectionDelta } from './maze';

const FOUNDATION_THICKNESS = 0.28;
const CONNECTOR_THICKNESS = 0.12;
const RAMP_THICKNESS = 0.08;
const PLATFORM_SIZE_RATIO = 0.88;
const PLATFORM_SLAB_THICKNESS = 0.16;
const TRANSITION_SURFACE_LIFT = 0.006;
const MARKER_GOLD = 0xd8aa2f;
const MARKER_AMBER = 0xf0c748;
const MAZE_WHITE = 0xe9e9e3;

type WorldCell = {
  x: number;
  z: number;
  top: number;
};

type TransitionSpan = {
  start: Vector3;
  end: Vector3;
  axis: Vector3;
  length: number;
};

type SideSegment = {
  from: number;
  to: number;
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
  start: Vector3,
  end: Vector3,
  startTop: number,
  endTop: number,
  width: number,
): BufferGeometry {
  const startVector = start.clone();
  const endVector = end.clone();
  const axis = endVector.clone().sub(startVector).normalize();
  const side = new Vector3(-axis.z, 0, axis.x).multiplyScalar(width * 0.5);
  const liftedStartTop = startTop + TRANSITION_SURFACE_LIFT;
  const liftedEndTop = endTop + TRANSITION_SURFACE_LIFT;
  const bottomStart = Math.max(0.02, liftedStartTop - RAMP_THICKNESS);
  const bottomEnd = Math.max(0.02, liftedEndTop - RAMP_THICKNESS);

  const topStartLeft = startVector.clone().add(side).setY(liftedStartTop);
  const topStartRight = startVector.clone().sub(side).setY(liftedStartTop);
  const topEndLeft = endVector.clone().add(side).setY(liftedEndTop);
  const topEndRight = endVector.clone().sub(side).setY(liftedEndTop);
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

function getPlatformSize(settings: MazeRenderSettings): number {
  return settings.cellSize * PLATFORM_SIZE_RATIO;
}

function getOpeningHalfWidth(settings: MazeRenderSettings): number {
  const platformHalf = getPlatformSize(settings) * 0.5;
  const pathHalf = settings.cellSize * settings.rampWidth * 0.5;
  return Math.min(platformHalf, pathHalf + settings.wallThickness * 0.7);
}

function getSideSegments(cell: MazeCell, direction: Direction, settings: MazeRenderSettings): SideSegment[] {
  const platformHalf = getPlatformSize(settings) * 0.5;
  if (!hasLinkedDirection(cell, direction)) {
    return [{ from: -platformHalf, to: platformHalf }];
  }

  const openingHalf = getOpeningHalfWidth(settings);
  const segments: SideSegment[] = [];
  if (openingHalf > -platformHalf) {
    segments.push({ from: -platformHalf, to: -openingHalf });
  }
  if (openingHalf < platformHalf) {
    segments.push({ from: openingHalf, to: platformHalf });
  }
  return segments.filter((segment) => segment.to - segment.from > 1e-5);
}

function getSlabBottom(top: number): number {
  return Math.max(0, top - PLATFORM_SLAB_THICKNESS);
}

function getTransitionOverlap(settings: MazeRenderSettings): number {
  const platformHalf = getPlatformSize(settings) * 0.5;
  return Math.min(platformHalf * 0.45, Math.max(settings.cellSize * 0.16, settings.wallThickness * 1.6));
}

function getTransitionSpan(from: WorldCell, to: WorldCell, settings: MazeRenderSettings, setback = 0): TransitionSpan {
  const fromCenter = new Vector3(from.x, 0, from.z);
  const toCenter = new Vector3(to.x, 0, to.z);
  const centerDelta = toCenter.clone().sub(fromCenter);
  const centerDistance = Math.max(centerDelta.length(), 1e-6);
  const axis = centerDelta.clone().divideScalar(centerDistance);
  const platformHalf = getPlatformSize(settings) * 0.5;
  const overlap = getTransitionOverlap(settings);
  const inset = Math.max(0, platformHalf - overlap);
  const clampedSetback = Math.min(setback, inset);
  const start = fromCenter.clone().add(axis.clone().multiplyScalar(inset - clampedSetback));
  const end = toCenter.clone().sub(axis.clone().multiplyScalar(inset + clampedSetback));
  return {
    start,
    end,
    axis,
    length: Math.max(start.distanceTo(end), settings.cellSize * 0.12),
  };
}

function getHeightTransitionSpan(from: WorldCell, to: WorldCell, settings: MazeRenderSettings): TransitionSpan {
  return getTransitionSpan(from, to, settings, getTransitionOverlap(settings));
}

function hasLinkedDirection(cell: MazeCell, direction: Direction): boolean {
  return cell.links.includes(direction);
}

function addPlatformGeometry(geometries: BufferGeometry[], graph: MazeGraph, cell: MazeCell, settings: MazeRenderSettings): void {
  const world = getWorldCell(graph, cell, settings);
  const platformSize = getPlatformSize(settings);
  const half = platformSize * 0.5;
  const xMin = world.x - half;
  const xMax = world.x + half;
  const zMin = world.z - half;
  const zMax = world.z + half;
  const positions: number[] = [];
  const slabBottom = getSlabBottom(world.top);
  const openingHalf = getOpeningHalfWidth(settings);

  pushFace(
    positions,
    new Vector3(xMin, world.top, zMin),
    new Vector3(xMin, world.top, zMax),
    new Vector3(xMax, world.top, zMax),
    new Vector3(xMax, world.top, zMin),
  );
  pushFace(
    positions,
    new Vector3(xMin, slabBottom, zMin),
    new Vector3(xMax, slabBottom, zMin),
    new Vector3(xMax, slabBottom, zMax),
    new Vector3(xMin, slabBottom, zMax),
  );
  pushFace(positions, new Vector3(xMin, 0, zMin), new Vector3(xMax, 0, zMin), new Vector3(xMax, 0, zMax), new Vector3(xMin, 0, zMax));

  for (const segment of getSideSegments(cell, 'north', settings)) {
    pushFace(
      positions,
      new Vector3(world.x + segment.from, 0, zMin),
      new Vector3(world.x + segment.from, world.top, zMin),
      new Vector3(world.x + segment.to, world.top, zMin),
      new Vector3(world.x + segment.to, 0, zMin),
    );
  }
  if (hasLinkedDirection(cell, 'north')) {
    pushFace(
      positions,
      new Vector3(world.x - openingHalf, slabBottom, zMin),
      new Vector3(world.x - openingHalf, world.top, zMin),
      new Vector3(world.x + openingHalf, world.top, zMin),
      new Vector3(world.x + openingHalf, slabBottom, zMin),
    );
  }
  for (const segment of getSideSegments(cell, 'south', settings)) {
    pushFace(
      positions,
      new Vector3(world.x + segment.from, 0, zMax),
      new Vector3(world.x + segment.to, 0, zMax),
      new Vector3(world.x + segment.to, world.top, zMax),
      new Vector3(world.x + segment.from, world.top, zMax),
    );
  }
  if (hasLinkedDirection(cell, 'south')) {
    pushFace(
      positions,
      new Vector3(world.x - openingHalf, slabBottom, zMax),
      new Vector3(world.x + openingHalf, slabBottom, zMax),
      new Vector3(world.x + openingHalf, world.top, zMax),
      new Vector3(world.x - openingHalf, world.top, zMax),
    );
  }
  for (const segment of getSideSegments(cell, 'west', settings)) {
    pushFace(
      positions,
      new Vector3(xMin, 0, world.z + segment.from),
      new Vector3(xMin, 0, world.z + segment.to),
      new Vector3(xMin, world.top, world.z + segment.to),
      new Vector3(xMin, world.top, world.z + segment.from),
    );
  }
  if (hasLinkedDirection(cell, 'west')) {
    pushFace(
      positions,
      new Vector3(xMin, slabBottom, world.z - openingHalf),
      new Vector3(xMin, slabBottom, world.z + openingHalf),
      new Vector3(xMin, world.top, world.z + openingHalf),
      new Vector3(xMin, world.top, world.z - openingHalf),
    );
  }
  for (const segment of getSideSegments(cell, 'east', settings)) {
    pushFace(
      positions,
      new Vector3(xMax, 0, world.z + segment.from),
      new Vector3(xMax, world.top, world.z + segment.from),
      new Vector3(xMax, world.top, world.z + segment.to),
      new Vector3(xMax, 0, world.z + segment.to),
    );
  }
  if (hasLinkedDirection(cell, 'east')) {
    pushFace(
      positions,
      new Vector3(xMax, slabBottom, world.z - openingHalf),
      new Vector3(xMax, world.top, world.z - openingHalf),
      new Vector3(xMax, world.top, world.z + openingHalf),
      new Vector3(xMax, slabBottom, world.z + openingHalf),
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometries.push(geometry);
}

function addWallGeometry(geometries: BufferGeometry[], graph: MazeGraph, cell: MazeCell, settings: MazeRenderSettings): void {
  const world = getWorldCell(graph, cell, settings);
  const platformSize = getPlatformSize(settings);
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
  const span = getTransitionSpan(a, b, settings);
  const connectorLength = span.length;
  const pathWidth = settings.cellSize * settings.rampWidth;
  const center = span.start.clone().add(span.end).multiplyScalar(0.5);
  const y = a.top + TRANSITION_SURFACE_LIFT - CONNECTOR_THICKNESS * 0.5;
  if (direction === 'east') {
    geometries.push(createBox(connectorLength, CONNECTOR_THICKNESS, pathWidth, center.x, y, center.z));
  } else {
    geometries.push(createBox(pathWidth, CONNECTOR_THICKNESS, connectorLength, center.x, y, center.z));
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
  const span = getHeightTransitionSpan(low, high, settings);
  const pathWidth = settings.cellSize * settings.rampWidth;
  const stepLength = (span.length / steps) * 1.04;
  const horizontal = Math.abs(span.axis.x) >= Math.abs(span.axis.z);

  for (let index = 0; index < steps; index += 1) {
    const positionRatio = (index + 0.5) / steps;
    const heightRatio = steps === 1 ? 1 : index / (steps - 1);
    const top = low.top + (high.top - low.top) * heightRatio + TRANSITION_SURFACE_LIFT;
    const position = span.start.clone().lerp(span.end, positionRatio);
    if (horizontal || direction === 'east' || direction === 'west') {
      geometries.push(createBox(stepLength, top, pathWidth, position.x, top * 0.5, position.z));
    } else {
      geometries.push(createBox(pathWidth, top, stepLength, position.x, top * 0.5, position.z));
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
    const span = getHeightTransitionSpan(low, high, settings);
    geometries.push(
      createRamp(
        span.start,
        span.end,
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

function createMarker(
  graph: MazeGraph,
  point: GridPoint,
  settings: MazeRenderSettings,
  markerMaterial: MeshStandardMaterial,
  kind: 'start' | 'end',
): Group {
  const cell = getCell(graph, point.x, point.y);
  const group = new Group();
  group.name = `${kind}-marker`;
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

  const markerGeometry =
    kind === 'start'
      ? new CylinderGeometry(settings.cellSize * 0.11, settings.cellSize * 0.14, settings.cellSize * 0.38, 5)
      : new ConeGeometry(settings.cellSize * 0.15, settings.cellSize * 0.52, 5);
  const marker = new Mesh(markerGeometry, markerMaterial);
  marker.name = `${kind}-marker-form`;
  marker.position.set(world.x, world.top + (kind === 'start' ? settings.cellSize * 0.23 : settings.cellSize * 0.29), world.z);
  marker.rotation.y = kind === 'start' ? Math.PI * 0.25 : Math.PI * 0.55 + (point.x + point.y) * 0.12;
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

  if (settings.showMarkers) {
    const startMaterial = new MeshStandardMaterial({
      color: MARKER_AMBER,
      metalness: 0.12,
      roughness: 0.5,
    });
    const endMaterial = new MeshStandardMaterial({
      color: MARKER_GOLD,
      metalness: 0.14,
      roughness: 0.48,
    });
    group.add(createMarker(graph, graph.start, settings, startMaterial, 'start'));
    group.add(createMarker(graph, graph.end, settings, endMaterial, 'end'));
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
