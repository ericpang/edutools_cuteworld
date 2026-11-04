// Drawing kit for the map generator. Every solid prop is drawn and registered as an obstacle in the same call,
// so the artwork and the collision shapes can never disagree.
import { WORLD } from '../../js/world.js';

export const W = WORLD.w;
export const H = WORLD.h;
export const OUT = '#5b4a6b'; // plum outline shared by every prop: the "sticker" look

export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => ` ${kebab(k)}="${typeof v === 'number' ? Math.round(v * 10) / 10 : v}"`)
    .join('');
export const el = (tag, o = {}, inner) => (inner === undefined ? `<${tag}${attrs(o)}/>` : `<${tag}${attrs(o)}>${inner}</${tag}>`);
export const rectEl = (x, y, w, h, o = {}) => el('rect', { x, y, width: w, height: h, ...o });
export const circleEl = (x, y, r, o = {}) => el('circle', { cx: x, cy: y, r, ...o });
export const ellipseEl = (x, y, rx, ry, o = {}) => el('ellipse', { cx: x, cy: y, rx, ry, ...o });
export const pathEl = (d, o = {}) => el('path', { d, ...o });
export const lineEl = (x1, y1, x2, y2, o = {}) => el('line', { x1, y1, x2, y2, ...o });
export const group = (inner, o = {}) => el('g', o, inner);
export const outline = (fill, extra = {}) => ({ fill, stroke: OUT, strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round', ...extra });

// Flat art is drawn bottom-up in these layers regardless of the order the map code adds it.
export const GROUND = 0; // grass texture, water
export const PATH = 1; // trails and paving
export const FLOOR = 2; // interiors
export const DECO = 3; // rugs, markings, flowers: things avatars walk over

export class Level {
  constructor(id, label, emoji, background) {
    Object.assign(this, { id, label, emoji, background, defs: [], under: [], shadows: [], props: [], rects: [], circles: [], spawns: [] });
  }

  floor(layer, svg) {
    this.under.push({ layer, svg });
  }

  solidRect(x, y, w, h) {
    this.rects.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  }

  solidCircle(x, y, r) {
    this.circles.push({ x: Math.round(x), y: Math.round(y), r: Math.round(r) });
  }

  spawn(x, y) {
    this.spawns.push({ x, y });
  }

  add(z, svg) {
    this.props.push({ z, svg });
  }

  // Is (x, y) inside, or within `pad` of, anything solid? Used to keep scenery off walls and props.
  covered(x, y, pad = 0) {
    return (
      this.rects.some((r) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad) ||
      this.circles.some((c) => Math.hypot(x - c.x, y - c.y) < c.r + pad)
    );
  }

  svg() {
    const props = this.props
      .map((p, i) => [p, i])
      .sort((a, b) => a[0].z - b[0].z || a[1] - b[1])
      .map(([p]) => p.svg);
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      `<defs>${this.defs.join('')}</defs>`,
      rectEl(0, 0, W, H, { fill: this.background }),
      group(
        this.under
          .map((u, i) => [u, i])
          .sort((a, b) => a[0].layer - b[0].layer || a[1] - b[1])
          .map(([u]) => u.svg)
          .join(''),
        { id: 'floor' },
      ),
      group(this.shadows.join(''), { id: 'shadows' }),
      group(props.join(''), { id: 'props' }),
      '</svg>',
      '',
    ].join('\n');
  }

  data() {
    return {
      id: this.id,
      label: this.label,
      emoji: this.emoji,
      src: `assets/maps/${this.id}.svg`,
      spawns: this.spawns,
      rects: this.rects,
      circles: this.circles,
    };
  }
}

const SHADOW = { fill: '#2d1b4e', opacity: 0.14 };

// A rounded box. Solid by default, so it blocks avatars exactly where it is drawn.
export function block(L, x, y, w, h, { fill = '#fff', rx = 8, solid = true, z = y + h, hi = true, sw = 3 } = {}) {
  L.shadows.push(rectEl(x + 4, y + 8, w, h, { rx, ...SHADOW }));
  let art = rectEl(x, y, w, h, outline(fill, { rx, strokeWidth: sw }));
  if (hi && w > 16 && h > 14) art += rectEl(x + 5, y + 5, w - 10, Math.min(8, h / 3), { rx: 3, fill: '#fff', opacity: 0.35 });
  L.add(z, art);
  if (solid) L.solidRect(x, y, w, h);
}

// A round prop (table, rock, planter).
export function ball(L, x, y, r, { fill = '#fff', solid = true, z = y + r, hi = true, sw = 3, hit = r } = {}) {
  L.shadows.push(ellipseEl(x + 4, y + 8, r, r * 0.92, SHADOW));
  let art = circleEl(x, y, r, outline(fill, { strokeWidth: sw }));
  if (hi && r > 10) art += pathEl(`M${x - r * 0.62} ${y - r * 0.1}A${r * 0.66} ${r * 0.66} 0 0 1 ${x - r * 0.1} ${y - r * 0.62}`, { fill: 'none', stroke: '#fff', strokeWidth: Math.max(3, r / 7), strokeLinecap: 'round', opacity: 0.55 });
  L.add(z, art);
  if (solid) L.solidCircle(x, y, hit);
}

// Wall runs with doorways. `gaps` are [from, to] ranges along the wall that stay open.
export function wallH(L, x0, x1, y, t, gaps, o) {
  let cur = x0;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (g0 > cur) block(L, cur, y, g0 - cur, t, o);
    cur = g1;
  }
  if (cur < x1) block(L, cur, y, x1 - cur, t, o);
}

