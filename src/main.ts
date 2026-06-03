import './style.css';
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  MOUSE,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  VSMShadowMap,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { exportMazeMeshToGlb, exportMazeMeshToObj, getMazeMeshFromGroup } from './core/exporters';
import { createMazeGroup, disposeMazeGroup } from './core/geometry';
import { DEFAULT_SETTINGS, generateMaze, normalizeSettings } from './core/maze';
import type { MazeAlgorithm, MazeGraph, MazeSettings } from './types';

type UiRefs = {
  panel: HTMLDivElement;
  handleTop: HTMLDivElement;
  handleBottom: HTMLDivElement;
  collapseToggle: HTMLButtonElement;
  width: HTMLInputElement;
  widthValue: HTMLSpanElement;
  length: HTMLInputElement;
  lengthValue: HTMLSpanElement;
  seed: HTMLInputElement;
  seedValue: HTMLSpanElement;
  algorithm: HTMLSelectElement;
  algorithmTrigger: HTMLButtonElement;
  algorithmMenu: HTMLUListElement;
  loopChance: HTMLInputElement;
  loopChanceValue: HTMLSpanElement;
  corridorBias: HTMLInputElement;
  corridorBiasValue: HTMLSpanElement;
  frontierRandomness: HTMLInputElement;
  frontierRandomnessValue: HTMLSpanElement;
  kruskalVerticalBias: HTMLInputElement;
  kruskalVerticalBiasValue: HTMLSpanElement;
  divisionOrientationBias: HTMLInputElement;
  divisionOrientationBiasValue: HTMLSpanElement;
  divisionMinRoomSize: HTMLInputElement;
  divisionMinRoomSizeValue: HTMLSpanElement;
  levelCount: HTMLInputElement;
  levelCountValue: HTMLSpanElement;
  heightScale: HTMLInputElement;
  heightScaleValue: HTMLSpanElement;
  elevationRoughness: HTMLInputElement;
  elevationRoughnessValue: HTMLSpanElement;
  wallHeight: HTMLInputElement;
  wallHeightValue: HTMLSpanElement;
  showMarkers: HTMLInputElement;
  showCheat: HTMLInputElement;
  exportObj: HTMLButtonElement;
  exportGlb: HTMLButtonElement;
  exportScreenshot: HTMLButtonElement;
};

const EXPORT_BASE_NAME = '260602_MazeTerrain';

function revealUiWhenStyled(maxWaitMs = 1500): void {
  const start = performance.now();
  const tryReveal = (): void => {
    const styled = getComputedStyle(document.documentElement).getPropertyValue('--ui-size-scale').trim().length > 0;
    if (styled || performance.now() - start >= maxWaitMs) {
      document.documentElement.classList.add('ui-ready');
      return;
    }
    requestAnimationFrame(tryReveal);
  };
  tryReveal();
}

function requiredElement<T extends Element>(id: string, check: (element: Element) => element is T): T {
  const element = document.getElementById(id);
  if (!element || !check(element)) {
    throw new Error(`Required element #${id} was not found or has an unexpected type.`);
  }
  return element;
}

function isInput(element: Element): element is HTMLInputElement {
  return element instanceof HTMLInputElement;
}

function isButton(element: Element): element is HTMLButtonElement {
  return element instanceof HTMLButtonElement;
}

function isDiv(element: Element): element is HTMLDivElement {
  return element instanceof HTMLDivElement;
}

function isSpan(element: Element): element is HTMLSpanElement {
  return element instanceof HTMLSpanElement;
}

function isUl(element: Element): element is HTMLUListElement {
  return element instanceof HTMLUListElement;
}

function isSelect(element: Element): element is HTMLSelectElement {
  return element instanceof HTMLSelectElement;
}

function updateRangeProgress(input: HTMLInputElement): void {
  const min = Number.parseFloat(input.min);
  const max = Number.parseFloat(input.max);
  const value = Number.parseFloat(input.value);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || !Number.isFinite(value)) {
    input.style.setProperty('--range-progress', '0%');
    return;
  }
  const progress = ((value - min) / (max - min)) * 100;
  input.style.setProperty('--range-progress', `${Math.min(100, Math.max(0, progress))}%`);
}

