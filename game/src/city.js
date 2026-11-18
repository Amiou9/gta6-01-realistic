// MERIDIAN BAY — the city. A 7x7 block grid with the bay to the south, built
// from merged static geometry (roads, sidewalks, markings, lamps, trees) plus
// individual textured buildings. Also owns the road graph (intersections +
// BFS paths) that traffic and police drive on, and the traffic lights.
import * as THREE from 'three';
import {
  ROADS, BLOCK, PITCH, CITY_MIN, CITY_MAX, BAY_Z, WATER_Z,
  PIER_X, PIER_HALF, PIER_END_Z, DOCKS, AVENUES, STREETS,
} from './config.js';
import { box, cylinder, createBag, bagToMesh, standardMaterial, makeFacadeTexture, hexToRgb } from './geom.js';

const ASPHALT = [0.16, 0.16, 0.17];
const SIDEWALK = [0.42, 0.4, 0.37];
const LANE_YELLOW = [0.85, 0.7, 0.2];
const LANE_WHITE = [0.85, 0.85, 0.82];
const CONCRETE = [0.5, 0.48, 0.45];
const WOOD = [0.45, 0.33, 0.22];
const TRUNK = [0.3, 0.22, 0.15];
const LEAF = [0.16, 0.28, 0.14];
const POLE = [0.12, 0.12, 0.13];
const WATER_COL = [0.08, 0.25, 0.38];

function nodeIndex(i, j) { return j * 8 + i; }

