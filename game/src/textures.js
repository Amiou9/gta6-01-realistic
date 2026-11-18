// Procedural textures, drawn on canvas at boot: brick, concrete and glass facades (tiled
// across each building so the windows stay crisp), sun glitter for the bay, and the
// golden-hour sky gradient. No image ever leaves this folder.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** One tileable facade patch: a 4-wide, 6-tall window grid over a wall of `base` colour. */
function facadePatch(base, mortar, litRatio, rng) {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  // Wall texture: faint horizontal courses and speckle, so flat colour never reads flat.
  g.fillStyle = mortar;
  for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 256, 1);
  for (let i = 0; i < 400; i += 1) {
    g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)';
    g.fillRect(Math.floor(rng() * 256), Math.floor(rng() * 256), 3, 3);
  }
  // Windows: 4 columns, 6 rows; some glow warm, the rest dark glass.
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const x = 14 + col * 64;
      const y = 12 + row * 42;
      const lit = rng() < litRatio;
      g.fillStyle = lit ? '#ffca7a' : '#2e3d46';
      g.fillRect(x, y, 36, 26);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x, y, 36, 4);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 2;
      g.strokeRect(x, y, 36, 26);
    }
  }
  return toTexture(c);
}

export function makeFacadeTextures(rng) {
  return {
    brick: facadePatch('#8a5a44', '#5f3d2e', 0.34, rng),
    concrete: facadePatch('#9a938a', '#7d766c', 0.3, rng),
    glass: facadePatch('#51707f', '#3c5563', 0.42, rng),
  };
}

/** Soft white streaks on transparent ground: scrolled slowly, it reads as sun glitter. */
export function makeWaterTexture(rng) {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i += 1) {
    const x = rng() * 256;
    const y = rng() * 256;
    const len = 12 + rng() * 42;
    g.fillStyle = `rgba(255,236,200,${0.05 + rng() * 0.16})`;
    g.fillRect(x, y, len, 2);
  }
  return toTexture(c);
}

/** Golden-hour sky: warm horizon fading to blue overhead. */
export function makeSkyTexture() {
  const c = canvas(16, 512);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#5f8fc4');
  grad.addColorStop(0.45, '#9db8d4');
  grad.addColorStop(0.72, '#f6c98f');
  grad.addColorStop(1, '#f2a96a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 512);
  return toTexture(c);
}