export function wallV(L, x, y0, y1, t, gaps, o) {
  let cur = y0;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (g0 > cur) block(L, x, cur, t, g0 - cur, o);
    cur = g1;
  }
  if (cur < y1) block(L, x, cur, t, y1 - cur, o);
}

export function tree(L, x, y, r, greens = ['#2f9e5e', '#47b874', '#7ed99b']) {
  L.shadows.push(ellipseEl(x + 7, y + r * 0.72, r, r * 0.66, { fill: '#173d2a', opacity: 0.2 }));
  const art =
    circleEl(x, y, r, outline(greens[0])) +
    circleEl(x - r * 0.1, y - r * 0.12, r * 0.8, { fill: greens[1] }) +
    circleEl(x - r * 0.3, y - r * 0.34, r * 0.38, { fill: greens[2], opacity: 0.9 }) +
    circleEl(x + r * 0.32, y + r * 0.2, r * 0.16, { fill: greens[2], opacity: 0.55 });
  L.add(y + r, art);
  L.solidCircle(x, y, r * 0.9);
}

// Drop scenery at random spots that are clear of solids. `draw(x, y, rand)` returns SVG.
export function scatter(L, rand, count, region, draw, { pad = 24, layer = DECO } = {}) {
  let placed = 0;
  for (let attempts = 0; placed < count && attempts < count * 40; attempts++) {
    const x = Math.round(region.x + rand() * region.w);
    const y = Math.round(region.y + rand() * region.h);
    if (L.covered(x, y, pad)) continue;
    const art = draw(x, y, rand);
    if (art) L.floor(layer, art);
    placed++;
  }
}

// A frame around the map edge (hedge, wall...) that doubles as the boundary.
export function frame(L, fill, t = 24) {
  block(L, 0, 0, W, t, { fill, rx: 10, hi: false });
  block(L, 0, H - t, W, t, { fill, rx: 10, hi: false });
  block(L, 0, 0, t, H, { fill, rx: 10, hi: false });
  block(L, W - t, 0, t, H, { fill, rx: 10, hi: false });
}

export const tuft = (x, y) => `M${x} ${y}q2-8 5-1M${x + 6} ${y + 1}q1-7 4-2`;

export function flower(x, y, color = '#ff9ec7') {
  return (
    circleEl(x - 4, y, 3.4, { fill: color }) +
    circleEl(x + 4, y, 3.4, { fill: color }) +
    circleEl(x, y - 4, 3.4, { fill: color }) +
    circleEl(x, y + 4, 3.4, { fill: color }) +
    circleEl(x, y, 2.4, { fill: '#ffe066' })
  );
}
