// Meridian Bay: every number the city, the cars, the police and the missions share.
// The city is a grid: 8 roads each way, 56 m blocks, 14 m roads, the bay along the south edge.
export const CITY = {
  pitch: 70,
  roadWidth: 14,
  block: 56,
  roads: 8,
  half: 252,
  waterZ: 252,
  lane: 3.5,
  seed: 1,
};

/** Centre line of road `i` (0..7), in metres, on either axis. */
export const roadAt = (i) => (i - 3.5) * CITY.pitch;
/** Centre of block `i` (0..6), in metres, on either axis. */
export const blockAt = (i) => (i - 3) * CITY.pitch;

export const AVENUES = ['Coral Ave', 'Palm Ave', 'Cedar Ave', 'Main Ave', 'Ocean Ave', 'Sunset Ave', 'Harbor Ave', 'Marina Ave'];
export const STREETS = ['North St', 'Elm St', 'Vine St', 'Market St', 'Front St', 'Beach St', 'Pier St', 'Shore St'];

/** The street a position stands on, for the HUD. */
export function streetNameAt(x, z) {
  let best = null;
  let bestD = 7;
  for (let i = 0; i < 8; i += 1) {
    const dx = Math.abs(x - roadAt(i));
    if (dx < bestD) { bestD = dx; best = AVENUES[i]; }
    const dz = Math.abs(z - roadAt(i));
    if (dz < bestD) { bestD = dz; best = STREETS[i]; }
  }
  return best ?? 'Meridian Bay';
}

// Muted, natural palette: asphalt, concrete, brick, glass, bay water, golden-hour sky.
export const PALETTE = {
  asphalt: 0x47474b,
  concrete: 0xb3ada1,
  lot: 0x9d968a,
  sidewalk: 0xbcb6aa,
  water: 0x1d4b5c,
  skyTop: 0x6f9fd0,
  skyHorizon: 0xf6c98f,
  fog: 0xeec39a,
  sun: 0xffd9a8,
  brick: 0x8a5a44,
  brickDark: 0x6e4636,
  concreteWall: 0x9a938a,
  glass: 0x51707f,
  roof: 0x4f4a44,
  grass: 0x6d7f4e,
};

export const CAR_TYPES = {
  sedan: { name: 'Meridian S', color: 0x8fa3b5, len: 4.4, width: 1.9, accel: 9, top: 32, grip: 1.0, cabin: 0.55 },
  taxi: { name: 'Bay Cab', color: 0xf2b705, len: 4.4, width: 1.9, accel: 9.5, top: 30, grip: 1.0, cabin: 0.55, taxi: true },
  coupe: { name: 'Veloce GT', color: 0xa8232a, len: 4.2, width: 1.85, accel: 12, top: 40, grip: 0.82, cabin: 0.48 },
  pickup: { name: 'Rancher', color: 0x2f5233, len: 4.9, width: 2.0, accel: 7.5, top: 27, grip: 1.12, cabin: 0.6, pickup: true },
  van: { name: 'Cargo Van', color: 0xe8e6df, len: 5.1, width: 2.0, accel: 6.5, top: 25, grip: 1.25, cabin: 0.85, van: true },
};
export const CAR_TYPE_KEYS = ['sedan', 'taxi', 'coupe', 'pickup', 'van'];

export const PLAYER = {
  walkSpeed: 4.2,
  runSpeed: 7.2,
  health: 100,
  regenDelay: 6,
  regenRate: 4,
  punchDamage: 25,
  punchRange: 2.3,
  pistolDamage: 34,
  magSize: 12,
  reloadTime: 1.6,
  startCash: 250,
};

export const POLICE = {
  maxCars: 5,
  spawnDist: 80,
  ramDamage: 6,
  bustDist: 6,
  bustTime: 3,
  sightDist: 70,
  loseSightTime: 10,
  decayStep: 6,
};

export const MISSIONS = [
  {
    title: 'First Job',
    text: 'Steal a car and bring it to the garage on North St.',
    reward: 500, time: 150,
    marker: { x: 0, z: -245 },
    needCar: true,
  },
  {
    title: 'The Package',
    text: 'Pick up the package at the pier, then deliver it to the Harbor Hotel.',
    reward: 800, time: 200,
    pickup: { x: 0, z: 305 },
    marker: { x: 210, z: -35 },
    needCar: false,
  },
  {
    title: 'Heat',
    text: 'The drop went loud. Lose the heat — get the wanted level to zero.',
    reward: 1000, time: 0,
    marker: null,
    needCar: false,
  },
  {
    title: 'The Getaway',
    text: 'Last run: drive to the dock warehouse while the whole city is after you.',
    reward: 2500, time: 220,
    marker: { x: -205, z: 268 },
    needCar: true,
    wanted: 3,
  },
];

export const SAVE_KEY = 'meridian-bay-save-v1';
export const STEP = 1 / 60;
