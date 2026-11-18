// MERIDIAN BAY — configuration: city layout, vehicles, missions, tuning.
// All numbers are in metres / seconds; the city is a 7x7 block grid with the
// bay to the south (positive z). Nothing here is read from any other build.
export const SAVE_KEY = 'meridian-bay-save-v1';

// City geometry: roads 12 m wide, blocks 36 m, pitch 48 m. Roads are centred on
// the values below; the drivable city spans -174..174 on both axes.
export const ROAD_W = 12;
export const BLOCK = 36;
export const PITCH = 48;
export const ROADS = [-168, -120, -72, -24, 24, 72, 120, 168];
export const CITY_MIN = -174;
export const CITY_MAX = 174;
export const BAY_Z = 174; // water starts here
export const WATER_Z = 360; // water ends here
export const PIER_X = 0; // pier centre x
export const PIER_HALF = 5;
export const PIER_END_Z = 318;
export const DOCKS = { minX: -240, maxX: -180, minZ: 180, maxZ: 280 };

export const AVENUES = ['Harbor Ave', 'Main Ave', 'Sunset Ave', 'Palm Ave', 'Bayview Ave', 'Ocean Ave', 'Pier Ave', 'Marina Ave'];
export const STREETS = ['Dock St', 'Market St', 'Canal St', 'Union St', 'Elm St', 'Cedar St', 'Willow St', 'Beach St'];

// Stealable cars. accel in m/s^2, top in m/s, grip scales steering.
export const CAR_TYPES = {
  sedan: { name: 'Meridian S', color: 0x8a8f96, len: 4.4, width: 1.9, accel: 14, top: 32, grip: 1.0 },
  taxi: { name: 'Bay Cab', color: 0xe8b400, len: 4.4, width: 1.9, accel: 13, top: 30, grip: 1.0, taxi: true },
  coupe: { name: 'Veloce GT', color: 0x9e1b1b, len: 4.2, width: 1.9, accel: 18, top: 42, grip: 1.15 },
  pickup: { name: 'Rancher', color: 0x3f6b4f, len: 5.0, width: 2.0, accel: 12, top: 30, grip: 0.9, pickup: true },
  van: { name: 'Cargo Van', color: 0xd8d3c8, len: 5.2, width: 2.1, accel: 10, top: 27, grip: 0.85, van: true },
};
export const CAR_ORDER = ['sedan', 'taxi', 'coupe', 'pickup', 'van'];

// Missions: chained, each with a timer (seconds) and a cash reward.
export const MISSIONS = [
  { id: 1, name: 'FIRST JOB', brief: 'Steal a car and take it to the garage on Beach St.', reward: 500, time: 150, target: { x: 144, z: 168, r: 7, label: 'Garage' } },
  { id: 2, name: 'THE PACKAGE', brief: 'Pick up the package at the end of the pier, then deliver it to the Harbor Hotel.', reward: 800, time: 200, target: { x: 0, z: 300, r: 5, label: 'Pier pickup' }, target2: { x: 96, z: 168, r: 7, label: 'Harbor Hotel' } },
  { id: 3, name: 'HEAT', brief: 'The cops are all over you. Lose the heat — get wanted down to zero.', reward: 1000, time: 240, wanted: 3 },
  { id: 4, name: 'THE GETAWAY', brief: 'Reach the dock warehouse while the heat is on you. Wanted stays at 3.', reward: 2500, time: 220, target: { x: -210, z: 236, r: 7, label: 'Dock warehouse' }, wanted: 3 },
];

export const PLAYER = {
  startX: 0, startZ: 150, // on the sidewalk of Beach St, near Main Ave
  walk: 5.5, run: 8.5, radius: 0.55,
  health: 100, regenDelay: 6, regenRate: 8,
  punchDamage: 25, punchRange: 2.2, punchCooldown: 0.45,
  pistolDamage: 34, pistolRange: 60, magSize: 12, reloadTime: 1.6,
};

export const WANTED = {
  steal: 1, assault: 1, shoot: 1, hitPolice: 2,
  decaySeconds: 6, // one star per this long with no cop in range
  copSightRange: 60,
  bustDistance: 4, bustStillSeconds: 3,
};

export const TRAFFIC_COUNT = 14;
export const PARKED_COUNT = 8;
export const PED_COUNT = 14;

export const CLOCK_START_MINUTES = 17 * 60 + 35; // 17:35
export const CLOCK_RATE = 0.25; // game minutes per real second

export const START_CASH = 250;
export const HOSPITAL = { x: -144, z: -168 }; // respawn point, in front of the hospital
