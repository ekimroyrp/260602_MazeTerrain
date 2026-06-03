# 260602_MazeTerrain

260602_MazeTerrain is a Vite + TypeScript + Three.js maze terrain generator that builds connected 2.5D grid mazes with seeded elevation. The scene renders a white and gray studio-lit maze on a black background, with thick floor slabs, automatic stairs for height transitions, configurable maze algorithms, display colors, start/end indicators, a red solve path, and OBJ/GLB mesh export with vertex colors.

## Features
- Vite + TypeScript + Three.js scaffold with `WebGLRenderer`, `PerspectiveCamera`, `OrbitControls`, ACES tone mapping, studio lights, and soft shadows.
- Seeded maze generation with DFS backtracker, Prim, Kruskal, and recursive division maze types.
- Terrain elevation is generated from seeded roughness controls, then linked paths stay solvable through automatic stair transitions.
- Thick floor slabs, wall meshes, stair geometry, perimeter sides, and material groups for floor, stair, and wall colors.
- WoolyPaths-style draggable glass control panel with collapsible sections, sliders, value chips, toggles, stacked color pickers, and export actions.
- Display controls update floor, stair, and wall colors live without rebuilding the maze.
- Ends toggle shows or hides gold start/end indicators, and Cheat draws a red 3D solution path that follows flat paths and stair heights.
- Export section saves screenshots or exports the maze-only mesh as OBJ or GLB with vertex colors, excluding Ends and Cheat helpers.
- Camera controls support extended zoom, middle-mouse pan, right-mouse orbit, and orbiting below the maze.

## Getting Started
1. `npm install`
2. `npm run dev` to start Vite on the printed local URL
3. `npm test` to run the Vitest maze and geometry checks
4. `npm run build` to type-check and emit a production build
5. `npm run preview` to inspect the compiled bundle locally

## Controls
- **Maze Type** selects DFS Backtracker, Prim, Kruskal, or Recursive Division, with matching algorithm-specific controls shown underneath.
- **Seed** rebuilds deterministic maze layouts while keeping the same settings.
- **Loop Chance / Corridor Bias / Frontier Randomness / Orientation Bias / Min Room Size** tune the selected maze algorithm.
- **Ends** toggles the gold start/end indicators.
- **Cheat** toggles the red start-to-end solve path in 3D.
- **Extents** controls Width, Length, and Wall Height.
- **Terrain** controls Levels, Height Scale, and Elevation Roughness.
- **Display** controls Floor Color, Stair Color, and Wall Color without regenerating the maze.
- **Export** saves OBJ, GLB, or PNG screenshot outputs; OBJ and GLB include mesh vertex colors and omit helper indicators.
- **Mouse:** scroll to zoom, middle mouse to pan, and right mouse to orbit above or below the maze.

## Deployment
- **Local production preview:** `npm install`, then `npm run build` followed by `npm run preview` to inspect the compiled bundle.
- **Publish to GitHub Pages:** From a clean `main`, run `npm run build -- --base=./`. Checkout (or create) the `gh-pages` branch in a separate worktree or temp folder, copy everything inside `dist/` to its root, add `.nojekyll`, `.gitignore`, and an `env/` folder if needed, commit with a descriptive message, `git push origin gh-pages`, then switch back to `main`.
- **Live demo:** https://ekimroyrp.github.io/260602_MazeTerrain/
