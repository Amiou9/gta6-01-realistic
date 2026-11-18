// The wanted level and the police who answer it. Cops chase what they can see, ram what
// they catch, and search the last place they saw you when you slip away; stay out of sight
// long enough and the heat fades one star at a time. Stand still in front of a patrol car
// and you get BUSTED.
import { POLICE, roadAt } from './config.js';
import { createCar, driveToward, collideBuildings, unstickStep, avoidCarsAhead } from './vehicles.js';

export function createPolice() {
  return {
    wanted: 0,
    lastSeen: { x: 0, z: 0 },
    sightTimer: 0,
    decayTimer: 0,
    bustTimer: 0,
    spawnTimer: 0,
    cars: [],
    searchTarget: null,
    searchTimer: 0,
  };
}

/** A crime the player just committed: the level rises and every cop knows where it happened. */
export function raiseWanted(world, amount) {
  const police = world.police;
  police.wanted = Math.min(5, police.wanted + amount);
  const p = world.playerPos();
  police.lastSeen = { x: p.x, z: p.z };
  police.sightTimer = 0;
  police.decayTimer = 0;
}

function spawnPoliceCar(world) {
  const p = world.playerPos();
  const spots = [];
  for (let i = 0; i < 8; i += 1) {
    for (let j = 0; j < 8; j += 1) {
      const x = roadAt(i);
      const z = roadAt(j);
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > 70 && d < 120) spots.push({ x, z });
    }
  }
  if (spots.length === 0) return;
  const spot = spots[Math.floor(world.rng() * spots.length)];
  const heading = Math.atan2(p.x - spot.x, p.z - spot.z);
  const car = createCar('sedan', spot.x, spot.z, heading, { police: true });
  car.top = 36;
  car.accel = 11;
  car.ramCooldown = 0;
  world.cars.push(car);
  world.police.cars.push(car);
  world.scene.add(car.group);
}

/** The intersection (0-7, 0-7) nearest a point on the road graph. */
function nodeOf(x, z) {
  return {
    i: Math.max(0, Math.min(7, Math.round((x + 245) / 70))),
    j: Math.max(0, Math.min(7, Math.round((z + 245) / 70))),
  };
}

/** A greedy Manhattan walk along the roads from one point to another: intersection
    waypoints, then the target itself. Roads are clear, so a patrol car following
    this never has to cut through a building to reach the player. */
function buildPath(world, fromX, fromZ, toX, toZ) {
  const a = nodeOf(fromX, fromZ);
  const b = nodeOf(toX, toZ);
  const pts = [];
  // First drive to the nearest intersection: the car can be up to half a
  // block away from it, and driving straight at the next waypoint from there
  // would cut diagonally across the block — and the buildings in it.
  const start = world.city.nodePos(a.i, a.j);
  pts.push({ x: start.x, z: start.z });
  let i = a.i;
  let j = a.j;
  let guard = 0;
  while ((i !== b.i || j !== b.j) && guard++ < 16) {
    if (Math.abs(b.i - i) >= Math.abs(b.j - j) && i !== b.i) i += Math.sign(b.i - i);
    else if (j !== b.j) j += Math.sign(b.j - j);
    else i += Math.sign(b.i - i);
    const n = world.city.nodePos(i, j);
    pts.push({ x: n.x, z: n.z });
  }
  pts.push({ x: toX, z: toZ });
  // If the cop is already on the road heading from the first waypoint to the
  // second (it drove past the first one between repaths), drop the passed
  // waypoint instead of sending it back to re-visit an intersection it has
  // already cleared — that U-turn is what wedged it on the buildings. This
  // runs after the target is appended, so it also drops the start node when
  // the whole path is just [start, target] and the cop is already there.
  while (pts.length >= 2) {
    const w0 = pts[0];
    const w1 = pts[1];
    const dx = w1.x - w0.x;
    const dz = w1.z - w0.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 ? ((fromX - w0.x) * dx + (fromZ - w0.z) * dz) / len2 : 0;
    const px = w0.x + dx * Math.max(0, Math.min(1, t));
    const pz = w0.z + dz * Math.max(0, Math.min(1, t));
    const perp = Math.hypot(fromX - px, fromZ - pz);
    if (t > 0.15 && perp < 10) pts.shift();
    else break;
  }
  return pts;
}

