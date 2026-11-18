// People: Danny Reyes on foot, and the pedestrians who walk the sidewalks, flee gunfire and
// get knocked down by careless driving. A person is one merged torso-and-head mesh plus two
// legs that swing while they walk.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { mergeGeometries, box } from './geom.js';
import { isLand, collideBuildings } from './vehicles.js';

const SKINS = [[0.85, 0.65, 0.5], [0.72, 0.52, 0.38], [0.55, 0.4, 0.3], [0.9, 0.72, 0.58]];
const SHIRTS = [[0.35, 0.42, 0.5], [0.5, 0.38, 0.32], [0.42, 0.48, 0.38], [0.55, 0.5, 0.42], [0.3, 0.35, 0.45], [0.6, 0.55, 0.48]];
const PANTS = [[0.2, 0.22, 0.28], [0.3, 0.28, 0.25], [0.25, 0.25, 0.3]];

function personMesh(shirt, pants, skin, cap) {
  const parts = [
    box(0.52, 0.68, 0.3, 0, 1.14, 0, 0, shirt), // torso
    box(0.14, 0.55, 0.14, -0.34, 1.1, 0, 0, shirt), // arms
    box(0.14, 0.55, 0.14, 0.34, 1.1, 0, 0, shirt),
  ];
  const headGeo = new THREE.SphereGeometry(0.17, 10, 8);
  headGeo.translate(0, 1.66, 0);
  parts.push({ geo: headGeo, matrix: new THREE.Matrix4(), color: skin });
  if (cap) parts.push(box(0.36, 0.1, 0.36, 0, 1.82, 0, 0, cap));
  const body = new THREE.Mesh(
    mergeGeometries(parts),
    new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: true }),
  );
  body.castShadow = true;
  const legGeo = new THREE.BoxGeometry(0.19, 0.82, 0.19);
  legGeo.translate(0, -0.41, 0);
  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(pants[0], pants[1], pants[2]), roughness: 0.9 });
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.13, 0.82, 0);
  legL.castShadow = true;
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.13, 0.82, 0);
  legR.castShadow = true;
  const group = new THREE.Group();
  group.add(body);
  group.add(legL);
  group.add(legR);
  return { group, legL, legR };
}

export function createPlayer(x, z) {
  const { group, legL, legR } = personMesh([0.16, 0.16, 0.2], [0.2, 0.24, 0.32], SKINS[0], [0.2, 0.2, 0.22]);
  // Danny's pistol, held low in his right hand.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.12, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.7 }),
  );
  gun.position.set(0.4, 0.85, 0.18);
  group.add(gun);
  group.position.set(x, 0, z);
  return {
    x, z, heading: Math.PI, speed: 0, walkPhase: 0,
    health: PLAYER.health, ammo: PLAYER.magSize, reloading: 0, shootCooldown: 0,
    punchCooldown: 0, lastDamage: -99, down: false,
    group, legL, legR, inCar: null, radius: 0.5,
  };
}

export function createPedestrian(x, z, rng, block) {
  const shirt = SHIRTS[Math.floor(rng() * SHIRTS.length)];
  const pants = PANTS[Math.floor(rng() * PANTS.length)];
  const skin = SKINS[Math.floor(rng() * SKINS.length)];
  const { group, legL, legR } = personMesh(shirt, pants, skin, null);
  group.position.set(x, 0, z);
  return {
    x, z, heading: rng() * Math.PI * 2, speed: 1.2 + rng() * 0.6, walkPhase: rng() * 6,
    health: 60, state: 'walk', stateTimer: 0, block,
    waypoint: 0, group, legL, legR, radius: 0.5,
  };
}

/** Walk a block's sidewalk perimeter, corner to corner. */
function pedWaypoints(block) {
  const [cx, cz] = block;
  const r = 30;
  return [
    { x: cx - r, z: cz - r }, { x: cx + r, z: cz - r },
    { x: cx + r, z: cz + r }, { x: cx - r, z: cz + r },
  ];
}

