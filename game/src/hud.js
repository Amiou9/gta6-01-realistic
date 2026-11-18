// The HUD: cash and wanted stars, the mission objective, health, speed and ammo, the street
// name and the game clock, the damage vignette, and a live minimap drawn on a 2D canvas —
// roads, buildings, the bay, the player's car, the police and the mission marker.
import { streetNameAt } from './config.js';

const MAP = { minX: -260, maxX: 260, minZ: -260, maxZ: 340, size: 190 };
const SCALE = MAP.size / (MAP.maxZ - MAP.minZ);
const OFFX = (MAP.size - (MAP.maxX - MAP.minX) * SCALE) / 2;

function mapX(x) { return OFFX + (x - MAP.minX) * SCALE; }
function mapZ(z) { return (z - MAP.minZ) * SCALE; }

export function createHud() {
  const el = (id) => document.getElementById(id);
  const cashEl = el('cash');
  const starsEl = el('stars');
  const objTitle = el('obj-title');
  const objText = el('obj-text');
  const objTimer = el('obj-timer');
  const healthBar = el('health-bar');
  const speedEl = el('speed');
  const ammoEl = el('ammo');
  const streetEl = el('street');
  const clockEl = el('clock');
  const crosshair = el('crosshair');
  const toastEl = el('toast');
  const vignette = el('vignette');
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');
  const cache = {};
  let staticMap = null;

  function setText(node, key, value) {
    if (cache[key] !== value) {
      cache[key] = value;
      node.textContent = value;
    }
  }

  function buildStaticMap(colliders) {
    staticMap = document.createElement('canvas');
    staticMap.width = MAP.size;
    staticMap.height = MAP.size;
    const g = staticMap.getContext('2d');
    g.fillStyle = '#23282e';
    g.fillRect(0, 0, MAP.size, MAP.size);
    g.fillStyle = '#1d4b5c';
    g.fillRect(0, mapZ(252), MAP.size, MAP.size - mapZ(252));
    g.fillStyle = '#3a3f45';
    g.fillRect(0, 0, MAP.size, mapZ(252));
    g.strokeStyle = '#6f7076';
    g.lineWidth = 4.4;
    for (let i = 0; i < 8; i += 1) {
      const c = -245 + i * 70;
      g.beginPath();
      g.moveTo(mapX(c), 0);
      g.lineTo(mapX(c), mapZ(252));
      g.stroke();
      g.beginPath();
      g.moveTo(0, mapZ(c));
      g.lineTo(MAP.size, mapZ(c));
      g.stroke();
    }
    g.fillStyle = '#2a2e33';
    for (const b of colliders) {
      g.fillRect(mapX(b.minX), mapZ(b.minZ), (b.maxX - b.minX) * SCALE, (b.maxZ - b.minZ) * SCALE);
    }
    g.fillStyle = '#4a4640';
    g.fillRect(mapX(-5), mapZ(252), 10 * SCALE, (330 - 252) * SCALE);
    g.fillRect(mapX(-235), mapZ(252), 64 * SCALE, 34 * SCALE);
  }

  return {
    update(s) {
      setText(cashEl, 'cash', `$${Math.floor(s.cash).toLocaleString('en-US')}`);
      setText(starsEl, 'stars', '★'.repeat(s.wanted) + '☆'.repeat(5 - s.wanted));
      setText(objTitle, 'objTitle', s.objectiveTitle);
      setText(objText, 'objText', s.objectiveText);
      setText(objTimer, 'objTimer', s.timer > 0 ? `${Math.floor(s.timer / 60)}:${String(Math.floor(s.timer % 60)).padStart(2, '0')}` : '');
      healthBar.style.width = `${Math.max(0, s.health)}%`;
      healthBar.style.background = s.health > 50 ? '#7fb069' : s.health > 25 ? '#d8a13c' : '#c0392b';
      setText(speedEl, 'speed', s.inCar ? `${Math.round(Math.abs(s.speed) * 3.6)} km/h` : '');
      setText(ammoEl, 'ammo', s.inCar ? (s.carName || '') : s.reloading ? 'RELOADING…' : `AMMO ${s.ammo} / 12`);
      setText(streetEl, 'street', streetNameAt(s.x, s.z));
      const mins = 17 * 60 + 35 + Math.floor(s.time / 2);
      setText(clockEl, 'clock', `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`);
      crosshair.style.display = s.inCar ? 'none' : 'block';
      vignette.style.opacity = String(Math.max(0, Math.min(1, s.damageFlash)));
      if (s.toast) {
        setText(toastEl, 'toast', s.toast);
        toastEl.style.opacity = '1';
      } else {
        toastEl.style.opacity = '0';
      }
    },
    drawMinimap(world, time) {
      if (!staticMap) buildStaticMap(world.colliders);
      mctx.drawImage(staticMap, 0, 0);
      const marker = world.marker;
      if (marker) {
        const pulse = 5 + Math.sin(time * 4) * 2;
        mctx.fillStyle = '#37d67a';
        mctx.beginPath();
        mctx.arc(mapX(marker.x), mapZ(marker.z), pulse, 0, Math.PI * 2);
        mctx.fill();
        mctx.strokeStyle = '#ffffff';
        mctx.lineWidth = 1.5;
        mctx.stroke();
      }
      for (const car of world.cars) {
        if (car.police) continue;
        mctx.fillStyle = '#f2c94c';
        mctx.fillRect(mapX(car.x) - 1.5, mapZ(car.z) - 1.5, 3, 3);
      }
      for (const car of world.police.cars) {
        mctx.fillStyle = '#e5484d';
        mctx.beginPath();
        mctx.arc(mapX(car.x), mapZ(car.z), 3, 0, Math.PI * 2);
        mctx.fill();
      }
      const p = world.playerPos();
      mctx.save();
      mctx.translate(mapX(p.x), mapZ(p.z));
      mctx.rotate(world.playerHeading());
      mctx.fillStyle = '#ffffff';
      mctx.beginPath();
      mctx.moveTo(0, -6);
      mctx.lineTo(4, 5);
      mctx.lineTo(-4, 5);
      mctx.closePath();
      mctx.fill();
      mctx.restore();
    },
  };
}