function stepDecimals(stepValue: string): number {
  if (!stepValue || stepValue === 'any') {
    return 6;
  }
  const decimal = stepValue.split('.')[1];
  return decimal ? decimal.length : 0;
}

function clampAndSnapInputValue(input: HTMLInputElement, value: number): number {
  const min = Number.parseFloat(input.min);
  const max = Number.parseFloat(input.max);
  const step = Number.parseFloat(input.step);
  let next = value;
  if (Number.isFinite(min)) {
    next = Math.max(min, next);
  }
  if (Number.isFinite(max)) {
    next = Math.min(max, next);
  }
  if (Number.isFinite(step) && step > 0) {
    const base = Number.isFinite(min) ? min : 0;
    next = base + Math.round((next - base) / step) * step;
  }
  if (Number.isFinite(min)) {
    next = Math.max(min, next);
  }
  if (Number.isFinite(max)) {
    next = Math.min(max, next);
  }
  return next;
}

function setRangeValue(input: HTMLInputElement, valueLabel: HTMLSpanElement, value: number, format: (value: number) => string): void {
  const snapped = clampAndSnapInputValue(input, value);
  input.value = snapped.toFixed(stepDecimals(input.step));
  valueLabel.textContent = format(snapped);
  updateRangeProgress(input);
}

function bindRange(
  input: HTMLInputElement,
  valueLabel: HTMLSpanElement,
  format: (value: number) => string,
  onInput: (value: number) => void,
): void {
  const commitManualValue = (rawValue: string): void => {
    const parsed = Number.parseFloat(rawValue);
    if (!Number.isFinite(parsed)) {
      setRangeValue(input, valueLabel, Number.parseFloat(input.value), format);
      return;
    }
    const next = clampAndSnapInputValue(input, parsed);
    input.value = next.toFixed(stepDecimals(input.step));
    setRangeValue(input, valueLabel, next, format);
    onInput(next);
  };

  let isManualEditing = false;
  const beginManualEdit = (): void => {
    if (isManualEditing) {
      return;
    }
    isManualEditing = true;

    const editor = document.createElement('input');
    editor.type = 'number';
    editor.className = 'value-editor';
    editor.value = input.value;
    editor.min = input.min;
    editor.max = input.max;
    editor.step = input.step;
    valueLabel.replaceWith(editor);
    editor.focus();
    editor.select();

    let finalized = false;
    const finish = (commit: boolean): void => {
      if (finalized) {
        return;
      }
      finalized = true;
      const submitted = editor.value;
      editor.replaceWith(valueLabel);
      isManualEditing = false;
      if (commit) {
        commitManualValue(submitted);
      } else {
        setRangeValue(input, valueLabel, Number.parseFloat(input.value), format);
      }
    };

    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    editor.addEventListener('blur', () => {
      finish(true);
    });
  };

  valueLabel.addEventListener('click', (event) => {
    event.stopPropagation();
    beginManualEdit();
  });

  input.addEventListener('input', () => {
    const value = Number.parseFloat(input.value);
    valueLabel.textContent = format(value);
    updateRangeProgress(input);
    onInput(value);
  });
  setRangeValue(input, valueLabel, Number.parseFloat(input.value), format);
}

function formatFixed(decimals: number): (value: number) => string {
  return (value: number) => value.toFixed(decimals);
}

function formatInteger(value: number): string {
  return `${Math.round(value)}`;
}

const queriedCanvas = document.querySelector<HTMLCanvasElement>('#app-canvas');
if (!queriedCanvas) {
  throw new Error('Required canvas #app-canvas was not found.');
}
const appCanvas: HTMLCanvasElement = queriedCanvas;

