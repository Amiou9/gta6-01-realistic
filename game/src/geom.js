// Geometry helpers: merge many static parts into one draw call, and small part builders.
// Every part carries an optional vertex colour, so merged meshes can still vary.
import * as THREE from 'three';

/** Merge indexed parts [{geo, matrix, color:[r,g,b]}] into one BufferGeometry. */
export function mergeGeometries(parts) {
  let vCount = 0;
  let iCount = 0;
  for (const p of parts) {
    vCount += p.geo.attributes.position.count;
    iCount += p.geo.index.count;
  }
  const pos = new Float32Array(vCount * 3);
  const norm = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  for (const p of parts) {
    const g = p.geo;
    const n = g.attributes.position.count;
    nm.getNormalMatrix(p.matrix);
    for (let i = 0; i < n; i += 1) {
      v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(p.matrix);
      pos[(vo + i) * 3] = v.x;
      pos[(vo + i) * 3 + 1] = v.y;
      pos[(vo + i) * 3 + 2] = v.z;
      v.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize();
      norm[(vo + i) * 3] = v.x;
      norm[(vo + i) * 3 + 1] = v.y;
      norm[(vo + i) * 3 + 2] = v.z;
      if (g.attributes.uv) {
        uv[(vo + i) * 2] = g.attributes.uv.getX(i);
        uv[(vo + i) * 2 + 1] = g.attributes.uv.getY(i);
      }
      const c = p.color || [1, 1, 1];
      col[(vo + i) * 3] = c[0];
      col[(vo + i) * 3 + 1] = c[1];
      col[(vo + i) * 3 + 2] = c[2];
    }
    const src = g.index.array;
    for (let i = 0; i < src.length; i += 1) idx[io + i] = src[i] + vo;
    io += src.length;
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function matrixAt(x, y, z, ry = 0, rx = 0) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
  return m;
}

/** A box part, centred at (x, y, z), optionally yawed. */
export function box(w, h, d, x, y, z, ry = 0, color) {
  return { geo: new THREE.BoxGeometry(w, h, d), matrix: matrixAt(x, y, z, ry), color };
}

/** A flat plane part lying on the ground (or tilted by rx). */
export function plane(w, d, x, y, z, ry = 0, color) {
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  if (ry) geo.rotateY(ry);
  return { geo, matrix: matrixAt(x, y, z), color };
}

/** A cylinder part (trunk, pole, post). */
export function cylinder(rTop, rBottom, h, x, y, z, color, segments = 8) {
  return { geo: new THREE.CylinderGeometry(rTop, rBottom, h, segments), matrix: matrixAt(x, y, z), color };
}
