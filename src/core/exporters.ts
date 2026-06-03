import {
  BufferAttribute,
  Color,
  ColorManagement,
  Group,
  Matrix3,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Material } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const EXPORT_MESH_NAME = '260602_MazeTerrain_maze_mesh';
const EXPORT_VERTEX_COLOR_MATERIAL_NAME = '260602_MazeTerrain_vertex_colors';

export function getMazeMeshFromGroup(group: Group): Mesh | null {
  const object = group.getObjectByName('maze-mesh');
  return object instanceof Mesh ? object : null;
}

function hasColor(material: Material): material is MeshStandardMaterial {
  return 'color' in material && material.color instanceof Color;
}

function getMaterialColor(mesh: Mesh, materialIndex: number): Color {
  const material = Array.isArray(mesh.material) ? mesh.material[materialIndex] : mesh.material;
  return material && hasColor(material) ? material.color : new Color(0xffffff);
}

function addVertexColorsFromMaterials(mesh: Mesh): BufferAttribute {
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const colors = new Float32Array(positions.count * 3);
  const fallback = getMaterialColor(mesh, 0);

  for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex += 1) {
    colors[vertexIndex * 3] = fallback.r;
    colors[vertexIndex * 3 + 1] = fallback.g;
    colors[vertexIndex * 3 + 2] = fallback.b;
  }

  for (const group of geometry.groups) {
    const color = getMaterialColor(mesh, group.materialIndex ?? 0);
    const start = group.start ?? 0;
    const count = group.count ?? (index ? index.count : positions.count);
    for (let offset = start; offset < start + count; offset += 1) {
      const vertexIndex = index ? index.getX(offset) : offset;
      colors[vertexIndex * 3] = color.r;
      colors[vertexIndex * 3 + 1] = color.g;
      colors[vertexIndex * 3 + 2] = color.b;
    }
  }

  return new BufferAttribute(colors, 3);
}

function cloneMeshForExport(mesh: Mesh): Mesh {
  const clone = mesh.clone(false);
  clone.geometry = mesh.geometry.clone();
  clone.geometry.setAttribute('color', addVertexColorsFromMaterials(mesh));
  clone.geometry.clearGroups();
  clone.name = EXPORT_MESH_NAME;
  clone.material = new MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.02,
    name: EXPORT_VERTEX_COLOR_MATERIAL_NAME,
    roughness: 0.74,
    vertexColors: true,
  });
  clone.castShadow = false;
  clone.receiveShadow = false;
  return clone;
}

function disposeExportMesh(mesh: Mesh): void {
  mesh.geometry.dispose();
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((material) => material.dispose());
  } else {
    mesh.material.dispose();
  }
}

function formatObjNumber(value: number): string {
  const rounded = Math.abs(value) < 1e-8 ? 0 : Number(value.toFixed(6));
  return `${rounded}`;
}

function exportColoredMeshToObj(mesh: Mesh): string {
  mesh.updateMatrixWorld(true);
  const geometry = mesh.geometry;
  const vertices = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const colors = geometry.getAttribute('color');
  const index = geometry.getIndex();
  const vertex = new Vector3();
  const normal = new Vector3();
  const color = new Color();
  const normalMatrixWorld = new Matrix3().getNormalMatrix(mesh.matrixWorld);
  const lines: string[] = [`o ${mesh.name}`];

  for (let vertexIndex = 0; vertexIndex < vertices.count; vertexIndex += 1) {
    vertex.fromBufferAttribute(vertices, vertexIndex);
    vertex.applyMatrix4(mesh.matrixWorld);
    let line = `v ${formatObjNumber(vertex.x)} ${formatObjNumber(vertex.y)} ${formatObjNumber(vertex.z)}`;
    if (colors) {
      color.fromBufferAttribute(colors, vertexIndex);
      ColorManagement.workingToColorSpace(color, SRGBColorSpace);
      line += ` ${formatObjNumber(color.r)} ${formatObjNumber(color.g)} ${formatObjNumber(color.b)}`;
    }
    lines.push(line);
  }

  if (normals) {
    for (let normalIndex = 0; normalIndex < normals.count; normalIndex += 1) {
      normal.fromBufferAttribute(normals, normalIndex);
      normal.applyMatrix3(normalMatrixWorld).normalize();
      lines.push(`vn ${formatObjNumber(normal.x)} ${formatObjNumber(normal.y)} ${formatObjNumber(normal.z)}`);
    }
  }

  const faceCount = index ? index.count : vertices.count;
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 3) {
    const indices = [0, 1, 2].map((offset) => (index ? index.getX(faceIndex + offset) : faceIndex + offset) + 1);
    const face = normals ? indices.map((vertexIndex) => `${vertexIndex}//${vertexIndex}`) : indices.map((vertexIndex) => `${vertexIndex}`);
    lines.push(`f ${face.join(' ')}`);
  }

  return `${lines.join('\n')}\n`;
}

export function exportMazeMeshToObj(mesh: Mesh): string {
  const exportMesh = cloneMeshForExport(mesh);
  try {
    return exportColoredMeshToObj(exportMesh);
  } finally {
    disposeExportMesh(exportMesh);
  }
}

export async function exportMazeMeshToGlb(mesh: Mesh): Promise<ArrayBuffer> {
  const exportMesh = cloneMeshForExport(mesh);
  try {
    const result = await new GLTFExporter().parseAsync(exportMesh, {
      binary: true,
      forceIndices: true,
      onlyVisible: false,
      trs: true,
    });

    if (!(result instanceof ArrayBuffer)) {
      throw new Error('GLB export did not produce binary data.');
    }

    return result;
  } finally {
    disposeExportMesh(exportMesh);
  }
}