const ui: UiRefs = {
  panel: requiredElement('ui-panel', isDiv),
  handleTop: requiredElement('ui-handle', isDiv),
  handleBottom: requiredElement('ui-handle-bottom', isDiv),
  collapseToggle: requiredElement('collapse-toggle', isButton),
  width: requiredElement('maze-width', isInput),
  widthValue: requiredElement('maze-width-value', isSpan),
  length: requiredElement('maze-length', isInput),
  lengthValue: requiredElement('maze-length-value', isSpan),
  seed: requiredElement('maze-seed', isInput),
  seedValue: requiredElement('maze-seed-value', isSpan),
  algorithm: requiredElement('maze-algorithm', isSelect),
  algorithmTrigger: requiredElement('maze-algorithm-trigger', isButton),
  algorithmMenu: requiredElement('maze-algorithm-menu', isUl),
  loopChance: requiredElement('loop-chance', isInput),
  loopChanceValue: requiredElement('loop-chance-value', isSpan),
  corridorBias: requiredElement('corridor-bias', isInput),
  corridorBiasValue: requiredElement('corridor-bias-value', isSpan),
  frontierRandomness: requiredElement('frontier-randomness', isInput),
  frontierRandomnessValue: requiredElement('frontier-randomness-value', isSpan),
  kruskalVerticalBias: requiredElement('kruskal-vertical-bias', isInput),
  kruskalVerticalBiasValue: requiredElement('kruskal-vertical-bias-value', isSpan),
  divisionOrientationBias: requiredElement('division-orientation-bias', isInput),
  divisionOrientationBiasValue: requiredElement('division-orientation-bias-value', isSpan),
  divisionMinRoomSize: requiredElement('division-min-room-size', isInput),
  divisionMinRoomSizeValue: requiredElement('division-min-room-size-value', isSpan),
  levelCount: requiredElement('level-count', isInput),
  levelCountValue: requiredElement('level-count-value', isSpan),
  heightScale: requiredElement('height-scale', isInput),
  heightScaleValue: requiredElement('height-scale-value', isSpan),
  elevationRoughness: requiredElement('elevation-roughness', isInput),
  elevationRoughnessValue: requiredElement('elevation-roughness-value', isSpan),
  wallHeight: requiredElement('wall-height', isInput),
  wallHeightValue: requiredElement('wall-height-value', isSpan),
  showMarkers: requiredElement('show-markers', isInput),
  showCheat: requiredElement('show-cheat', isInput),
  exportObj: requiredElement('export-obj', isButton),
  exportGlb: requiredElement('export-glb', isButton),
  exportScreenshot: requiredElement('export-screenshot', isButton),
};

revealUiWhenStyled();

let settings: MazeSettings = normalizeSettings({
  ...DEFAULT_SETTINGS,
  width: Number.parseInt(ui.width.value, 10),
  length: Number.parseInt(ui.length.value, 10),
  seed: Number.parseInt(ui.seed.value, 10),
  algorithm: ui.algorithm.value as MazeAlgorithm,
});
let showMarkers = ui.showMarkers.checked;
let showCheat = ui.showCheat.checked;
let scene: Scene;
let camera: PerspectiveCamera;
let renderer: WebGLRenderer;
let controls: OrbitControls;
let keyLight: DirectionalLight;
let fillLight: DirectionalLight;
let rimLight: DirectionalLight;
let graph: MazeGraph;
let mazeGroup: Group;
let fileExportCount = 0;
let draggingPanel = false;
const dragOffset = { x: 0, y: 0 };

function getRenderSettings() {
  return {
    cellSize: settings.cellSize,
    wallThickness: settings.wallThickness,
    wallHeight: settings.wallHeight,
    heightScale: settings.heightScale,
    showMarkers,
    showCheat,
  };
}

function syncAlgorithmControls(): void {
  document.querySelectorAll<HTMLElement>('[data-algorithm-control]').forEach((element) => {
    element.hidden = element.dataset.algorithmControl !== settings.algorithm;
  });
}

function isMazeAlgorithm(value: string): value is MazeAlgorithm {
  return value === 'dfs' || value === 'prim' || value === 'kruskal' || value === 'division';
}

function setAlgorithmSelection(algorithm: MazeAlgorithm): void {
  const option = Array.from(ui.algorithm.options).find((candidate) => candidate.value === algorithm);
  ui.algorithm.value = algorithm;
  ui.algorithmTrigger.textContent = option?.textContent ?? algorithm;
  ui.algorithmMenu.querySelectorAll<HTMLButtonElement>('.select-option').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.algorithm === algorithm);
  });
}

function openAlgorithmMenu(): void {
  ui.algorithmMenu.hidden = false;
  ui.algorithmTrigger.closest('.select-control')?.classList.add('is-open');
}