export function stepPedestrian(ped, dt, world) {
  if (ped.state === 'down') {
    ped.stateTimer -= dt;
    if (ped.stateTimer <= 0) {
      ped.state = 'flee';
      ped.stateTimer = 3;
      ped.group.rotation.x = 0;
    }
    return;
  }
  let target;
  let speed = ped.speed;
  if (ped.state === 'flee') {
    ped.stateTimer -= dt;
    const dx = ped.x - world.threatX;
    const dz = ped.z - world.threatZ;
    const d = Math.hypot(dx, dz) || 1;
    target = { x: ped.x + (dx / d) * 10, z: ped.z + (dz / d) * 10 };
    speed = 4.2;
    if (ped.stateTimer <= 0) ped.state = 'walk';
  } else {
    const points = pedWaypoints(ped.block);
    target = points[ped.waypoint];
    if (Math.hypot(target.x - ped.x, target.z - ped.z) < 1.5) ped.waypoint = (ped.waypoint + 1) % 4;
  }
  const dx = target.x - ped.x;
  const dz = target.z - ped.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.05) {
    const want = Math.atan2(dx, dz);
    let diff = want - ped.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ped.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
    ped.x += Math.sin(ped.heading) * speed * dt;
    ped.z += Math.cos(ped.heading) * speed * dt;
    ped.walkPhase += dt * speed * 2.4;
  }
  // Stay on the sidewalks: never step into the bay.
  if (!isLand(ped.x, ped.z)) {
    ped.x -= Math.sin(ped.heading) * speed * dt;
    ped.z -= Math.cos(ped.heading) * speed * dt;
    ped.heading += Math.PI;
  }
}

/** Danny on foot: camera-relative movement, the body turns toward where he walks. */
export function stepPlayerOnFoot(player, input, cameraYaw, dt, world) {
  const fx = Math.sin(cameraYaw);
  const fz = Math.cos(cameraYaw);
  const rx = Math.cos(cameraYaw);
  const rz = -Math.sin(cameraYaw);
  let mx = 0;
  let mz = 0;
  if (input.held.up) { mx += fx; mz += fz; }
  if (input.held.down) { mx -= fx; mz -= fz; }
  if (input.held.left) { mx -= rx; mz -= rz; }
  if (input.held.right) { mx += rx; mz += rz; }
  const moving = Math.hypot(mx, mz) > 0.01;
  const targetSpeed = moving ? (input.held.shift ? PLAYER.runSpeed : PLAYER.walkSpeed) : 0;
  player.speed += (targetSpeed - player.speed) * Math.min(1, dt * 10);
  if (moving) {
    const want = Math.atan2(mx, mz);
    let diff = want - player.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    player.heading += Math.max(-8 * dt, Math.min(8 * dt, diff));
    const ox = player.x;
    const oz = player.z;
    player.x += Math.sin(player.heading) * player.speed * dt;
    player.z += Math.cos(player.heading) * player.speed * dt;
    if (!isLand(player.x, player.z)) {
      // Slide along the map edge instead of being pinned against it.
      if (isLand(player.x, oz)) player.z = oz;
      else if (isLand(ox, player.z)) player.x = ox;
      else { player.x = ox; player.z = oz; }
    }
    if (collideBuildings(player, world.colliders)) { player.x = ox; player.z = oz; }
    player.walkPhase += dt * player.speed * 2.2;
  }
  // Health comes back once the shooting stops.
  if (world.time - player.lastDamage > PLAYER.regenDelay && player.health < PLAYER.health) {
    player.health = Math.min(PLAYER.health, player.health + PLAYER.regenRate * dt);
  }
  if (player.shootCooldown > 0) player.shootCooldown -= dt;
  if (player.punchCooldown > 0) player.punchCooldown -= dt;
  if (player.reloading > 0) {
    player.reloading -= dt;
    if (player.reloading <= 0) player.ammo = PLAYER.magSize;
  }
}

