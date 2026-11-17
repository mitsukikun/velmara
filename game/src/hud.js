// The HUD: health and cash, wanted stars, the mission objective, dialogue
// lines, toasts, the speedometer, and a live minimap drawn on a 2D canvas
// (roads, blocks, sea, player arrow, mission marker, police and traffic dots).

import { GRID } from './config.js';
import { money, clock } from './random.js';

const MAP_SIZE = 190;

export function createHUD() {
  const el = (id) => document.getElementById(id);
  const healthFill = el('health-fill');
  const healthText = el('health-text');
  const cashText = el('cash-text');
  const starsEl = el('stars');
  const objectiveEl = el('objective');
  const missionEl = el('mission-title');
  const dialogEl = el('dialog');
  const toastEl = el('toast');
  const speedEl = el('speed');
  const speedBox = el('speed-box');
  const ammoEl = el('ammo');
  const weaponEl = el('weapon');
  const hintEl = el('hint');
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');
  const wantedBox = el('wanted-box');
  const evadeEl = el('evade');

  let dialogTimer = null;
  let toastTimer = null;
  let lastStars = -1;

  function showDialog(lines) {
    dialogEl.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
    dialogEl.classList.add('show');
    if (dialogTimer) clearTimeout(dialogTimer);
    dialogTimer = setTimeout(() => dialogEl.classList.remove('show'), 5200);
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  function update(state) {
    // Health.
    const hp = Math.max(0, Math.round(state.health));
    healthFill.style.width = hp + '%';
    healthFill.style.background = hp > 50 ? '#3ad05a' : hp > 25 ? '#e8a13a' : '#e83a3a';
    healthText.textContent = hp;
    cashText.textContent = money(state.cash);
    // Wanted stars.
    if (state.wanted !== lastStars) {
      lastStars = state.wanted;
      starsEl.innerHTML = '';
      for (let i = 0; i < 5; i += 1) {
        const s = document.createElement('span');
        s.textContent = '★';
        s.className = i < state.wanted ? 'star on' : 'star';
        starsEl.appendChild(s);
      }
      wantedBox.classList.toggle('hot', state.wanted > 0);
    }
    evadeEl.style.display = state.evading && state.wanted > 0 ? 'block' : 'none';
    // Mission.
    missionEl.textContent = state.missionTitle;
    objectiveEl.textContent = state.objective;
    // Speed + weapon.
    if (state.inCar) {
      speedBox.style.display = 'block';
      speedEl.textContent = Math.round(Math.abs(state.speed) * 3.6);
    } else {
      speedBox.style.display = 'none';
    }
    weaponEl.textContent = state.weapon === 'pistol' ? 'PISTOL' : 'FISTS';
    ammoEl.textContent = state.weapon === 'pistol' ? `${state.ammo} / ${state.reserveAmmo}` : '—';
    // Context hint.
    hintEl.textContent = state.hint || '';
    // Minimap.
    drawMinimap(state);
  }

  function drawMinimap(state) {
    const ctx = mctx;
    const S = MAP_SIZE;
    const half = GRID.half + 90;
    const scale = S / (half * 2);
    const toMap = (x, z) => [S / 2 + x * scale, S / 2 + z * scale];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, S, S);
    // Sea (east).
    const [seaX] = toMap(GRID.half, 0);
    ctx.fillStyle = '#1d5a7a';
    ctx.fillRect(seaX, 0, S - seaX, S);
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(seaX - 6 * scale, 0, 6 * scale, S);
    // Blocks.
    ctx.fillStyle = '#3a3f46';
    for (let i = -3; i <= 3; i += 1) {
      for (let j = -3; j <= 3; j += 1) {
        const [x, y] = toMap(i * GRID.pitch - GRID.block / 2, j * GRID.pitch - GRID.block / 2);
        ctx.fillRect(x, y, GRID.block * scale, GRID.block * scale);
      }
    }
    // Roads.
    ctx.strokeStyle = '#6a6f76';
    ctx.lineWidth = GRID.road * scale;
    for (const a of state.avenues) {
      const [x] = toMap(a, 0);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
      const [, y] = toMap(0, a);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
    }
    // Mission marker.
    if (state.marker) {
      const [mx, my] = toMap(state.marker.x, state.marker.z);
      const pulse = 6 + Math.sin(state.time * 4) * 2;
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath(); ctx.arc(mx, my, pulse, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, pulse + 3, 0, Math.PI * 2); ctx.stroke();
    }
    // Traffic dots.
    ctx.fillStyle = '#cccccc';
    for (const t of state.traffic || []) {
      const [tx, ty] = toMap(t.x, t.z);
      ctx.fillRect(tx - 1.5, ty - 1.5, 3, 3);
    }
    // Police dots.
    ctx.fillStyle = '#4a8aff';
    for (const p of state.policeCars || []) {
      const [px, py] = toMap(p.x, p.z);
      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ff4a4a';
    for (const p of state.policeCops || []) {
      const [px, py] = toMap(p.x, p.z);
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Enemies.
    ctx.fillStyle = '#ff2222';
    for (const e of state.enemies || []) {
      const [ex, ey] = toMap(e.x, e.z);
      ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow (north = -Z up on the map; rotate by heading).
    const [px, py] = toMap(state.x, state.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-state.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // View cone.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.sin(state.heading - 0.5) * 22, py + Math.cos(state.heading - 0.5) * 22);
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.sin(state.heading + 0.5) * 22, py + Math.cos(state.heading + 0.5) * 22);
    ctx.stroke();
  }

  return {
    update,
    showDialog,
    showToast,
    setClock(text) { const c = el('clock'); if (c) c.textContent = text; },
  };
}