function closeAlgorithmMenu(): void {
  ui.algorithmMenu.hidden = true;
  ui.algorithmTrigger.closest('.select-control')?.classList.remove('is-open');
}

function toggleAlgorithmMenu(): void {
  if (ui.algorithmMenu.hidden) {
    openAlgorithmMenu();
  } else {
    closeAlgorithmMenu();
  }
}

function applyAlgorithmSelection(value: string): void {
  if (!isMazeAlgorithm(value)) {
    return;
  }
  if (value === settings.algorithm) {
    setAlgorithmSelection(value);
    closeAlgorithmMenu();
    return;
  }
  settings = normalizeSettings({ ...settings, algorithm: value });
  setAlgorithmSelection(settings.algorithm);
  syncAlgorithmControls();
  rebuildMaze();
  closeAlgorithmMenu();
}

function bindAlgorithmSelect(): void {
  ui.algorithmMenu.replaceChildren();
  Array.from(ui.algorithm.options).forEach((option) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'select-option';
    button.dataset.algorithm = option.value;
    button.textContent = option.textContent;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      applyAlgorithmSelection(option.value);
    });
    item.append(button);
    ui.algorithmMenu.append(item);
  });

  ui.algorithmTrigger.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleAlgorithmMenu();
  });
  ui.algorithm.addEventListener('change', () => {
    applyAlgorithmSelection(ui.algorithm.value);
  });
  window.addEventListener('click', closeAlgorithmMenu);
  setAlgorithmSelection(settings.algorithm);
}

function syncStudioLighting(): void {
  if (!keyLight || !fillLight || !rimLight) {
    return;
  }
  const footprint = Math.max(settings.width, settings.length) * settings.cellSize;
  const height = Math.max(1, graph.metadata.maxElevation * settings.heightScale + settings.wallHeight + 1);
  const shadowExtent = Math.max(footprint * 0.78, height * 2.2, 12);

  keyLight.position.set(-footprint * 0.48, height + footprint * 0.85, footprint * 0.56);
  keyLight.target.position.set(0, height * 0.28, 0);
  keyLight.target.updateMatrixWorld();

  const shadowCamera = keyLight.shadow.camera;
  shadowCamera.left = -shadowExtent;
  shadowCamera.right = shadowExtent;
  shadowCamera.top = shadowExtent;
  shadowCamera.bottom = -shadowExtent;
  shadowCamera.near = 0.1;
  shadowCamera.far = Math.max(shadowExtent * 4, 80);
  shadowCamera.updateProjectionMatrix();
  keyLight.shadow.needsUpdate = true;

  fillLight.position.set(footprint * 0.72, height + footprint * 0.35, -footprint * 0.62);
  rimLight.position.set(footprint * 0.15, height + footprint * 0.6, -footprint * 0.9);
}

function frameCamera(): void {
  const footprint = Math.max(settings.width, settings.length) * settings.cellSize;
  const height = Math.max(1, graph.metadata.maxElevation * settings.heightScale + settings.wallHeight);
  camera.position.set(footprint * 0.68, footprint * 0.82 + height, footprint * 0.78);
  camera.near = 0.01;
  camera.far = Math.max(5000, footprint * 100);
  camera.updateProjectionMatrix();
  controls.target.set(0, height * 0.32, 0);
  controls.update();
}

function rebuildMaze(): void {
  graph = generateMaze(settings);
  if (mazeGroup) {
    scene.remove(mazeGroup);
    disposeMazeGroup(mazeGroup);
  }
  mazeGroup = createMazeGroup(graph, getRenderSettings());
  scene.add(mazeGroup);
  syncStudioLighting();
}

function nextExportName(extension: 'glb' | 'obj' | 'png'): string {
  fileExportCount += 1;
  const serial = String(fileExportCount).padStart(3, '0');
  return `${EXPORT_BASE_NAME}_${serial}.${extension}`;
}

function exportObj(): void {
  const mesh = getMazeMeshFromGroup(mazeGroup);
  if (!mesh) {
    return;
  }
  const contents = exportMazeMeshToObj(mesh);
  downloadBlob(new Blob([contents], { type: 'text/plain;charset=utf-8' }), nextExportName('obj'));
}

