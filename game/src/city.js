// Meridian Bay itself: the road grid, the buildings with lit facades, the bay, the pier and
// the docks, the trees and lamps and traffic lights. Static parts are merged into a few meshes;
// repeated parts (dashes, crosswalks, trees, lamps, light dots) are instanced, so the whole
// city costs about thirty draw calls.
import * as THREE from 'three';
import { CITY, PALETTE, roadAt, blockAt } from './config.js';
import { makeFacadeTextures, makeWaterTexture } from './textures.js';
import { mergeGeometries, box, plane, cylinder } from './geom.js';
import { range } from './random.js';

/** A box whose facade texture tiles every 12 m, so windows stay the same size on any building. */
function facadeBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const su = [d / 12, d / 12, w / 12, w / 12, w / 12, w / 12];
  const sv = [h / 12, h / 12, d / 12, d / 12, h / 12, h / 12];
  for (let f = 0; f < 6; f += 1) {
    for (let v = 0; v < 4; v += 1) {
      const idx = f * 4 + v;
      uv.setXY(idx, uv.getX(idx) * su[f], uv.getY(idx) * sv[f]);
    }
  }
  return g;
}

function mat(color, rough = 0.9, metal = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

export function createCity(rng) {
  const group = new THREE.Group();
  const colliders = [];
  const facades = makeFacadeTextures(rng);

  // The low golden sun, the sky bounce and the haze; main.js sets the sky and fog on the scene.
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(-190, 175, 230);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -290;
  sun.shadow.camera.right = 290;
  sun.shadow.camera.top = 290;
  sun.shadow.camera.bottom = -290;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0006;
  group.add(sun);
  group.add(new THREE.HemisphereLight(0xbfd4e6, 0x8a7a68, 0.9));
  const bounce = new THREE.DirectionalLight(0xffc890, 0.45);
  bounce.position.set(200, 60, -150);
  group.add(bounce);

  // Ground: one concrete slab, then the asphalt roads and the block lots on top of it.
  const base = new THREE.Mesh(new THREE.PlaneGeometry(560, 640), mat(PALETTE.concrete, 1));
  base.rotation.x = -Math.PI / 2;
  base.position.set(0, 0, 60);
  base.receiveShadow = true;
  group.add(base);

  const roadParts = [];
  const lotParts = [];
  for (let i = 0; i < 8; i += 1) {
    roadParts.push(plane(CITY.roadWidth, 518, roadAt(i), 0.02, 0));
    roadParts.push(plane(518, CITY.roadWidth, 0, 0.02, roadAt(i)));
  }
  for (let bi = 0; bi < 7; bi += 1) {
    for (let bj = 0; bj < 7; bj += 1) {
      const shade = 0.92 + rng() * 0.14;
      lotParts.push(plane(CITY.block, CITY.block, blockAt(bi), 0.04, blockAt(bj), 0, [shade, shade * 0.98, shade * 0.94]));
    }
  }
  const roads = new THREE.Mesh(mergeGeometries(roadParts), mat(PALETTE.asphalt, 0.95));
  roads.receiveShadow = true;
  group.add(roads);
  const lots = new THREE.Mesh(mergeGeometries(lotParts), new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true }));
  lots.receiveShadow = true;
  group.add(lots);

  // Lane dashes (yellow centre lines) and crosswalks (white stripes), instanced.
  const dashGeo = new THREE.BoxGeometry(0.28, 0.02, 3.2);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8b13c });
  const dashCount = 8 * 2 * 62;
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  const m4 = new THREE.Matrix4();
  let di = 0;
  for (let i = 0; i < 8; i += 1) {
    for (let k = -30; k <= 31; k += 1) {
      const z = k * 8;
      m4.makeTranslation(roadAt(i), 0.05, z);
      dashes.setMatrixAt(di, m4);
      di += 1;
      m4.makeTranslation(z, 0.05, roadAt(i));
      dashes.setMatrixAt(di, m4);
      di += 1;
    }
  }
  dashes.count = di;
  group.add(dashes);

  const stripeGeo = new THREE.BoxGeometry(0.7, 0.02, 3.4);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xe8e6df });
  const stripes = new THREE.InstancedMesh(stripeGeo, stripeMat, 64 * 4 * 6);
  let si = 0;
  for (let i = 0; i < 8; i += 1) {
    for (let j = 0; j < 8; j += 1) {
      for (let s = -2.5; s <= 2.5; s += 1) {
        m4.makeTranslation(roadAt(i) + s, 0.05, roadAt(j) - 8.5);
        stripes.setMatrixAt(si, m4);
        si += 1;
        m4.makeTranslation(roadAt(i) + s, 0.05, roadAt(j) + 8.5);
        stripes.setMatrixAt(si, m4);
        si += 1;
        m4.makeTranslation(roadAt(i) - 8.5, 0.05, roadAt(j) + s);
        stripes.setMatrixAt(si, m4);
        si += 1;
        m4.makeTranslation(roadAt(i) + 8.5, 0.05, roadAt(j) + s);
        stripes.setMatrixAt(si, m4);
        si += 1;
      }
    }
  }
  stripes.count = si;
  group.add(stripes);

  // Buildings: one or two per block, taller toward the centre, facades tiled per 12 m.
  const roofParts = [];
  const awningParts = [];
  const acParts = [];
  const facadeMats = {
    brick: new THREE.MeshStandardMaterial({ map: facades.brick, roughness: 0.92 }),
    concrete: new THREE.MeshStandardMaterial({ map: facades.concrete, roughness: 0.95 }),
    glass: new THREE.MeshStandardMaterial({ map: facades.glass, roughness: 0.35, metalness: 0.35 }),
  };
  const awningColors = [[0x5a6e4a, 1, 1], [0x8a3b2e, 1, 1], [0xd8c9a3, 1, 1], [0x3e5a6e, 1, 1]];
  for (let bi = 0; bi < 7; bi += 1) {
    for (let bj = 0; bj < 7; bj += 1) {
      const cx = blockAt(bi);
      const cz = blockAt(bj);
      const downtown = 1 - Math.hypot(cx, cz) / 340;
      const count = rng() < 0.45 ? 2 : 1;
      for (let b = 0; b < count; b += 1) {
        const w = count === 2 ? 20 + rng() * 6 : 26 + rng() * 18;
        const d = count === 2 ? 20 + rng() * 6 : 26 + rng() * 18;
        const h = 9 + downtown * 26 + rng() * 9;
        const ox = count === 2 ? (b === 0 ? -13 : 13) : 0;
        const oz = count === 2 ? (b === 0 ? -13 : 13) : 0;
        const x = cx + ox + range(rng, -2, 2);
        const z = cz + oz + range(rng, -2, 2);
        const variant = rng() < 0.4 ? 'brick' : rng() < 0.7 ? 'concrete' : 'glass';
        const mesh = new THREE.Mesh(facadeBox(w, h, d), facadeMats[variant]);
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        roofParts.push(box(w + 0.4, 0.3, d + 0.4, x, h + 0.15, z, 0, [0.32, 0.3, 0.29]));
        if (rng() < 0.6) acParts.push(box(2.5, 1, 2.5, x + range(rng, -w / 4, w / 4), h + 0.8, z + range(rng, -d / 4, d / 4), 0, [0.55, 0.55, 0.53]));
        if (rng() < 0.5) {
          const aw = awningColors[Math.floor(rng() * awningColors.length)];
          awningParts.push(box(w * 0.7, 0.25, 3.2, x, 3.4, z - d / 2 - 1.2, 0, aw));
        }
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
    }
  }
  // The hospital (white, red cross on the roof) and the hotel (tall glass) stand out.
  const hospital = new THREE.Mesh(facadeBox(30, 16, 24), facadeMats.concrete);
  hospital.position.set(70, 8, 70);
  hospital.castShadow = true;
  group.add(hospital);
  colliders.push({ minX: 55, maxX: 85, minZ: 58, maxZ: 82 });
  const crossParts = [box(6, 1, 1.6, 70, 17.2, 70, 0, [0.85, 0.12, 0.12]), box(1.6, 1, 6, 70, 17.2, 70, 0, [0.85, 0.12, 0.12])];
  const cross = new THREE.Mesh(mergeGeometries(crossParts), new THREE.MeshStandardMaterial({ color: 0xd02020, roughness: 0.6, vertexColors: true }));
  group.add(cross);
  const hotel = new THREE.Mesh(facadeBox(30, 34, 26), facadeMats.glass);
  hotel.position.set(210, 17, 0);
  hotel.castShadow = true;
  group.add(hotel);
  colliders.push({ minX: 195, maxX: 225, minZ: -13, maxZ: 13 });
  roofParts.push(box(30.4, 0.3, 24.4, 70, 16.15, 70, 0, [0.9, 0.9, 0.88]));
  roofParts.push(box(30.4, 0.3, 26.4, 210, 34.15, 0, 0, [0.32, 0.3, 0.29]));

  const roofs = new THREE.Mesh(mergeGeometries(roofParts), new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true }));
  roofs.castShadow = true;
  group.add(roofs);
  const acs = new THREE.Mesh(mergeGeometries(acParts), new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true }));
  group.add(acs);
  if (awningParts.length) {
    const awnings = new THREE.Mesh(mergeGeometries(awningParts), new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: true }));
    group.add(awnings);
  }

  // Trees along the sidewalks, street lamps at the intersections, both instanced.
  const treeSpots = [];
  for (let bi = 0; bi < 7; bi += 1) {
    for (let bj = 0; bj < 7; bj += 1) {
      for (let k = 0; k < 4; k += 1) {
        const side = Math.floor(rng() * 4);
        const t = range(rng, -24, 24);
        const cx = blockAt(bi);
        const cz = blockAt(bj);
        if (side === 0) treeSpots.push([cx + t, cz - 29]);
        else if (side === 1) treeSpots.push([cx + t, cz + 29]);
        else if (side === 2) treeSpots.push([cx - 29, cz + t]);
        else treeSpots.push([cx + 29, cz + t]);
      }
    }
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.22, 2.4, 6), mat(0x5a4632, 1), treeSpots.length);
  const canopies = new THREE.InstancedMesh(new THREE.SphereGeometry(1.7, 8, 6), mat(0x4a5d3a, 1), treeSpots.length);
  treeSpots.forEach(([x, z], i) => {
    m4.makeTranslation(x, 1.2, z);
    trunks.setMatrixAt(i, m4);
    m4.makeTranslation(x, 3.4, z);
    canopies.setMatrixAt(i, m4);
  });
  trunks.castShadow = true;
  canopies.castShadow = true;
  group.add(trunks);
  group.add(canopies);

  const lampSpots = [];
  for (let i = 0; i < 8; i += 1) {
    for (let j = 0; j < 8; j += 1) {
      if ((i + j) % 2 === 0) lampSpots.push([roadAt(i) + 8.5, roadAt(j) + 8.5]);
    }
  }
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 6), mat(0x2e2e33, 0.7, 0.6), lampSpots.length);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.18, 0.9), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, emissive: 0xffc978, emissiveIntensity: 0.9 }), lampSpots.length);
  lampSpots.forEach(([x, z], idx) => {
    m4.makeTranslation(x, 2.8, z);
    poles.setMatrixAt(idx, m4);
    m4.makeTranslation(x, 5.6, z);
    heads.setMatrixAt(idx, m4);
  });
  group.add(poles);
  group.add(heads);

  // Traffic lights at the twelve central intersections, cycling on a 20 s clock.
  const lightNodes = [];
  for (let i = 2; i <= 5; i += 1) {
    for (let j = 2; j <= 5; j += 1) {
      if (lightNodes.length < 12) lightNodes.push([i, j]);
    }
  }
  const lightPoleParts = [];
  const lightHeadParts = [];
  const trafficLights = [];
  for (const [i, j] of lightNodes) {
    const x = roadAt(i) + 8.5;
    const z = roadAt(j) + 8.5;
    lightPoleParts.push(cylinder(0.09, 0.12, 6, x, 3, z, [0.18, 0.18, 0.2]));
    lightHeadParts.push(box(0.45, 1.3, 0.45, x, 6.2, z, 0, [0.1, 0.1, 0.1]));
    trafficLights.push({ i, j, x, z, offset: (i * 3 + j * 7) % 20, state: 'ns' });
  }
  const lightPoles = new THREE.Mesh(mergeGeometries(lightPoleParts), new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.5, vertexColors: true }));
  group.add(lightPoles);
  const lightHeads = new THREE.Mesh(mergeGeometries(lightHeadParts), new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.5, vertexColors: true }));
  group.add(lightHeads);
  const dotGeo = new THREE.SphereGeometry(0.11, 8, 6);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const redDots = new THREE.InstancedMesh(dotGeo, dotMat, trafficLights.length);
  const yellowDots = new THREE.InstancedMesh(dotGeo, dotMat, trafficLights.length);
  const greenDots = new THREE.InstancedMesh(dotGeo, dotMat, trafficLights.length);
  trafficLights.forEach((L, idx) => {
    m4.makeTranslation(L.x, 6.55, L.z + 0.24);
    redDots.setMatrixAt(idx, m4);
    m4.makeTranslation(L.x, 6.2, L.z + 0.24);
    yellowDots.setMatrixAt(idx, m4);
    m4.makeTranslation(L.x, 5.85, L.z + 0.24);
    greenDots.setMatrixAt(idx, m4);
  });
  group.add(redDots);
  group.add(yellowDots);
  group.add(greenDots);
  const dotOn = new THREE.Color();
  function updateLights(time) {
    trafficLights.forEach((L, idx) => {
      const t = (time + L.offset) % 20;
      const ns = t < 8 ? 'green' : t < 10 ? 'yellow' : 'red';
      const ew = t < 8 ? 'red' : t < 10 ? 'red' : t < 18 ? 'green' : 'yellow';
      L.state = ns;
      L.ewState = ew;
      redDots.setColorAt(idx, dotOn.setRGB(ns === 'red' ? 1 : 0.14, 0.05, 0.05));
      yellowDots.setColorAt(idx, dotOn.setRGB(ns === 'yellow' ? 1 : 0.14, ns === 'yellow' ? 0.75 : 0.1, 0.05));
      greenDots.setColorAt(idx, dotOn.setRGB(0.05, ns === 'green' ? 1 : 0.12, 0.1));
    });
    redDots.instanceColor.needsUpdate = true;
    yellowDots.instanceColor.needsUpdate = true;
    greenDots.instanceColor.needsUpdate = true;
  }
  updateLights(0);

  // The bay: still water, sun glitter, the pier, the docks and two boats.
  const water = new THREE.Mesh(new THREE.PlaneGeometry(560, 400), new THREE.MeshStandardMaterial({ color: PALETTE.water, roughness: 0.12, metalness: 0.6 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.15, 452);
  group.add(water);
  const glitterTex = makeWaterTexture(rng);
  glitterTex.repeat.set(10, 7);
  const glitter = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 400),
    new THREE.MeshBasicMaterial({ map: glitterTex, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  glitter.rotation.x = -Math.PI / 2;
  glitter.position.set(0, 0.02, 452);
  group.add(glitter);

  const pierParts = [
    box(10, 1.2, 82, 0, 0.4, 292, 0, [0.72, 0.68, 0.6]),
    box(1, 1, 82, -4.6, 1.1, 292, 0, [0.5, 0.46, 0.4]),
    box(1, 1, 82, 4.6, 1.1, 292, 0, [0.5, 0.46, 0.4]),
  ];
  for (let k = 0; k < 5; k += 1) pierParts.push(cylinder(0.3, 0.3, 3, -4, -0.5, 262 + k * 15, [0.4, 0.36, 0.3]));
  for (let k = 0; k < 5; k += 1) pierParts.push(cylinder(0.3, 0.3, 3, 4, -0.5, 262 + k * 15, [0.4, 0.36, 0.3]));
  pierParts.push(box(2, 2, 2, -2, 1.9, 300, 0, [0.6, 0.5, 0.35]));
  pierParts.push(box(2, 2, 2, 2.5, 1.9, 312, 0, [0.55, 0.45, 0.3]));
  const pier = new THREE.Mesh(mergeGeometries(pierParts), new THREE.MeshStandardMaterial({ roughness: 0.95, vertexColors: true }));
  pier.receiveShadow = true;
  pier.castShadow = true;
  group.add(pier);

  const dockParts = [box(64, 1.2, 34, -203, 0.4, 269, 0, [0.7, 0.66, 0.58])];
  const dock = new THREE.Mesh(mergeGeometries(dockParts), new THREE.MeshStandardMaterial({ roughness: 0.95, vertexColors: true }));
  dock.receiveShadow = true;
  group.add(dock);
  const warehouse = new THREE.Mesh(facadeBox(34, 12, 16), facadeMats.concrete);
  warehouse.position.set(-205, 6, 274);
  warehouse.castShadow = true;
  group.add(warehouse);
  colliders.push({ minX: -222, maxX: -188, minZ: 266, maxZ: 282 });
  const containerColors = [[0x8a3b2e, 1, 1], [0x3e5a6e, 1, 1], [0x5a6e4a, 1, 1], [0xb08a2e, 1, 1]];
  const containerParts = [];
  const containerSpots = [[-182, 262, 0], [-182, 262, 0], [-228, 262, 0], [-228, 275, 0], [-182, 275, 0], [-182, 262, 1]];
  containerSpots.forEach(([x, z, level], idx) => {
    const c = containerColors[idx % containerColors.length];
    containerParts.push(box(6, 2.6, 2.6, x, 1.9 + level * 2.6, z, 0, c));
  });
  const containers = new THREE.Mesh(mergeGeometries(containerParts), new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.3, vertexColors: true }));
  containers.castShadow = true;
  group.add(containers);
  colliders.push({ minX: -231, maxX: -179, minZ: 259, maxZ: 278 });

  const boats = [];
  for (const [bx, bz, ry] of [[70, 330, 0.4], [-90, 390, -0.7]]) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(8, 1.6, 3), mat(0xe8e6df, 0.5, 0.2));
    hull.position.y = 0.4;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 2.4), mat(0x3e5a6e, 0.6, 0.2));
    cabin.position.set(-1, 1.6, 0);
    boat.add(hull);
    boat.add(cabin);
    boat.position.set(bx, 0, bz);
    boat.rotation.y = ry;
    group.add(boat);
    boats.push(boat);
  }

  // Where parked cars wait along the curbs (never on the chase avenue, x = -35).
  const parkedSpawns = [];
  const parkTypes = ['sedan', 'taxi', 'coupe', 'pickup', 'van', 'sedan', 'taxi', 'sedan', 'pickup', 'coupe', 'van', 'sedan'];
  for (let k = 0; k < 12; k += 1) {
    const alongX = rng() < 0.5;
    const road = Math.floor(rng() * 8);
    if (alongX && roadAt(road) === -35) continue;
    const t = range(rng, -210, 210);
    const dir = rng() < 0.5 ? 1 : -1;
    // A parked car sits on the right-hand side of its lane, facing the traffic flow.
    if (alongX) parkedSpawns.push({ x: roadAt(road) + 5.2 * dir, z: t, heading: dir > 0 ? Math.PI : 0, type: parkTypes[k] });
    else parkedSpawns.push({ x: t, z: roadAt(road) + 5.2 * dir, heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2, type: parkTypes[k] });
  }

  return {
    group,
    colliders,
    trafficLights,
    updateLights,
    boats,
    glitterTex,
    parkedSpawns,
    playerSpawn: { x: 35, z: 205 },
    hospitalSpawn: { x: 35, z: 70 },
    nodePos(i, j) {
      return { x: roadAt(i), z: roadAt(j) };
    },
    nodeIndex(i, j) {
      return j * 8 + i;
    },
    neighbours(i, j) {
      const out = [];
      if (i > 0) out.push([i - 1, j]);
      if (i < 7) out.push([i + 1, j]);
      if (j > 0) out.push([i, j - 1]);
      if (j < 7) out.push([i, j + 1]);
      return out;
    },
  };
}
