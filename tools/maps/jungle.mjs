import { DECO, GROUND, Level, PATH, W, H, ball, block, circleEl, ellipseEl, flower, frame, outline, pathEl, rectEl, rng, scatter, tree, tuft } from './kit.mjs';

const ROUND = { strokeLinecap: 'round', strokeLinejoin: 'round' };
const RR = 58; // the river blocks avatars within this distance of its centre line
const TRAIL = 96;

// ---- curve helpers: Catmull-Rom through waypoints, resampled at an even spacing
const catmull = (p0, p1, p2, p3, t) =>
  [0, 1].map((i) => 0.5 * (2 * p1[i] + (p2[i] - p0[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t * t + (3 * p1[i] - p0[i] - 3 * p2[i] + p3[i]) * t * t * t));

function smooth(points) {
  const p = [points[0], ...points, points.at(-1)];
  const out = [];
  for (let i = 1; i < p.length - 2; i++) for (let k = 0; k < 24; k++) out.push(catmull(p[i - 1], p[i], p[i + 1], p[i + 2], k / 24));
  out.push(points.at(-1));
  return out;
}

function resample(poly, step) {
  const out = [poly[0]];
  let carry = 0;
  for (let i = 1; i < poly.length; i++) {
    let [ax, ay] = poly[i - 1];
    const [bx, by] = poly[i];
    let seg = Math.hypot(bx - ax, by - ay);
    while (carry + seg >= step) {
      const t = (step - carry) / seg;
      ax += (bx - ax) * t;
      ay += (by - ay) * t;
      out.push([ax, ay]);
      seg = Math.hypot(bx - ax, by - ay);
      carry = 0;
    }
    carry += seg;
  }
  return out;
}

function distToPoly(poly, x, y) {
  let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const [ax, ay] = poly[i - 1];
    const [bx, by] = poly[i];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

const pathD = (poly) => `M${poly.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join('L')}`;

// A jungle split by a winding river with two bridges, a campfire clearing, a pond, ruins and a hut.
export function jungle() {
  const L = new Level('jungle', 'Jungle', '🌴', '#84d38d');
  const rand = rng(33);

  const dense = smooth([[990, -70], [925, 170], [965, 390], [905, 570], [965, 770], [915, 950], [955, 1150]]);
  const spine = resample(dense, 34);
  const riverX = (y) => dense.reduce((best, p) => (Math.abs(p[1] - y) < Math.abs(best[1] - y) ? p : best))[0];
  const bridges = [330, 800];

  const trails = [
    [[300, 360], [560, 330], [820, 335], [1100, 330], [1300, 335], [1380, 330]],
    [[520, 810], [680, 800], [830, 800], [1100, 800], [1300, 780], [1560, 770]],
    [[620, 330], [600, 560], [620, 810]],
    [[1300, 335], [1260, 560], [1300, 780]],
    [[560, 330], [470, 270], [400, 255]],
  ].map((pts) => smooth(pts));
  const spawnsAt = [[720, 330], [690, 450], [770, 800], [1150, 330], [1160, 560], [1150, 800]];

  // ---- ground: soft patches of darker green, then trails
  for (let i = 0; i < 16; i++) L.floor(GROUND, circleEl(Math.round(rand() * W), Math.round(rand() * H), 80 + rand() * 120, { fill: '#6fc27c', opacity: 0.45 }));
  L.floor(PATH, circleEl(400, 650, 152, { fill: '#d8b878' }));
  L.floor(PATH + 0.1, circleEl(400, 650, 140, { fill: '#ecd29a' }));
  for (const t of trails) L.floor(PATH, pathEl(pathD(t), { fill: 'none', stroke: '#d8b878', strokeWidth: TRAIL + 12, ...ROUND }));
  for (const t of trails) L.floor(PATH + 0.2, pathEl(pathD(t), { fill: 'none', stroke: '#ecd29a', strokeWidth: TRAIL, ...ROUND }));

  // ---- river: sand banks, water, ripples (drawn over the trails, bridges go over the water)
  const riverD = pathD(dense);
  L.floor(PATH + 0.5, pathEl(riverD, { fill: 'none', stroke: '#f2e2b3', strokeWidth: RR * 2 + 54, ...ROUND }));
  L.floor(PATH + 0.6, pathEl(riverD, { fill: 'none', stroke: '#5fbff5', strokeWidth: RR * 2 + 6, ...ROUND }));
  L.floor(PATH + 0.7, pathEl(riverD, { fill: 'none', stroke: '#9ee0ff', strokeWidth: 56, opacity: 0.6, ...ROUND }));
  L.floor(PATH + 0.8, pathEl(riverD, { fill: 'none', stroke: '#fff', strokeWidth: 4, strokeDasharray: '10 34', opacity: 0.7, ...ROUND }));
  for (const [x, y] of spine) {
    if (y < 0 || y > H) continue; // the frame seals the map edge
    if (bridges.some((by) => Math.abs(y - by) < 70 + RR)) continue; // leave a 140-unit crossing at each bridge
    L.solidCircle(x, y, RR);
  }
  for (const by of bridges) {
    const cx = riverX(by);
    const half = RR + 34;
    L.floor(
      DECO,
      rectEl(cx - half, by - 62, half * 2, 124, outline('#e8bb82', { rx: 6 })) +
        Array.from({ length: 9 }, (_, i) => `M${Math.round(cx - half + 12 + i * ((half * 2 - 24) / 8))} ${by - 60}v120`).map((d) => pathEl(d, { stroke: '#c9955a', strokeWidth: 2.5, opacity: 0.8 })).join(''),
    );
    block(L, cx - half, by - 72, half * 2, 12, { fill: '#b9824a', rx: 5, hi: false });
    block(L, cx - half, by + 60, half * 2, 12, { fill: '#b9824a', rx: 5, hi: false });
    // The circle chain ends in round caps, which would leave corners of open water beside the rails: square them off.
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const y0 = side > 0 ? by + 70 + k * 24 : by - 70 - (k + 1) * 24;
        L.solidRect(riverX(y0 + 12) - RR, y0, RR * 2, 24);
      }
    }
  }

  // ---- pond (west)
  ball(L, 330, 250, 96, { fill: '#6fd0ff' });
  L.add(350, lily(300, 230, 16) + lily(365, 275, 13) + lily(330, 215, 10) + lily(290, 285, 11));
  L.add(360, reeds(262, 322) + reeds(398, 188) + reeds(250, 190));

  // ---- campfire clearing (west)
  {
    const c = { x: 400, y: 650 };
    const d = 108;
    L.floor(DECO, circleEl(c.x, c.y, 62, { fill: '#ffd27a', opacity: 0.35 }));
    for (const [dx, dy, w, h] of [[-45, -d - 13, 90, 26], [-45, d - 13, 90, 26], [-d - 13, -45, 26, 90], [d - 13, -45, 26, 90]]) block(L, c.x + dx, c.y + dy, w, h, { fill: '#a8703c', rx: 12 });
    ball(L, c.x, c.y, 22, { fill: '#8c8a9e' });
    L.add(c.y + 30, pathEl(`M${c.x} ${c.y - 20}q16 14 8 30q-8 12-16 0q-8-16 8-30z`, outline('#ff9a3c', { strokeWidth: 2.5 })) + pathEl(`M${c.x} ${c.y - 6}q6 6 2 14q-4 4-6 0q-2-6 4-14z`, { fill: '#ffe066' }));
  }

  // ---- ruins (east)
  L.floor(DECO, rectEl(1390, 210, 340, 250, outline('#e9dcc0', { rx: 16 })) + rectEl(1404, 224, 312, 222, { fill: 'none', stroke: '#d6c7a3', strokeWidth: 3, rx: 10 }));
  for (const [x, y] of [[1425, 245], [1695, 245], [1425, 425], [1695, 425]]) ball(L, x, y, 20, { fill: '#d6c7a3' });
  block(L, 1515, 305, 110, 80, { fill: '#cdbb94', rx: 10 });
  L.add(390, circleEl(1570, 345, 22, { fill: '#7fe3ff', opacity: 0.35 }) + circleEl(1570, 345, 12, outline('#7fe3ff', { strokeWidth: 2.5 })));
  block(L, 1470, 212, 70, 22, { fill: '#cdbb94', rx: 6 });
  block(L, 1620, 212, 80, 22, { fill: '#cdbb94', rx: 6 });

  // ---- hut and barrels (east)
  block(L, 1670, 700, 160, 130, { fill: '#d9a066', rx: 20 });
  L.add(840, [0, 1, 2, 3, 4, 5].map((i) => pathEl(`M${1684 + i * 25} 712v106`, { stroke: '#b9824a', strokeWidth: 3, opacity: 0.8, ...ROUND })).join('') + rectEl(1730, 790, 40, 40, outline('#8c5a32', { rx: 6, strokeWidth: 2.5 })));
  ball(L, 1640, 880, 22, { fill: '#a8703c' });
  ball(L, 1708, 890, 22, { fill: '#a8703c' });

  // ---- rocks and mushrooms
  for (const [x, y, r] of [[150, 430, 48], [740, 560, 50], [190, 930, 44], [1230, 600, 46], [1820, 380, 42], [1100, 980, 40], [1450, 950, 48]]) ball(L, x, y, r, { fill: '#bdb7cf' });
  for (const [x, y, r] of [[170, 620, 26], [228, 702, 24], [150, 704, 22], [1500, 570, 26], [1560, 630, 22], [1452, 640, 24]]) mushroom(L, x, y, r);

  // ---- trees: random, but always clear of trails, the river and each other so every gap stays walkable
  const palette = [['#2f9e5e', '#47b874', '#7ed99b'], ['#2a8f6a', '#3fb084', '#76d6b0'], ['#4a9c3f', '#63b957', '#9be08a']];
  const clearOfTrails = (x, y, r) => trails.every((t) => distToPoly(t, x, y) > TRAIL / 2 + r * 0.9 + 8);
  const clearOfSpawns = (x, y) => spawnsAt.every(([sx, sy]) => Math.hypot(x - sx, y - sy) > 150);
  // Palms go along both banks first, then trees fill in around them. Every gap between two solids stays at
  // least 60 units wide (an avatar is 44), so nothing can be sealed off.
  for (let y = 90; y < H - 40; y += 110) {
    if (bridges.some((by) => Math.abs(y - by) < 110)) continue;
    for (const side of [-1, 1]) {
      const x = Math.round(riverX(y) + side * (RR + 96 + rand() * 30));
      const py = Math.round(y + (rand() - 0.5) * 50);
      if (L.covered(x, py, 48) || !clearOfTrails(x, py, 28) || !clearOfSpawns(x, py)) continue;
      palm(L, x, py);
    }
  }
  let planted = 0;
  for (let i = 0; i < 12000 && planted < 90; i++) {
    const r = 36 + rand() * 20;
    const x = Math.round(36 + rand() * (W - 72));
    const y = Math.round(36 + rand() * (H - 72));
    if (distToPoly(spine, x, y) < RR + r * 0.9 + 64) continue;
    if (!clearOfTrails(x, y, r) || !clearOfSpawns(x, y) || L.covered(x, y, r * 0.9 + 60)) continue;
    tree(L, x, y, Math.round(r), palette[Math.floor(rand() * palette.length)]);
    planted++;
  }

  frame(L, '#2f8f5b'); // dense undergrowth border

  // ---- scenery
  const tufts = [];
  scatter(L, rand, 380, { x: 24, y: 24, w: W - 48, h: H - 48 }, (x, y) => { tufts.push(tuft(x, y)); return null; }, { pad: 8, layer: GROUND });
  L.floor(GROUND + 0.1, pathEl(tufts.join(''), { fill: 'none', stroke: '#5fb56e', strokeWidth: 2.6, ...ROUND }));
  const bloom = ['#ff7eb6', '#ffb347', '#fff176', '#ff8a65', '#ce93d8'];
  scatter(L, rand, 60, { x: 40, y: 40, w: W - 80, h: H - 80 }, (x, y, r) => flower(x, y, bloom[Math.floor(r() * bloom.length)]), { pad: 34 });
  scatter(L, rand, 46, { x: 40, y: 40, w: W - 80, h: H - 80 }, (x, y) => bush(x, y), { pad: 40 });
  scatter(L, rand, 40, { x: 40, y: 40, w: W - 80, h: H - 80 }, (x, y) => fern(x, y), { pad: 30 });
  scatter(L, rand, 26, { x: 40, y: 40, w: W - 80, h: H - 80 }, (x, y) => circleEl(x, y, 7, { fill: '#fff59d', opacity: 0.5 }) + circleEl(x, y, 3, { fill: '#fff59d' }), { pad: 20 });

  for (const [x, y] of spawnsAt) L.spawn(x, y);
  return L;
}

function lily(x, y, r) {
  return circleEl(x, y, r, { fill: '#6fd08c', stroke: '#3fa862', strokeWidth: 2 }) + pathEl(`M${x} ${y}L${x + r} ${y - r * 0.3}`, { stroke: '#6fd0ff', strokeWidth: 3 });
}

function reeds(x, y) {
  return pathEl(`M${x} ${y}v-34M${x + 9} ${y + 2}v-26M${x - 9} ${y + 3}v-22`, { stroke: '#3aa860', strokeWidth: 4, ...ROUND }) + ellipseEl(x, y - 38, 4, 9, { fill: '#8c5a32' });
}

function mushroom(L, x, y, r) {
  L.shadows.push(ellipseEl(x + 4, y + r * 0.8, r, r * 0.7, { fill: '#2d1b4e', opacity: 0.14 }));
  L.add(y + r, circleEl(x, y, r, outline('#ff6b6b')) + circleEl(x - r * 0.35, y - r * 0.3, r * 0.2, { fill: '#fff' }) + circleEl(x + r * 0.3, y - r * 0.1, r * 0.15, { fill: '#fff' }) + circleEl(x, y + r * 0.4, r * 0.14, { fill: '#fff' }));
  L.solidCircle(x, y, r * 0.95);
}

function palm(L, x, y) {
  L.shadows.push(ellipseEl(x + 8, y + 22, 44, 26, { fill: '#173d2a', opacity: 0.2 }));
  const fronds = Array.from({ length: 7 }, (_, i) =>
    ellipseEl(x + 28, y, 32, 10, outline(i % 2 ? '#3fb084' : '#2f9e5e', { strokeWidth: 2.5, transform: `rotate(${Math.round((i / 7) * 360)} ${x} ${y})` })),
  );
  L.add(y + 30, fronds.join('') + circleEl(x, y, 11, outline('#8b5e3c', { strokeWidth: 2.5 })));
  L.solidCircle(x, y, 26);
}

const bush = (x, y) => circleEl(x - 12, y + 4, 16, { fill: '#3aa860' }) + circleEl(x + 12, y + 6, 14, { fill: '#3aa860' }) + circleEl(x, y - 6, 18, { fill: '#4cbf72' }) + circleEl(x - 5, y - 11, 6, { fill: '#7ed99b', opacity: 0.8 });

const fern = (x, y) => pathEl(`M${x} ${y}q-16-6-30 8M${x} ${y}q-8-20 0-34M${x} ${y}q16-6 30 8M${x} ${y}q-18 8-26 24M${x} ${y}q18 8 26 24`, { fill: 'none', stroke: '#3aa860', strokeWidth: 5, ...ROUND });