async function exportGlb(): Promise<void> {
  const mesh = getMazeMeshFromGroup(mazeGroup);
  if (!mesh) {
    return;
  }
  ui.exportGlb.disabled = true;
  try {
    const result = await exportMazeMeshToGlb(mesh);
    downloadBlob(new Blob([result], { type: 'model/gltf-binary' }), nextExportName('glb'));
  } catch (error) {
    console.error('Failed to export GLB.', error);
  } finally {
    ui.exportGlb.disabled = false;
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportScreenshot(): void {
  renderer.render(scene, camera);
  appCanvas.toBlob((blob) => {
    if (!blob) {
      return;
    }
    downloadBlob(blob, nextExportName('png'));
  }, 'image/png');
}

function clampPanelToViewport(): void {
  if (window.innerWidth <= 700) {
    ui.panel.style.left = '';
    ui.panel.style.top = '';
    return;
  }

  const panelRect = ui.panel.getBoundingClientRect();
  const width = panelRect.width;
  const height = panelRect.height;
  const maxLeft = Math.max(12, window.innerWidth - width - 12);
  const maxTop = Math.max(12, window.innerHeight - height - 12);
  ui.panel.style.left = `${Math.min(maxLeft, Math.max(12, panelRect.left))}px`;
  ui.panel.style.top = `${Math.min(maxTop, Math.max(12, panelRect.top))}px`;
  ui.panel.style.right = 'auto';
  ui.panel.style.bottom = 'auto';
}

function bindPanelDrag(): void {
  const beginPanelDrag = (event: PointerEvent): void => {
    if (event.target instanceof Element && event.target.closest('.collapse-button')) {
      return;
    }
    draggingPanel = true;
    const rect = ui.panel.getBoundingClientRect();
    ui.panel.style.left = `${rect.left}px`;
    ui.panel.style.top = `${rect.top}px`;
    ui.panel.style.right = 'auto';
    ui.panel.style.bottom = 'auto';
    dragOffset.x = event.clientX - rect.left;
    dragOffset.y = event.clientY - rect.top;
  };

  ui.handleTop.addEventListener('pointerdown', beginPanelDrag);
  ui.handleBottom.addEventListener('pointerdown', beginPanelDrag);
  window.addEventListener('pointermove', (event) => {
    if (!draggingPanel) {
      return;
    }
    ui.panel.style.left = `${event.clientX - dragOffset.x}px`;
    ui.panel.style.top = `${event.clientY - dragOffset.y}px`;
    clampPanelToViewport();
  });
  window.addEventListener('pointerup', () => {
    draggingPanel = false;
  });
  window.addEventListener('pointercancel', () => {
    draggingPanel = false;
  });
}

function bindSectionCollapseToggles(): void {
  document.querySelectorAll<HTMLElement>('.panel-section-header').forEach((header) => {
    const section = header.closest('.panel-section');
    if (!section) {
      return;
    }
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', section.classList.contains('is-collapsed') ? 'false' : 'true');

    const toggle = (): void => {
      const collapsed = section.classList.toggle('is-collapsed');
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    };

    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle();
      }
    });
  });
}

