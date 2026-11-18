// MERIDIAN BAY — people. Danny (the player on foot) with a walk cycle and a
// pistol, plus pedestrians who stroll the sidewalks, flee gunfire, and can be
// knocked down by a car.
import * as THREE from 'three';
import { box, cylinder, createBag, bagToMesh, standardMaterial } from './geom.js';

const SKIN = [0.85, 0.62, 0.45];
const SHIRT = [0.35, 0.42, 0.55];
const PANTS = [0.2, 0.2, 0.24];
const SHOES = [0.12, 0.1, 0.1];
const PED_SHIRTS = [
  [0.7, 0.25, 0.2], [0.25, 0.55, 0.3], [0.85, 0.75, 0.3], [0.6, 0.35, 0.6],
  [0.3, 0.6, 0.7], [0.8, 0.5, 0.25], [0.45, 0.45, 0.5], [0.9, 0.85, 0.8],
];

function personParts(bag, shirt, height, armSwing, legSwing, down = false) {
  const s = height / 1.8;
  // legs
  box(bag, 0.22 * s, 0.8 * s, 0.22 * s, -0.13 * s, 0.4 * s, 0, PANTS, legSwing * 0.5);
  box(bag, 0.22 * s, 0.8 * s, 0.22 * s, 0.13 * s, 0.4 * s, 0, PANTS, -legSwing * 0.5);
  // torso
  box(bag, 0.62 * s, 0.72 * s, 0.34 * s, 0, 1.16 * s, 0, shirt);
  // arms
  box(bag, 0.18 * s, 0.62 * s, 0.18 * s, -0.4 * s, 1.14 * s, 0, shirt, -armSwing * 0.5);
  box(bag, 0.18 * s, 0.62 * s, 0.18 * s, 0.4 * s, 1.14 * s, 0, shirt, armSwing * 0.5);
  // head
  box(bag, 0.3 * s, 0.32 * s, 0.3 * s, 0, 1.68 * s, 0, SKIN);
  if (down) {
    // lying flat: the whole figure is rotated by the caller
  }
  return bag;
}

// Build one person mesh; the caller re-builds it when the pose changes
// (walk cycle) — cheap enough at this scale, and it keeps one draw call.
export function createPersonMesh(shirt, height = 1.8) {
  const bag = createBag();
  personParts(bag, shirt, height, 0, 0);
  const mesh = bagToMesh(bag, standardMaterial({ roughness: 0.85 }));
  mesh.castShadow = true;
  return mesh;
}

// Rebuild a person's geometry for a walk pose. phase advances with distance.
export function posePerson(mesh, shirt, height, phase, down) {
  const bag = createBag();
  if (down) {
    // lying on the ground, face up
    box(bag, 0.62, 0.5, 1.8, 0, 0.3, 0, shirt);
    box(bag, 0.3, 0.3, 0.3, 0, 0.3, 1.05, SKIN);
  } else {
    const swing = Math.sin(phase);
    personParts(bag, shirt, height, swing * 0.6, swing * 0.7);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(bag.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(bag.norm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(bag.col, 3));
  mesh.geometry.dispose();
  mesh.geometry = geo;
}

export function createDanny() {
  const mesh = createPersonMesh(SHIRT, 1.82);
  return {
    mesh, x: 0, z: 0, heading: 0, speed: 0, phase: 0,
    down: false, downTimer: 0, shirt: SHIRT, height: 1.82,
  };
}

export function createPedestrian(random, x, z) {
  const shirt = PED_SHIRTS[Math.floor(random() * PED_SHIRTS.length)];
  const height = 1.65 + random() * 0.25;
  const mesh = createPersonMesh(shirt, height);
  return {
    mesh, x, z, heading: random() * Math.PI * 2, speed: 0.9 + random() * 0.7,
    phase: random() * 6, shirt, height,
    loop: null, loopIndex: 0, flee: 0, fleeX: 0, fleeZ: 0,
    down: false, downTimer: 0,
  };
}

// A rectangular sidewalk loop around one block, inset 2 m from the road edge.
export function makeSidewalkLoop(bx, bz) {
  const inset = 19.5;
  return [
    { x: bx - inset, z: bz - inset }, { x: bx + inset, z: bz - inset },
    { x: bx + inset, z: bz + inset }, { x: bx - inset, z: bz + inset },
  ];
}
