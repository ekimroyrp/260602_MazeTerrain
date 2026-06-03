import { Group, Mesh } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';

const EXPORT_MESH_NAME = '260602_MazeTerrain_maze_mesh';

export function getMazeMeshFromGroup(group: Group): Mesh | null {
  const object = group.getObjectByName('maze-mesh');
  return object instanceof Mesh ? object : null;
}

function cloneMeshForExport(mesh: Mesh): Mesh {
  const clone = mesh.clone(false);
  clone.name = EXPORT_MESH_NAME;
  clone.geometry = mesh.geometry;
  clone.material = mesh.material;
  clone.castShadow = false;
  clone.receiveShadow = false;
  return clone;
}

export function exportMazeMeshToObj(mesh: Mesh): string {
  return new OBJExporter().parse(cloneMeshForExport(mesh));
}

export async function exportMazeMeshToGlb(mesh: Mesh): Promise<ArrayBuffer> {
  const result = await new GLTFExporter().parseAsync(cloneMeshForExport(mesh), {
    binary: true,
    forceIndices: true,
    onlyVisible: false,
    trs: true,
  });

  if (!(result instanceof ArrayBuffer)) {
    throw new Error('GLB export did not produce binary data.');
  }

  return result;
}