function bindControls(): void {
  bindRange(ui.width, ui.widthValue, formatInteger, (value) => {
    settings = normalizeSettings({ ...settings, width: Math.round(value) });
    rebuildMaze();
  });
  bindRange(ui.length, ui.lengthValue, formatInteger, (value) => {
    settings = normalizeSettings({ ...settings, length: Math.round(value) });
    rebuildMaze();
  });
  bindRange(ui.seed, ui.seedValue, formatInteger, (value) => {
    settings = normalizeSettings({ ...settings, seed: Math.round(value) });
    rebuildMaze();
  });
  bindRange(ui.loopChance, ui.loopChanceValue, formatFixed(2), (value) => {
    settings = normalizeSettings({ ...settings, loopChance: value });
    rebuildMaze();
  });
  bindRange(ui.corridorBias, ui.corridorBiasValue, formatFixed(2), (value) => {
    settings = normalizeSettings({ ...settings, corridorBias: value });
    rebuildMaze();
  });
  bindRange(ui.frontierRandomness, ui.frontierRandomnessValue, formatFixed(2), (value) => {
    settings = normalizeSettings({ ...settings, frontierRandomness: value });
    rebuildMaze();
  });
  bindRange(ui.kruskalVerticalBias, ui.kruskalVerticalBiasValue, formatFixed(2), (value) => {
    settings = normalizeSettings({ ...settings, kruskalVerticalBias: value });
    rebuildMaze();
  });
  bindRange(ui.divisionOrientationBias, ui.divisionOrientationBiasValue, formatFixed(2), (value) => {
    settings = normalizeSettings({ ...settings, divisionOrientationBias: value });
    rebuildMaze();
  });
  bindRange(ui.divisionMinRoomSize, ui.divisionMinRoomSizeValue, formatInteger, (value) => {
    settings = normalizeSettings({ ...settings, divisionMinRoomSize: Math.round(value) });
    rebuildMaze();
  });
  bindRange(ui.levelCount, ui.levelCountValue, formatInteger, (value) => {
    settings = normalizeSettings({ ...settings, levelCount: Math.round(value) });
    rebuildMaze();
  });
  bindRange(ui.heightScale, ui.heightScaleValue, formatFixed(2), (value) => {
    settings = normalizeSettings({ ...settings, heightScale: value });
    rebuildMaze();
  });
  bindRange(ui.elevationRoughness, ui.elevationRoughnessValue, formatFixed(2), (value) => {
    settings = normalizeSettings({ ...settings, elevationRoughness: value });
    rebuildMaze();
  });
  bindRange(ui.wallHeight, ui.wallHeightValue, formatFixed(2), (value) => {
    settings = normalizeSettings({ ...settings, wallHeight: value });
    rebuildMaze();
  });

  bindAlgorithmSelect();
  ui.showMarkers.addEventListener('change', () => {
    showMarkers = ui.showMarkers.checked;
    rebuildMaze();
  });
  ui.showCheat.addEventListener('change', () => {
    showCheat = ui.showCheat.checked;
    rebuildMaze();
  });
  ui.exportObj.addEventListener('click', exportObj);
  ui.exportGlb.addEventListener('click', () => {
    void exportGlb();
  });
  ui.exportScreenshot.addEventListener('click', exportScreenshot);
  ui.collapseToggle.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });
  ui.collapseToggle.addEventListener('click', () => {
    const collapsed = ui.panel.classList.toggle('is-collapsed');
    ui.collapseToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });
}

function handleResize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio * 1.25, 2.5));
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  clampPanelToViewport();
}

function addStudioLighting(): void {
  const skyFill = new HemisphereLight(0xffffff, 0x151515, 1.35);
  scene.add(skyFill);

  keyLight = new DirectionalLight(0xffffff, 3.2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.00018;
  keyLight.shadow.normalBias = 0.035;
  keyLight.shadow.blurSamples = 8;
  scene.add(keyLight.target, keyLight);

  fillLight = new DirectionalLight(0xb7caff, 0.62);
  scene.add(fillLight);

  rimLight = new DirectionalLight(0xffe0b0, 1.1);
  scene.add(rimLight);
}

function initApp(): void {
  scene = new Scene();
  scene.background = new Color(0x000000);

  camera = new PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.01, 1000);
  renderer = new WebGLRenderer({ antialias: true, canvas: appCanvas, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio * 1.25, 2.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = VSMShadowMap;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.maxDistance = 1600;
  controls.minDistance = 2;
  controls.minPolarAngle = 0.02;
  controls.maxPolarAngle = Math.PI - 0.02;
  controls.mouseButtons = {
    LEFT: -1 as unknown as MOUSE,
    MIDDLE: MOUSE.PAN,
    RIGHT: MOUSE.ROTATE,
  };

  renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('contextmenu', (event) => event.preventDefault());

  addStudioLighting();
  graph = generateMaze(settings);
  mazeGroup = createMazeGroup(graph, getRenderSettings());
  scene.add(mazeGroup);

  bindSectionCollapseToggles();
  bindPanelDrag();
  bindControls();
  syncAlgorithmControls();
  syncStudioLighting();
  frameCamera();
  handleResize();
  window.addEventListener('resize', handleResize);

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
}

initApp();
