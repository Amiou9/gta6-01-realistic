// The story: four jobs for Marta Solano, chained. Steal a car for the garage, run a package
// across town, lose the heat it brings, then one last getaway to the docks. A missed timer
// costs nothing but the job itself — it starts again.
import { MISSIONS } from './config.js';

export function createMissions() {
  return {
    index: 0,
    done: 0,
    phase: 'toMarker',
    timer: MISSIONS[0].time,
    hasPackage: false,
    toast: null,
    storyDone: false,
  };
}

function toast(missions, text) {
  missions.toast = { text, until: 4 };
}

function completeJob(missions, world) {
  const def = MISSIONS[missions.index];
  world.cash += def.reward;
  missions.done += 1;
  toast(missions, `JOB DONE  +$${def.reward}`);
  world.events.push({ type: 'jobDone', reward: def.reward });
  missions.index += 1;
  missions.hasPackage = false;
  if (missions.index >= MISSIONS.length) {
    missions.storyDone = true;
    missions.phase = 'done';
    world.events.push({ type: 'storyDone' });
    return;
  }
  const next = MISSIONS[missions.index];
  missions.timer = next.time;
  if (missions.index === 1) {
    missions.phase = 'toPickup';
  } else if (missions.index === 2) {
    missions.phase = 'loseHeat';
    world.setWanted(2);
  } else {
    missions.phase = 'toMarker';
    world.setWanted(next.wanted || 0);
  }
}

function failJob(missions, world) {
  const def = MISSIONS[missions.index];
  toast(missions, 'Too slow — the job is still open. Try again.');
  missions.timer = def.time;
  if (missions.index === 1) {
    missions.phase = 'toPickup';
    missions.hasPackage = false;
  }
}

/** The marker the HUD and the minimap point at, or null when there is none. */
export function currentMarker(missions) {
  if (missions.storyDone) return null;
  const def = MISSIONS[missions.index];
  if (missions.index === 1) return missions.phase === 'toPickup' ? def.pickup : def.marker;
  if (missions.index === 2) return null;
  return def.marker;
}

export function objectiveText(missions) {
  if (missions.storyDone) return 'Story complete — Meridian Bay is yours. Free roam.';
  const def = MISSIONS[missions.index];
  if (missions.index === 1 && missions.phase === 'toPickup') return 'Pick up the package at the pier';
  if (missions.index === 2) return 'Lose the heat — wanted level to zero';
  return def.text;
}

export function stepMissions(missions, world, dt) {
  if (missions.toast) {
    missions.toast.until -= dt;
    if (missions.toast.until <= 0) missions.toast = null;
  }
  if (missions.storyDone) return;
  const def = MISSIONS[missions.index];
  const p = world.playerPos();
  if (missions.timer > 0) {
    missions.timer -= dt;
    if (missions.timer <= 0) {
      failJob(missions, world);
      return;
    }
  }
  if (missions.index === 0 || missions.index === 3) {
    const marker = def.marker;
    const d = Math.hypot(p.x - marker.x, p.z - marker.z);
    if (d < 9) {
      if (!world.player.inCar && def.needCar) {
        toast(missions, 'You need a car for this job.');
        missions.timer = Math.max(missions.timer, 5);
      } else {
        completeJob(missions, world);
      }
    }
  } else if (missions.index === 1) {
    if (missions.phase === 'toPickup') {
      const d = Math.hypot(p.x - def.pickup.x, p.z - def.pickup.z);
      if (d < 4) {
        missions.hasPackage = true;
        missions.phase = 'deliver';
        toast(missions, 'Package collected — deliver it to the Harbor Hotel.');
      }
    } else {
      const d = Math.hypot(p.x - def.marker.x, p.z - def.marker.z);
      if (d < 9) completeJob(missions, world);
    }
  } else if (missions.index === 2) {
    if (world.police.wanted === 0) completeJob(missions, world);
  }
}