export function createCity(random) {
  const group = new THREE.Group();
  const colliders = [];
  const lights = []; // traffic lights: { node, head, lamps: {r,y,g} }

  // ---- sky dome (vertex-coloured gradient), fog, sun ----
  const skyGeo = new THREE.SphereGeometry(900, 24, 12);
  const skyPos = skyGeo.attributes.position;
  const skyCol = new Float32Array(skyPos.count * 3);
  const top = [0.25, 0.4, 0.62], mid = [1.0, 0.66, 0.36], low = [1.0, 0.86, 0.62];
  for (let i = 0; i < skyPos.count; i++) {
    const y = skyPos.getY(i) / 900;
    const c = y > 0.25 ? top : y > -0.05 ? mid : low;
    skyCol[i * 3] = c[0]; skyCol[i * 3 + 1] = c[1]; skyCol[i * 3 + 2] = c[2];
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyCol, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  group.add(sky);

  const sun = new THREE.DirectionalLight(0xffc98a, 2.4);
  sun.position.set(-320, 170, 260);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -280; sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280; sun.shadow.camera.bottom = -280;
  sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 1.5;
  group.add(sun);
  group.add(new THREE.HemisphereLight(0x8fa3c7, 0x6b5a4a, 0.95));
  // Cool fill from the north-east so shaded facades stay readable.
  const fill = new THREE.DirectionalLight(0x9db4d6, 0.55);
  fill.position.set(220, 160, -240);
  group.add(fill);

  // ---- ground: asphalt for the city, sand strip at the waterline ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 640),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 50);
  ground.receiveShadow = true;
  group.add(ground);

  // ---- water ----
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(560, WATER_Z - BAY_Z + 20),
    new THREE.MeshStandardMaterial({ color: 0x14425f, roughness: 0.18, metalness: 0.65 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, (BAY_Z + WATER_Z) / 2 + 10);
  group.add(water);
  // glitter: a sparse point cloud on the water
  const glitterGeo = new THREE.BufferGeometry();
  const glitterPos = [];
  for (let i = 0; i < 260; i++) {
    glitterPos.push(-260 + random() * 520, 0.1, BAY_Z + 4 + random() * (WATER_Z - BAY_Z - 8));
  }
  glitterGeo.setAttribute('position', new THREE.Float32BufferAttribute(glitterPos, 3));
  const glitter = new THREE.Points(glitterGeo, new THREE.PointsMaterial({ color: 0xffe9b0, size: 1.6, transparent: true, opacity: 0.55 }));
  group.add(glitter);

  // ---- sidewalks, road markings, crosswalks (one merged static mesh) ----
  const staticBag = createBag();
  const blockCenters = [];
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      const cx = -144 + i * PITCH, cz = -144 + j * PITCH;
      blockCenters.push([cx, cz]);
      box(staticBag, BLOCK, 0.3, BLOCK, cx, 0.15, cz, SIDEWALK);
    }
  }
  // centre dashes on every road, both directions
  for (const r of ROADS) {
    for (let d = -162; d <= 162; d += 12) {
      box(staticBag, 0.25, 0.04, 4, r, 0.02, d, LANE_YELLOW);
      box(staticBag, 4, 0.04, 0.25, d, 0.02, r, LANE_YELLOW);
    }
  }
  // crosswalk stripes at every intersection
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      for (let k = -4; k <= 4; k += 2) {
        box(staticBag, 1.1, 0.04, 3.4, rx + k, 0.02, rz - 7.5, LANE_WHITE);
        box(staticBag, 1.1, 0.04, 3.4, rx + k, 0.02, rz + 7.5, LANE_WHITE);
        box(staticBag, 3.4, 0.04, 1.1, rx - 7.5, 0.02, rz + k, LANE_WHITE);
        box(staticBag, 3.4, 0.04, 1.1, rx + 7.5, 0.02, rz + k, LANE_WHITE);
      }
    }
  }
  // lamp posts + trees on sidewalk corners (merged, static)
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      const lx = rx + 7.2, lz = rz + 7.2;
      if (Math.abs(lx) > CITY_MAX || Math.abs(lz) > CITY_MAX) continue;
      cylinder(staticBag, 0.09, 5.2, lx, 2.6, lz, POLE, 6);
      box(staticBag, 0.18, 0.18, 1.6, lx - 0.6, 5.1, lz, POLE);
      box(staticBag, 0.7, 0.24, 0.4, lx - 1.2, 5.0, lz, [1.0, 0.8, 0.45]);
    }
  }
  for (let t = 0; t < 90; t++) {
    const bx = blockCenters[Math.floor(random() * blockCenters.length)];
    const tx = bx[0] + (random() - 0.5) * 30;
    const tz = bx[1] + (random() - 0.5) * 30;
    cylinder(staticBag, 0.14, 2.2, tx, 1.1, tz, TRUNK, 6);
    const s = 1.4 + random() * 1.2;
    box(staticBag, s * 2, s * 1.4, s * 2, tx, 2.6 + s * 0.5, tz, LEAF);
  }
  const staticMesh = bagToMesh(staticBag, standardMaterial({ roughness: 0.9 }));
  staticMesh.receiveShadow = true;
  group.add(staticMesh);

  // ---- buildings (individual meshes with facade textures) ----
  const facades = [
    makeFacadeTexture(random, '#7a5a4a', 0.32),
    makeFacadeTexture(random, '#8b8d90', 0.4),
    makeFacadeTexture(random, '#46586a', 0.45),
    makeFacadeTexture(random, '#6b5f52', 0.3),
  ];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.95 });
  function addBuilding(cx, cz, w, d, h, facadeIdx, opts = {}) {
    const tex = facades[facadeIdx % facades.length].clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(1, Math.round(w / 12)), Math.max(1, Math.round(h / 12)));
    const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, [side, side, roofMat, roofMat, side, side]);
    mesh.position.set(cx, h / 2 + 0.3, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    if (opts.door) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(opts.door.w, opts.door.h, 0.3), new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.7, metalness: 0.4 }));
      door.position.set(cx + (opts.door.dx || 0), opts.door.h / 2 + 0.3, cz + (opts.door.dz || 0));
      group.add(door);
    }
    return mesh;
  }

  // Landmarks.
  // Hospital: white tower on the north-west block, red cross on the roof.
  addBuilding(-144, -144, 26, 22, 30, 1);
  const crossBag = createBag();
  box(crossBag, 6, 0.8, 1.6, -144, 31.2, -144, [0.8, 0.1, 0.1]);
  box(crossBag, 1.6, 0.8, 6, -144, 31.2, -144, [0.8, 0.1, 0.1]);
  group.add(bagToMesh(crossBag, standardMaterial({ roughness: 0.6 })));
  // Harbor Hotel: tall glass slab on the south edge, facing Beach St.
  addBuilding(96, 144, 30, 20, 42, 2);
  // Garage: low wide building on the south-east block, door facing the road.
  addBuilding(144, 144, 28, 18, 8, 3, { door: { w: 8, h: 5, dz: 9.1 } });
  // Other blocks: one or two buildings each.
  for (const [cx, cz] of blockCenters) {
    if ((cx === -144 && cz === -144) || (cx === 96 && cz === 144) || (cx === 144 && cz === 144)) continue;
    if (random() < 0.45) {
      addBuilding(cx - 7, cz, 15, 26, 9 + random() * 26, Math.floor(random() * 4));
      addBuilding(cx + 9, cz - 4, 13, 18, 8 + random() * 20, Math.floor(random() * 4));
    } else {
      const w = 20 + random() * 10, d = 20 + random() * 10;
      addBuilding(cx + (random() - 0.5) * 6, cz + (random() - 0.5) * 6, w, d, 9 + random() * 28, Math.floor(random() * 4));
    }
  }

  // ---- pier (wooden walkway into the bay) ----
  const pierBag = createBag();
  box(pierBag, PIER_HALF * 2, 0.5, PIER_END_Z - BAY_Z, PIER_X, 0.25, (BAY_Z + PIER_END_Z) / 2, WOOD);
  for (let z = BAY_Z + 8; z < PIER_END_Z; z += 16) {
    cylinder(pierBag, 0.22, 1.4, PIER_X - PIER_HALF + 0.4, -0.4, z, TRUNK, 6);
    cylinder(pierBag, 0.22, 1.4, PIER_X + PIER_HALF - 0.4, -0.4, z, TRUNK, 6);
  }
  box(pierBag, 0.25, 1.0, PIER_END_Z - BAY_Z, PIER_X - PIER_HALF + 0.2, 0.9, (BAY_Z + PIER_END_Z) / 2, WOOD);
  box(pierBag, 0.25, 1.0, PIER_END_Z - BAY_Z, PIER_X + PIER_HALF - 0.2, 0.9, (BAY_Z + PIER_END_Z) / 2, WOOD);
  // shack at the pier end
  box(pierBag, 7, 3.4, 6, PIER_X, 2.2, PIER_END_Z - 6, [0.55, 0.48, 0.4]);
  box(pierBag, 7.6, 0.3, 6.6, PIER_X, 4.0, PIER_END_Z - 6, [0.3, 0.28, 0.26]);
  const pierMesh = bagToMesh(pierBag, standardMaterial({ roughness: 0.85 }));
  pierMesh.castShadow = true; pierMesh.receiveShadow = true;
  group.add(pierMesh);

  // ---- docks platform + warehouse + containers + crane ----
  const dockBag = createBag();
  box(dockBag, DOCKS.maxX - DOCKS.minX, 0.3, DOCKS.maxZ - DOCKS.minZ, (DOCKS.minX + DOCKS.maxX) / 2, 0.15, (DOCKS.minZ + DOCKS.maxZ) / 2, CONCRETE);
  const dockMesh = bagToMesh(dockBag, standardMaterial({ roughness: 0.9 }));
  dockMesh.receiveShadow = true;
  group.add(dockMesh);
  addBuilding(-210, 220, 24, 16, 10, 3, { door: { w: 9, h: 6, dz: 8.1 } });
  const containerColors = [[0.7, 0.25, 0.15], [0.15, 0.35, 0.6], [0.2, 0.5, 0.25], [0.75, 0.6, 0.15]];
  const contBag = createBag();
  const contSpots = [[-190, 200, 0], [-190, 212, 1], [-228, 250, 2], [-196, 262, 3], [-228, 200, 0]];
  for (const [x, z, c] of contSpots) {
    box(contBag, 6, 2.6, 2.6, x, 1.9, z, containerColors[c]);
  }
  // gantry crane over the docks
  box(contBag, 1.2, 22, 1.2, -232, 11, 190, [0.75, 0.6, 0.15]);
  box(contBag, 1.2, 22, 1.2, -232, 11, 270, [0.75, 0.6, 0.15]);
  box(contBag, 1.2, 1.6, 82, -232, 22, 230, [0.75, 0.6, 0.15]);
  box(contBag, 3, 2, 3, -232, 19, 230, [0.25, 0.25, 0.26]);
  group.add(bagToMesh(contBag, standardMaterial({ roughness: 0.8 })));

  // ---- boats (bob on the water) ----
  const boats = [];
  const boatDefs = [[-60, 250, 0.4], [90, 290, -0.7]];
  for (const [bx, bz, rot] of boatDefs) {
    const b = new THREE.Group();
    const hullBag = createBag();
    box(hullBag, 3.2, 1.2, 9, 0, 0.4, 0, [0.85, 0.85, 0.82]);
    box(hullBag, 2.6, 1.4, 2.5, 0, 1.4, -1.5, [0.7, 0.7, 0.66]);
    box(hullBag, 3.0, 0.5, 8.6, 0, -0.1, 0, [0.15, 0.2, 0.28]);
    cylinder(hullBag, 0.08, 5, 0, 3.5, 0, POLE, 6);
    const hull = bagToMesh(hullBag, standardMaterial({ roughness: 0.7 }));
    hull.castShadow = true;
    b.add(hull);
    b.position.set(bx, 0, bz);
    b.rotation.y = rot;
    group.add(b);
    boats.push(b);
  }

  // ---- traffic lights at every other intersection ----
  const lampGeo = new THREE.SphereGeometry(0.22, 8, 6);
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      if ((i + j) % 2 !== 0) continue;
      const x = ROADS[i], z = ROADS[j];
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 5.4, 6), new THREE.MeshStandardMaterial({ color: 0x1e1e20, roughness: 0.6, metalness: 0.5 }));
      pole.position.set(x + 6.4, 2.7, z + 6.4);
      pole.castShadow = true;
      group.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.5), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.5 }));
      head.position.set(x + 6.4, 5.6, z + 6.4);
      group.add(head);
      const mats = {
        r: new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2211, emissiveIntensity: 0.2 }),
        y: new THREE.MeshStandardMaterial({ color: 0x332200, emissive: 0xffbb00, emissiveIntensity: 0.2 }),
        g: new THREE.MeshStandardMaterial({ color: 0x002200, emissive: 0x22ff44, emissiveIntensity: 0.2 }),
      };
      const lamps = {};
      const offs = { r: 0.42, y: 0, g: -0.42 };
      for (const [k, dy] of Object.entries(offs)) {
        const lamp = new THREE.Mesh(lampGeo, mats[k]);
        lamp.position.set(x + 6.4, 5.6 + dy, z + 6.15);
        group.add(lamp);
        lamps[k] = mats[k];
      }
      lights.push({ node: nodeIndex(i, j), x, z, lamps });
    }
  }

  // ---- road graph ----
  const nodes = [];
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 8; i++) nodes.push({ x: ROADS[i], z: ROADS[j], i, j });
  }
  const neighbours = nodes.map((n) => {
    const out = [];
    if (n.i > 0) out.push(nodeIndex(n.i - 1, n.j));
    if (n.i < 7) out.push(nodeIndex(n.i + 1, n.j));
    if (n.j > 0) out.push(nodeIndex(n.i, n.j - 1));
    if (n.j < 7) out.push(nodeIndex(n.i, n.j + 1));
    return out;
  });

  function nearestNode(x, z) {
    let best = 0, bestD = Infinity;
    for (let n = 0; n < 64; n++) {
      const dx = nodes[n].x - x, dz = nodes[n].z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  // BFS shortest path between two node indices; returns node indices.
  function findPath(from, to) {
    if (from === to) return [from];
    const prev = new Array(64).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of neighbours[cur]) {
        if (prev[nb] === -1) {
          prev[nb] = cur;
          if (nb === to) {
            const path = [to];
            let p = to;
            while (p !== from) { p = prev[p]; path.unshift(p); }
            return path;
          }
          queue.push(nb);
        }
      }
    }
    return [from, to];
  }

  function isLand(x, z) {
    if (Math.abs(x) <= CITY_MAX + 6 && z >= -CITY_MAX - 6 && z <= CITY_MAX + 6) return true;
    if (Math.abs(x - PIER_X) <= PIER_HALF && z > BAY_Z && z <= PIER_END_Z) return true;
    if (x >= DOCKS.minX && x <= DOCKS.maxX && z >= DOCKS.minZ && z <= DOCKS.maxZ) return true;
    return false;
  }

  // Snap a point to the nearest road (used for police search targets).
  function snapToRoad(x, z) {
    let bx = ROADS[0], bz = ROADS[0];
    for (const r of ROADS) {
      if (Math.abs(r - x) < Math.abs(bx - x)) bx = r;
      if (Math.abs(r - z) < Math.abs(bz - z)) bz = r;
    }
    // Keep the closer axis exact, snap the other to the nearest road.
    if (Math.abs(bx - x) < Math.abs(bz - z)) return { x: bx, z: Math.max(CITY_MIN, Math.min(CITY_MAX, z)) };
    return { x: Math.max(CITY_MIN, Math.min(CITY_MAX, x)), z: bz };
  }

  function streetName(x, z) {
    let ai = 0, aj = 0;
    for (let i = 0; i < 8; i++) {
      if (Math.abs(ROADS[i] - x) < Math.abs(ROADS[ai] - x)) ai = i;
      if (Math.abs(ROADS[i] - z) < Math.abs(ROADS[aj] - z)) aj = i;
    }
    const onAve = Math.abs(ROADS[ai] - x) < Math.abs(ROADS[aj] - z);
    return onAve ? AVENUES[ai] : STREETS[aj];
  }

  // Traffic-light phase: 20 s cycle, 8 s green / 2 s yellow per direction.
  // t is seconds since boot. Returns { ns: 'green'|'yellow'|'red', ew: ... }.
  function lightPhase(t) {
    const c = t % 20;
    if (c < 8) return { ns: 'green', ew: 'red' };
    if (c < 10) return { ns: 'yellow', ew: 'red' };
    if (c < 18) return { ns: 'red', ew: 'green' };
    return { ns: 'red', ew: 'yellow' };
  }

  function setLightVisuals(t) {
    const ph = lightPhase(t);
    for (const L of lights) {
      // The head faces the intersection; show NS on one side, EW on the other.
      // We light the same head for both: green wins over red when either is green.
      L.lamps.g.emissiveIntensity = (ph.ns === 'green' || ph.ew === 'green') ? 2.2 : 0.15;
      L.lamps.y.emissiveIntensity = (ph.ns === 'yellow' || ph.ew === 'yellow') ? 2.2 : 0.15;
      L.lamps.r.emissiveIntensity = (ph.ns === 'red' && ph.ew === 'red') ? 2.2 : (ph.ns === 'green' || ph.ew === 'green' ? 0.15 : 2.2);
    }
  }

  return {
    group, colliders, lights, boats, nodes, neighbours, nearestNode, findPath,
    isLand, snapToRoad, streetName, lightPhase, setLightVisuals,
  };
}
