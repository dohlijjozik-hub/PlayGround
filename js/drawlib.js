export function pathThrough(ctx, pts, close = false) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
}

export function fillQuad(ctx, a, b, c, d, color) {
  if (!a || !b || !c || !d) return;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function polyFill(ctx, pts, color) {
  pathThrough(ctx, pts, true);
  ctx.fillStyle = color;
  ctx.fill();
}

export function polyStroke(ctx, pts, color, width = 1) {
  pathThrough(ctx, pts, false);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function lerpPt(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Bilinear point inside quad [top-left, top-right, bottom-right, bottom-left]. */
export function quadPoint(q, u, v) {
  const top = lerpPt(q[0], q[1], u);
  const bottom = lerpPt(q[3], q[2], u);
  return lerpPt(top, bottom, v);
}

export function shade(hex, amount) {
  const p = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((p >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((p >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (p & 255) + amount));
  return `rgb(${r},${g},${b})`;
}

export function roundedRect(ctx, x, y, w, h, radii) {
  const [tl, tr, br, bl] = Array.isArray(radii) ? radii : [radii, radii, radii, radii];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

export function glow(ctx, x, y, radius, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color.replace(/[\d.]+\)$/, `${0.52 * alpha})`));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}
