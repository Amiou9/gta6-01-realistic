// Keyboard and mouse input. Held keys give movement; one-shot presses (enter a car, punch,
// reload, pause, camera, mute) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice.
export const ACTION_ENTER = 1;
export const ACTION_PUNCH = 2;
export const ACTION_RELOAD = 4;
export const ACTION_PAUSE = 8;
export const ACTION_CAMERA = 16;
export const ACTION_MUTE = 32;
export const ACTION_CONFIRM = 64;
export const ACTION_SHOOT = 128;

const MOVE = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, shift: false, space: false };
  let actions = 0;
  let mouseDown = false;

  window.addEventListener('keydown', (event) => {
    const move = MOVE[event.code];
    if (move) { held[move] = true; event.preventDefault(); return; }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') { held.shift = true; return; }
    if (event.code === 'Space') { held.space = true; event.preventDefault(); return; }
    if (event.repeat) return;
    if (event.code === 'KeyE') actions |= ACTION_ENTER;
    else if (event.code === 'KeyF') actions |= ACTION_PUNCH;
    else if (event.code === 'KeyR') actions |= ACTION_RELOAD;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyC') actions |= ACTION_CAMERA;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    else if (event.code === 'Enter') actions |= ACTION_CONFIRM;
  });
  window.addEventListener('keyup', (event) => {
    const move = MOVE[event.code];
    if (move) held[move] = false;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.shift = false;
    if (event.code === 'Space') held.space = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.up = held.down = held.left = held.right = held.shift = held.space = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      // The pistol is semi-automatic: one press, one shot. Queue it as a
      // one-shot action like the other presses, so holding the button does
      // not re-fire every frame (at a low frame rate the 0.18 s cooldown
      // expires within a single frame and one click would spend two rounds).
      actions |= ACTION_SHOOT;
    }
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouseDown = false;
  });

  return {
    held,
    get mouseDown() { return mouseDown; },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
