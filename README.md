# 260602_MazeTerrain

260602_MazeTerrain is an interactive Three.js maze terrain generator. It builds connected grid mazes with multiple algorithm styles, applies seeded elevation so the maze rises and falls like a blocky hilly terrain, and renders the result as a white studio-lit mesh with stairs and ramps on a black background.

## Features

- Vite, TypeScript, and Three.js app scaffold.
- 2.5D maze generation with DFS backtracker, Prim, Kruskal, and recursive division algorithms.
- Seeded width, length, loop chance, terrain levels, roughness, height scale, wall, stair, and ramp controls.
- Draggable collapsible control panel based on the WoolyPaths UI style.
- Studio lighting, soft shadows, unrestricted orbit camera controls, optional start/end markers, red solution-path overlay, and screenshot export.

## Getting Started

1. Install dependencies with `npm install`.
2. Start the local dev server with `npm run dev`.
3. Open the printed local URL in a browser.
4. Build a production copy with `npm run build`.
5. Run unit tests with `npm test`.

## Controls

- Mouse wheel zooms the camera with an extended zoom-out range.
- Middle mouse pans the camera.
- Right mouse orbits the camera above or below the maze.
- Use the Generate and Random Seed buttons to rebuild the maze.
- Changing settings rebuilds the maze without resetting the current camera view.
- Adjust algorithm, terrain, transition, and render sliders from the control panel.
- Toggle Cheat to draw a red 3D start-to-end solution path that follows flat paths, ramps, and stair heights.
- Use Screenshot to export the current canvas.
