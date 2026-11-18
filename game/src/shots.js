// The screenshot scenes behind ?shot=chase|drive|street|mission. Each one
// starts a fresh game, scripts a short slice of real play (steal, drive,
// walk, deliver) with the real input and rules, then returns a camera that
// frames the action. The same seed always gives the same frame.
const STEP = 1 / 60;

function pressKey(code) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }));
}

function stepN(game, input, n) {
  for (let i = 0; i < n; i++) game.step(STEP, input);
}

function enterNearestCar(game, input) {
  pressKey('KeyE');
  stepN(game, input, 2);
}

export function stageShot(game, input, shot, seed) {
  game.startGame(false);
  const s = game.state;
  const d = game.danny;

  if (shot === 'chase') {
    // Mission 4, wanted 3, red Veloce GT tearing down Main Ave.
    game.startMission(3);
    s.missionTimer = 143; // 2:23 left
    game.teleport(-120, -24);
    d.heading = 0; // south, down Main Ave
    const car = game.giveCar('coupe');
    car.x = -117; car.z = -24; car.heading = 0;
    enterNearestCar(game, input);
    // Two patrol cars right behind, already on the chase.
    const cops = game.cars.filter((c) => c.police);
    cops.forEach((c, i) => {
      c.x = -120; c.z = -24 - (10 + i * 12);
      c.heading = 0; c.speed = 28;
      c.route = game.city.findPath(game.city.nearestNode(c.x, c.z), game.city.nearestNode(d.x, d.z));
      c.routeIndex = 0; c.repathTimer = 2;
    });
    input.held.up = true;
    stepN(game, input, 150); // ~2.5 s of driving — cops still close behind
    input.held.up = false;
    const cx = d.x, cz = d.z;
    // Front three-quarter from the road, car large in frame.
    return { pos: [cx - 11, 5, cz + 12], look: [cx, 1.2, cz - 3] };
  }

  if (shot === 'drive') {
    // Mission 1: the Meridian S on Sunset Ave, three-quarter rear view.
    s.missionTimer = 131; // 2:11 left
    game.teleport(-72, 60);
    d.heading = Math.PI; // north
    const car = game.giveCar('sedan');
    car.x = -72; car.z = 60; car.heading = Math.PI;
    enterNearestCar(game, input);
    input.held.up = true;
    stepN(game, input, 180); // ~3 s of driving
    input.held.up = false;
    const cx = d.x, cz = d.z;
    // Three-quarter rear, whole car in frame with the street ahead.
    return { pos: [cx + 4, 4, cz + 10], look: [cx, 1.2, cz - 3] };
  }

  if (shot === 'street') {
    // On foot on Sunset Ave, looking north down the street: Danny from
    // behind, a yellow taxi ahead on the road, buildings on both sides.
    // Camera stays on the road behind him, so the view runs down the
    // street instead of into a building face.
    game.teleport(-72, 150);
    d.heading = Math.PI; // facing north, up the avenue
    const taxi = game.giveCar('taxi');
    taxi.x = -72; taxi.z = 130; taxi.heading = Math.PI;
    stepN(game, input, 30);
    return { pos: [-72, 3.5, 162], look: [-72, 1.5, 128] };
  }

  if (shot === 'mission') {
    // Mission 1 done: the sedan at the garage, JOB DONE toast, $750 in hand.
    game.setCash(750);
    s.jobsDone = 1;
    game.startMission(1); // THE PACKAGE
    s.missionTimer = 198; // 3:18 left
    s.toast = 'JOB DONE +$500';
    s.toastUntil = s.time + 10;
    game.teleport(114, 164);
    d.heading = Math.PI / 2;
    const car = game.giveCar('sedan');
    car.x = 122; car.z = 158; car.heading = Math.PI / 2;
    stepN(game, input, 10);
    // Danny beside the sedan (not blocking it), garage behind.
    return { pos: [110, 3.2, 171], look: [124, 1.2, 157] };
  }

  // Fallback: title-style orbit frame.
  return null;
}
