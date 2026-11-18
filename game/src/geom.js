// Geometry helpers: build merged meshes with per-vertex colours so one draw
// call can paint a whole car, building or street prop. Boxes and cylinders
// are appended as position/normal/colour triples, then merged into one
// BufferGeometry. Colours are given as [r, g, b] floats in 0..1.
import * as THREE from 'three';

export function hexToRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

// A bag of triangles. box() appends a box centred at (cx, cy, cz) with size
// (sx, sy, sz); cylinder() appends a Y-axis cylinder of radius r and height h.
export function createBag() {
  return { pos: [], norm: [], col: [] };
}

const FACES = [
  // +x, -x, +y, -y, +z, -z — each a quad split into two triangles
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export function box(bag, sx, sy, sz, cx, cy, cz, color, ry = 0) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const cos = Math.cos(ry), sin = Math.sin(ry);
  for (let f = 0; f < 6; f++) {
    const quad = FACES[f];
    const n = NORMALS[f];
    const rn = [n[0] * cos + n[2] * sin, n[1], -n[0] * sin + n[2] * cos];
    const idx = [0, 1, 2, 0, 2, 3];
    for (const k of idx) {
      const v = quad[k];
      const lx = (v[0] - 0.5) * sx, ly = (v[1] - 0.5) * sy, lz = (v[2] - 0.5) * sz;
      const x = lx * cos + lz * sin, z = -lx * sin + lz * cos;
      bag.pos.push(cx + x, cy + ly, cz + z);
      bag.norm.push(rn[0], rn[1], rn[2]);
      bag.col.push(color[0], color[1], color[2]);
    }
  }
  return bag;
}

export function cylinder(bag, r, h, cx, cy, cz, color, segments = 10) {
  const top = cy + h / 2, bottom = cy - h / 2;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r;
    const x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
    const n0 = [Math.cos(a0), 0, Math.sin(a0)];
    const n1 = [Math.cos(a1), 0, Math.sin(a1)];
    // side quad
    const tris = [
      [cx + x0, bottom, cz + z0, n0], [cx + x1, bottom, cz + z1, n1], [cx + x1, top, cz + z1, n1],
      [cx + x0, bottom, cz + z0, n0], [cx + x1, top, cz + z1, n1], [cx + x0, top, cz + z0, n0],
      // top cap
      [cx, top, cz, [0, 1, 0]], [cx + x1, top, cz + z1, [0, 1, 0]], [cx + x0, top, cz + z0, [0, 1, 0]],
      // bottom cap
      [cx, bottom, cz, [0, -1, 0]], [cx + x0, bottom, cz + z0, [0, -1, 0]], [cx + x1, bottom, cz + z1, [0, -1, 0]],
    ];
    for (const [x, y, z, n] of tris) {
      bag.pos.push(x, y, z);
      bag.norm.push(n[0], n[1], n[2]);
      bag.col.push(color[0], color[1], color[2]);
    }
  }
  return bag;
}

// Merge a bag into a single mesh. The material is shared per call site.
export function bagToMesh(bag, material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(bag.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(bag.norm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(bag.col, 3));
  return new THREE.Mesh(geo, material);
}

export function standardMaterial(opts = {}) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05, ...opts });
}

// A canvas texture with a grid of windows, some lit warm. Used on building
// sides so facades read as real apartments and offices at golden hour.
export function makeFacadeTexture(random, base, litRatio = 0.35) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  const cols = 6, rows = 14;
  const cw = 128 / cols, ch = 256 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = random() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : (random() < 0.5 ? '#2b3542' : '#1d2530');
      g.fillRect(x * cw + 3, y * ch + 4, cw - 6, ch - 8);
      if (lit) {
        g.fillStyle = 'rgba(255, 220, 140, 0.35)';
        g.fillRect(x * cw + 3, y * ch + 4, cw - 6, ch - 8);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