/** A punch: the nearest person or police car in front of Danny takes the hit. */
export function tryPunch(player, world) {
  if (player.punchCooldown > 0 || player.inCar) return;
  player.punchCooldown = 0.45;
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  let best = null;
  let bestD = PLAYER.punchRange;
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - player.x;
    const dz = ped.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < bestD && dx * fx + dz * fz > 0) { best = ped; bestD = d; }
  }
  if (best) {
    best.state = 'down';
    best.stateTimer = 6;
    best.group.rotation.x = Math.PI / 2 - 0.2;
    world.events.push({ type: 'punch', x: best.x, z: best.z });
    world.raiseWanted(1, 'assault');
    return;
  }
  for (const car of world.cars) {
    if (car.police) continue;
    const dx = car.x - player.x;
    const dz = car.z - player.z;
    if (Math.hypot(dx, dz) < 3 && dx * fx + dz * fz > 0) {
      world.events.push({ type: 'punch', x: car.x, z: car.z });
      return;
    }
  }
}

/** One pistol shot down the crosshair: the nearest person or car the ray meets takes 34. */
export function tryShoot(player, camera, dt, world) {
  if (player.shootCooldown > 0 || player.reloading > 0 || player.inCar || player.ammo <= 0) return;
  player.shootCooldown = 0.18;
  player.ammo -= 1;
  const origin = camera.position.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const muzzle = new THREE.Vector3(player.x + Math.sin(player.heading) * 0.5, 1.3, player.z + Math.cos(player.heading) * 0.5);
  let hitPoint = origin.clone().add(dir.clone().multiplyScalar(70));
  let bestT = 70;
  let bestTarget = null;
  function testSphere(cx, cy, cz, r, target) {
    const ox = cx - origin.x;
    const oy = cy - origin.y;
    const oz = cz - origin.z;
    const t = ox * dir.x + oy * dir.y + oz * dir.z;
    if (t < 0 || t > bestT) return;
    const px = origin.x + dir.x * t - cx;
    const py = origin.y + dir.y * t - cy;
    const pz = origin.z + dir.z * t - cz;
    if (px * px + py * py + pz * pz < r * r) {
      bestT = t;
      bestTarget = target;
      hitPoint = origin.clone().add(dir.clone().multiplyScalar(t));
    }
  }
  for (const ped of world.peds) {
    if (ped.state !== 'down') testSphere(ped.x, 1.2, ped.z, 0.7, { kind: 'ped', ref: ped });
  }
  for (const car of world.cars) {
    testSphere(car.x, 1, car.z, car.radius, { kind: 'car', ref: car });
  }
  if (bestTarget) {
    if (bestTarget.kind === 'ped') {
      const ped = bestTarget.ref;
      ped.health -= PLAYER.pistolDamage;
      if (ped.health <= 0) {
        ped.state = 'down';
        ped.stateTimer = 8;
        ped.group.rotation.x = Math.PI / 2 - 0.2;
      } else {
        ped.state = 'flee';
        ped.stateTimer = 4;
        world.threatX = player.x;
        world.threatZ = player.z;
      }
      world.raiseWanted(1, 'shooting');
    } else {
      const car = bestTarget.ref;
      car.health -= PLAYER.pistolDamage;
      if (car.health <= 0 && !car.disabled) {
        car.disabled = true;
        world.events.push({ type: 'carDead', x: car.x, z: car.z });
      }
      if (car.police) world.raiseWanted(2, 'police');
    }
  }
  world.events.push({ type: 'shot', from: muzzle, to: hitPoint });
}

export function damagePlayer(player, amount, world) {
  player.health -= amount;
  player.lastDamage = world.time;
  if (player.health <= 0) {
    player.health = 0;
    world.events.push({ type: 'wasted' });
  }
}

/** Sync a person's mesh: position, heading, leg swing, and the downed pose. */
export function updatePersonVisual(person, dt) {
  person.group.position.set(person.x, 0, person.z);
  person.group.rotation.y = person.heading;
  const swing = Math.sin(person.walkPhase) * 0.55 * Math.min(1, person.speed / 3);
  person.legL.rotation.x = swing;
  person.legR.rotation.x = -swing;
}