/** Snap a point to the nearest road centre line, so a search point never
    lands inside a block — a patrol car driving to it would cut across the
    buildings to get there. */
function snapToRoad(x, z) {
  let bestX = roadAt(0);
  let bestDX = Infinity;
  let bestZ = roadAt(0);
  let bestDZ = Infinity;
  for (let i = 0; i < 8; i++) {
    const dx = Math.abs(x - roadAt(i));
    if (dx < bestDX) { bestDX = dx; bestX = roadAt(i); }
    const dz = Math.abs(z - roadAt(i));
    if (dz < bestDZ) { bestDZ = dz; bestZ = roadAt(i); }
  }
  const clamp = (v) => Math.max(-245, Math.min(245, v));
  return bestDX <= bestDZ ? { x: bestX, z: clamp(z) } : { x: clamp(x), z: bestZ };
}

export function stepPolice(world, dt) {
  const police = world.police;
  const p = world.playerPos();
  const playerCar = world.player.inCar;

  // More stars, more patrol cars.
  police.spawnTimer -= dt;
  if (police.wanted > 0 && police.cars.length < Math.min(police.wanted, POLICE.maxCars) && police.spawnTimer <= 0) {
    spawnPoliceCar(world);
    police.spawnTimer = 2;
  }

  // Does any cop see the player right now?
  let seen = false;
  for (const car of police.cars) {
    if (Math.hypot(car.x - p.x, car.z - p.z) < POLICE.sightDist) { seen = true; break; }
  }
  if (seen) {
    police.lastSeen = { x: p.x, z: p.z };
    police.sightTimer = 0;
    police.decayTimer = 0;
  } else {
    police.sightTimer += dt;
  }

  // Out of sight long enough: the heat fades, one star at a time.
  if (police.wanted > 0 && police.sightTimer > POLICE.loseSightTime) {
    police.decayTimer += dt;
    if (police.decayTimer >= POLICE.decayStep) {
      police.decayTimer = 0;
      police.wanted -= 1;
      if (police.wanted === 0) {
        for (const car of police.cars) {
          world.scene.remove(car.group);
          const idx = world.cars.indexOf(car);
          if (idx >= 0) world.cars.splice(idx, 1);
        }
        police.cars = [];
        police.bustTimer = 0;
      }
    }
  }

  // Chase, search, ram — and the BUSTED clock when a patrol car corners the player.
  let busting = false;
  for (const car of police.cars) {
    if (car.ramCooldown > 0) car.ramCooldown -= dt;
    const dx = p.x - car.x;
    const dz = p.z - car.z;
    const dist = Math.hypot(dx, dz);
    const chasing = seen || dist < 40;
    const target = chasing ? { x: p.x, z: p.z } : (police.searchTarget || police.lastSeen);
    // On the same road as the player, the direct line is clear and a beeline is
    // safe; anywhere else, follow the road graph so the patrol car never cuts
    // through a building to reach the player.
    const cn = nodeOf(car.x, car.z);
    const pn = nodeOf(p.x, p.z);
    const sameRoad = chasing
      && ((cn.i === pn.i && Math.abs(car.x - p.x) < 10)
        || (cn.j === pn.j && Math.abs(car.z - p.z) < 10));
    // A cop that has arrived at its destination and is parked there is not
    // wedged — it is searching. Tell the unstick that, or it backs a parked
    // patrol car away from the spot it just reached.
    const arrived = !!car.path && car.pathIndex >= car.path.length;
    const trying = !((chasing && dist < 10) || arrived);
    if (!unstickStep(car, dt, trying)) {
      if (chasing && dist < 10) {
        // Brake to a stop beside the player: that is how an arrest happens.
        driveToward(car, p.x, p.z, -1, dt, car.top);
      } else if (sameRoad) {
        // Cap the approach speed inside 25 m so the patrol car arrives as a ram,
        // not a bulldozer that shoves the player's car off the road. Steer
        // around traffic in the way instead of shoving it into the buildings.
        const top = dist < 25 ? Math.max(10, dist * 0.6) : car.top;
        const [ax, az] = avoidCarsAhead(car, p.x, p.z, world.cars, playerCar);
        driveToward(car, ax, az, 1, dt, top);
      } else {
        car.repathTimer = (car.repathTimer || 0) - dt;
        if (!car.path || car.pathIndex >= car.path.length || car.repathTimer <= 0) {
          car.path = buildPath(world, car.x, car.z, target.x, target.z);
          car.pathIndex = 0;
          car.repathTimer = 3;
        }
        const wp = car.path[car.pathIndex];
        const accept = car.pathIndex < car.path.length - 1 ? 12 : 8;
        if (Math.hypot(wp.x - car.x, wp.z - car.z) < accept) {
          car.pathIndex += 1;
          if (car.pathIndex >= car.path.length) {
            // Arrived at the destination (last-known spot): coast to a stop
            // and look around. Without this the cop rebuilds the same
            // single-point path every frame, accepts it instantly, and never
            // drives — freezing mid-air with a stale speed.
            driveToward(car, car.x, car.z, -1, dt, car.top);
          }
        } else {
          // Race to the target at full speed; only cruise slowly once close
          // enough to be searching the area rather than closing in on it.
          const dTarget = Math.hypot(target.x - car.x, target.z - car.z);
          let top = dTarget > 30 ? car.top : car.top * 0.6;
          if (chasing) top = car.top;
          // Slow down before a sharp turn at the next intersection, or the
          // patrol car arrives too fast to make it and overshoots into the
          // buildings instead of following the road.
          const next = car.path[car.pathIndex + 1];
          if (next) {
            const dWp = Math.hypot(wp.x - car.x, wp.z - car.z);
            if (dWp < 35) {
              const a1 = Math.atan2(wp.x - car.x, wp.z - car.z);
              const a2 = Math.atan2(next.x - wp.x, next.z - wp.z);
              let turn = Math.abs(a2 - a1);
              if (turn > Math.PI) turn = 2 * Math.PI - turn;
              if (turn > 0.6) top = Math.min(top, 13);
            }
          }
          // Steer around traffic in the way instead of shoving it aside.
          const [ax, az] = avoidCarsAhead(car, wp.x, wp.z, world.cars, playerCar);
          driveToward(car, ax, az, 1, dt, top);
        }
      }
      if (!chasing && Math.hypot(target.x - car.x, target.z - car.z) < 10) {
        // Reached the last-known spot and found nobody: search somewhere nearby.
        police.searchTimer -= dt;
        if (police.searchTimer <= 0) {
          police.searchTimer = 4;
          police.searchTarget = snapToRoad(
            police.lastSeen.x + (world.rng() - 0.5) * 60,
            police.lastSeen.z + (world.rng() - 0.5) * 60,
          );
        }
      }
    }
    collideBuildings(car, world.colliders);
    // A ram: a patrol car that hits at speed shoves the player's car and wrecks it a
    // little. A patrol car that has already stopped beside the player is parking for an
    // arrest, not ramming — the BUSTED clock below is what it threatens with.
    if (dist < car.radius + 2.4 && car.speed > 3 && car.ramCooldown <= 0) {
      car.ramCooldown = 1.0;
      if (playerCar) {
        playerCar.health -= POLICE.ramDamage;
        playerCar.speed *= 0.6;
        world.events.push({ type: 'ram', x: p.x, z: p.z });
        if (playerCar.health <= 0 && !playerCar.disabled) {
          playerCar.disabled = true;
          world.events.push({ type: 'carDead', x: playerCar.x, z: playerCar.z });
        }
      } else {
        world.damagePlayer(6);
      }
    }
    // Cornered and still: a slow patrol car at arm's length is an arrest in progress.
    if (!playerCar && dist < POLICE.bustDist && car.speed < 4 && world.player.speed < 1) busting = true;
    if (playerCar && dist < POLICE.bustDist && Math.abs(playerCar.speed) < 1.5) busting = true;
  }
  if (busting) {
    police.bustTimer += dt;
    if (police.bustTimer >= POLICE.bustTime) {
      police.bustTimer = 0;
      world.events.push({ type: 'busted' });
    }
  } else {
    police.bustTimer = Math.max(0, police.bustTimer - dt * 2);
  }
}
