// Canvas-painted textures, generated at boot: no image files, no network.
// Each painter returns a THREE.CanvasTexture with repeat wrapping.

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function toTexture(canvas, repeatX, repeatY) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX || 1, repeatY || 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Building facade: warm plaster with lit windows and a darker base floor. */
export function buildingTexture(baseColor, rand) {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);
  // Subtle vertical shading bands.
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(x, 0, 16, 256);
  }
  // Windows: 4 columns x 6 rows, some lit warm, some dark glass.
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const x = 18 + col * 58;
      const y = 16 + row * 38;
      const lit = rand() < 0.35;
      ctx.fillStyle = lit ? '#ffd98a' : '#2e4a5a';
      ctx.fillRect(x, y, 34, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x, y, 34, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, y + 20, 34, 4);
    }
  }
  // Ground floor: shopfront band.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, 224, 256, 32);
  ctx.fillStyle = '#3a2e26';
  ctx.fillRect(20, 228, 90, 28);
  ctx.fillStyle = '#6a4a2a';
  ctx.fillRect(140, 228, 96, 28);
  return toTexture(c, 1, 1);
}

/** Asphalt with a dashed centre line (drawn along the texture's V axis). */
export function roadTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#3a3a40';
  ctx.fillRect(0, 0, 128, 128);
  // Speckle.
  for (let i = 0; i < 500; i += 1) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  // Edge lines.
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(4, 0, 2, 128);
  ctx.fillRect(122, 0, 2, 128);
  // Centre dashes.
  ctx.fillStyle = '#f5d76e';
  for (let y = 0; y < 128; y += 32) ctx.fillRect(62, y, 4, 18);
  return toTexture(c, 1, 1);
}

/** Sidewalk: pale paving slabs. */
export function sidewalkTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#9a938a';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
  }
  return toTexture(c, 1, 1);
}

/** Sand for the beach strip. */
export function sandTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#e8cf9a';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(180,140,80,0.25)' : 'rgba(255,240,200,0.3)';
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  return toTexture(c, 1, 1);
}

/** Flat grass for the park block. */
export function grassTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#5d8a4a';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i += 1) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(40,90,30,0.3)' : 'rgba(140,190,90,0.25)';
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 3);
  }
  return toTexture(c, 1, 1);
}

/** Water: deep blue with light streaks. */
export function waterTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#2e7fa8';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i += 1) {
    const y = Math.random() * 128;
    ctx.beginPath(); ctx.moveTo(Math.random() * 40, y); ctx.lineTo(60 + Math.random() * 68, y); ctx.stroke();
  }
  return toTexture(c, 1, 1);
}

/** Neon sign strip for shopfronts: coloured glow bands. */
export function signTexture(color) {
  const [c, ctx] = makeCanvas(256, 48);
  ctx.fillStyle = '#14141c';
  ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = color;
  ctx.fillRect(6, 6, 244, 36);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  return [c, ctx, toTexture(c, 1, 1)];
}
