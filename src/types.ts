export const DIRECTIONS = ['north', 'east', 'south', 'west'] as const;

export type Direction = (typeof DIRECTIONS)[number];

export type MazeAlgorithm = 'dfs' | 'prim' | 'kruskal' | 'division';

export type GridPoint = {
  x: number;
  y: number;
};

export type MazeSettings = {
  width: number;
  length: number;
  seed: number;
  algorithm: MazeAlgorithm;
  cellSize: number;
  wallThickness: number;
  wallHeight: number;
  levelCount: number;
  heightScale: number;
  elevationRoughness: number;
  maxHeightDelta: number;
  rampRatio: number;
  stairSteps: number;
  rampWidth: number;
  loopChance: number;
  corridorBias: number;
  frontierRandomness: number;
  kruskalVerticalBias: number;
  divisionOrientationBias: number;
  divisionMinRoomSize: number;
};

export type MazeCell = {
  x: number;
  y: number;
  elevation: number;
  links: Direction[];
};

export type MazeMetadata = {
  algorithm: MazeAlgorithm;
  cellCount: number;
  linkCount: number;
  minElevation: number;
  maxElevation: number;
};

export type MazeGraph = {
  width: number;
  length: number;
  cells: MazeCell[];
  start: GridPoint;
  end: GridPoint;
  settings: MazeSettings;
  metadata: MazeMetadata;
};

export type MazeRenderSettings = Pick<
  MazeSettings,
  'cellSize' | 'wallThickness' | 'wallHeight' | 'heightScale' | 'rampRatio' | 'rampWidth' | 'stairSteps'
> & {
  showMarkers: boolean;
};
