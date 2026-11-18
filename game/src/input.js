// Keyboard + mouse input. `held` is the live key state; `pressed` fires once
// per keydown (edge-triggered) so a pistol tap is one shot, never a held burst.
// Actions are consumed by the game each step via take().
const KEYMAP = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  enter: ['KeyE'],
  punch: ['KeyF'],
  reload: ['KeyR'],
  handbrake: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  camera: ['KeyC'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
  confirm: ['Enter', 'Space'],
};

export const ACTION_SHOOT = 'shoot';
export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, enter: false, punch: false, reload: false, handbrake: false, sprint: false, camera: false, pause: false, mute: false, confirm: false };
  const pressed = new Set();
  const byCode = {};
  for (const [name, codes] of Object.entries(KEYMAP)) {
    for (const code of codes) byCode[code] = name;
  }

  function onKeyDown(e) {
    const name = byCode[e.code];
    if (!name) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) pressed.add(name);
    held[name] = true;
  }
  function onKeyUp(e) {
    const name = byCode[e.code];
    if (name) held[name] = false;
  }
  function onMouseDown(e) {
    if (e.button === 0) pressed.add(ACTION_SHOOT);
  }
  function onBlur() {
    for (const k of Object.keys(held)) held[k] = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', onMouseDown);

  return {
    held,
    // True once for each press since the last call; also clears the set.
    take(action) {
      if (pressed.has(action)) {
        pressed.delete(action);
        return true;
      }
      return false;
    },
    has(action) {
      return pressed.has(action);
    },
    clear() {
      pressed.clear();
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousedown', onMouseDown);
    },
  };
}
