import { DECO, FLOOR, GROUND, Level, W, H, ball, block, circleEl, el, ellipseEl, frame, outline, pathEl, rectEl, wallH } from './kit.mjs';

const T = 18; // shop wall thickness
const WALL = { fill: '#d7c3f7', rx: 4 };
const ROUND = { strokeLinecap: 'round', strokeLinejoin: 'round' };
const OUT_SOFT = '#5b4a6b99';

// An indoor mall: a row of shops along the top and bottom, and an open atrium with a fountain, kiosks,
// a kids' corner and a food court between them.
export function shopping() {
  const L = new Level('shopping', 'Shopping Center', '🏬', '#fff4e6');

  L.defs.push('<pattern id="mall" width="120" height="120" patternUnits="userSpaceOnUse"><rect width="120" height="120" fill="#fff4e6"/><rect width="60" height="60" fill="#ffe9d4"/><rect x="60" y="60" width="60" height="60" fill="#ffe9d4"/></pattern>');
  L.floor(GROUND, rectEl(0, 0, W, H, { fill: 'url(#mall)' }));

  // ---- shops
  const xs = [24, 398, 773, 1147, 1522, 1896];
  const top = [
    { floor: '#ffe1ea', counter: '#ffb3c7', table: '#ffd1dc', awning: '#ff8fb1', icon: cupcake },
    { floor: '#dcecff', counter: '#9ccbff', table: '#bfe0ff', awning: '#5fa8ff', icon: bear },
    { floor: '#e2f6dc', counter: '#9fdc95', table: '#c5eebd', awning: '#5ec46f', icon: book },
    { floor: '#fff3c4', counter: '#ffd966', table: '#ffe58f', awning: '#ffb300', icon: paw },
    { floor: '#eadcff', counter: '#c3a6f5', table: '#d9c4fb', awning: '#9575cd', icon: gift },
  ];
  const bottom = [
    { floor: '#ffe9d4', counter: '#ffc08a', table: '#ffd9b3', awning: '#ff8a50', icon: cup },
    { floor: '#d9f4f1', counter: '#8fdcd3', table: '#b7ebe5', awning: '#26a69a', icon: bloom },
    { floor: '#ffe0f0', counter: '#ff9ed0', table: '#ffc4e3', awning: '#ec407a', icon: candy },
    { floor: '#e1e8ff', counter: '#a5b8ff', table: '#c5d1ff', awning: '#5c6bc0', icon: note },
    { floor: '#fff0c9', counter: '#ffd27a', table: '#ffe3a3', awning: '#fb8c00', icon: sport },
  ];
  top.forEach((theme, i) => shop(L, xs[i], xs[i + 1], true, i, theme));
  bottom.forEach((theme, i) => shop(L, xs[i], xs[i + 1], false, i, theme));
  for (const x of xs.slice(1, -1)) {
    block(L, x - T / 2, 24, T, 228, { ...WALL, hi: false });
    block(L, x - T / 2, H - 252, T, 228, { ...WALL, hi: false });
  }

  // ---- atrium: fountain
  L.floor(DECO, circleEl(960, 540, 236, { fill: '#ffe0ec' }) + circleEl(960, 540, 200, { fill: '#fff0f6', stroke: '#ffc2dc', strokeWidth: 4 }) + circleEl(960, 540, 150, { fill: 'none', stroke: '#ffc2dc', strokeWidth: 3, strokeDasharray: '4 14', ...ROUND }));
  ball(L, 960, 540, 112, { fill: '#cfeeff' });
  L.add(700, circleEl(960, 540, 84, outline('#6fd0ff', { strokeWidth: 3 })) + circleEl(960, 540, 46, { fill: '#9fe0ff' }) + circleEl(960, 540, 18, outline('#fff', { strokeWidth: 3 })) + [0, 60, 120, 180, 240, 300].map((a) => circleEl(960 + Math.cos((a * Math.PI) / 180) * 64, 540 + Math.sin((a * Math.PI) / 180) * 64, 5, { fill: '#fff', opacity: 0.9 })).join(''));

  // planters
  for (const [x, y] of [[700, 400], [1220, 400], [700, 690], [1220, 690]]) {
    ball(L, x, y, 28, { fill: '#ff9fb2' });
    L.add(y + 60, [0, 1, 2, 3, 4].map((i) => ellipseEl(x + 12, y, 18, 6, outline(i % 2 ? '#47b874' : '#2f9e5e', { strokeWidth: 2, transform: `rotate(${i * 72} ${x} ${y})` }))).join(''));
  }
  // benches south of the fountain
  block(L, 840, 724, 90, 28, { fill: '#b39ddb', rx: 8 });
  block(L, 990, 724, 90, 28, { fill: '#b39ddb', rx: 8 });
  // island kiosks with umbrellas
  for (const x of [420, 1380]) {
    block(L, x, 505, 120, 70, { fill: '#ffd0a6', rx: 12 });
    L.add(600, umbrella(x + 60, 540, 40));
  }
  // kids' corner
  L.floor(DECO, rectEl(60, 330, 300, 190, outline('#c9f0ee', { rx: 26 })) + circleEl(110, 480, 14, { fill: '#ffd1dc' }) + circleEl(250, 360, 12, { fill: '#fff3a3' }) + circleEl(330, 470, 12, { fill: '#e1d2ff' }));
  block(L, 90, 366, 56, 56, { fill: '#ff9bb3', rx: 10 });
  block(L, 205, 432, 56, 56, { fill: '#7fd4ff', rx: 10 });
  ball(L, 312, 390, 28, { fill: '#ffe08a' });
  L.add(480, star(118, 394, 15, '#fff') + heart(233, 460, 15, '#fff'));
  // food court
  L.floor(DECO, rectEl(1470, 340, 400, 380, outline('#fff0d6', { rx: 28 })));
  for (const [x, y] of [[1570, 430], [1760, 430], [1570, 640], [1760, 640]]) {
    for (const a of [0, 90, 180, 270]) L.floor(DECO, circleEl(x + Math.cos((a * Math.PI) / 180) * 54, y + Math.sin((a * Math.PI) / 180) * 54, 14, outline('#ffb347', { strokeWidth: 2.5 })));
    ball(L, x, y, 36, { fill: '#ffe3a3' });
  }
  // potted palms in the corners of the atrium
  for (const [x, y] of [[76, 740], [1844, 330], [1844, 760]]) {
    ball(L, x, y, 26, { fill: '#ff9fb2' });
    L.add(y + 60, [0, 1, 2, 3, 4, 5].map((i) => ellipseEl(x + 14, y, 20, 7, outline(i % 2 ? '#47b874' : '#2f9e5e', { strokeWidth: 2, transform: `rotate(${i * 60} ${x} ${y})` }))).join(''));
  }

  frame(L, '#d7c3f7');

  for (const [x, y] of [[700, 540], [1220, 540], [960, 320], [560, 330], [1360, 780], [560, 780]]) L.spawn(x, y);
  return L;
}

// One shop: floor, front wall with a doorway, counter, shelves, display tables and a striped awning on the mall side.
function shop(L, x0, x1, isTop, i, theme) {
  const c = Math.round((x0 + x1) / 2);
  const wallY = isTop ? 234 : H - 252;
  const inY = isTop ? 24 : H - 234;
  L.floor(FLOOR, rectEl(x0, inY, x1 - x0, 210, { fill: theme.floor }));
  wallH(L, i === 0 ? x0 : x0 + T / 2, i === 4 ? x1 : x1 - T / 2, wallY, T, [[c - 75, c + 75]], { ...WALL, hi: false });

  const shelfY = isTop ? 30 : H - 52;
  block(L, x0 + 34, shelfY, x1 - x0 - 68, 22, { fill: '#c98a5b', rx: 6 });
  L.add(shelfY + 30, goods(x0 + 44, shelfY + 5, x1 - x0 - 88));
  // Tables hug the front wall so the band between counter and wall stays walkable (the strips beside the counter connect through it).
  block(L, c - 95, isTop ? 66 : H - 102, 190, 36, { fill: theme.counter, rx: 10 });
  ball(L, x0 + 96, isTop ? 208 : H - 208, 24, { fill: theme.table });
  ball(L, x1 - 96, isTop ? 208 : H - 208, 24, { fill: theme.table });

  // doormat inside, awning outside
  L.floor(DECO, rectEl(c - 56, isTop ? 208 : H - 230, 112, 22, outline(theme.awning, { rx: 8, strokeWidth: 2, opacity: 0.45 })));
  const ay = isTop ? 252 : H - 252 - 30;
  const w = x1 - x0 - 28;
  const stripe = w / 12;
  L.floor(DECO, Array.from({ length: 12 }, (_, k) => rectEl(x0 + 14 + k * stripe, ay, stripe, 30, { fill: k % 2 ? '#fff' : theme.awning })).join('') + rectEl(x0 + 14, ay, w, 30, { fill: 'none', stroke: OUT_SOFT, strokeWidth: 3, rx: 8 }));
  L.add(900, circleEl(c, ay + 15, 22, outline('#fff', { strokeWidth: 3 })) + theme.icon(c, ay + 15));
}

function goods(x, y, w) {
  const colors = ['#ff7eb6', '#4fc3f7', '#ffca28', '#81c784', '#b39ddb', '#ff8a65'];
  let out = '';
  for (let i = 0, p = 0; p < w - 16; i++, p += 22) out += rectEl(x + p, y, 14, 12, { fill: colors[i % 6], rx: 3, stroke: OUT_SOFT, strokeWidth: 1.5 });
  return out;
}

const umbrella = (x, y, r) =>
  circleEl(x, y, r, outline('#ff8fb1')) + [0, 1, 2, 3, 4, 5].map((i) => pathEl(`M${x} ${y}L${Math.round(x + Math.cos((i * Math.PI) / 3) * r)} ${Math.round(y + Math.sin((i * Math.PI) / 3) * r)}`, { stroke: '#fff', strokeWidth: 3, opacity: 0.7 })).join('') + circleEl(x, y, 5, { fill: '#fff' });

const star = (x, y, r, fill) =>
  el('polygon', { points: Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5; const d = i % 2 ? r * 0.45 : r; return `${Math.round((x + Math.cos(a) * d) * 10) / 10},${Math.round((y + Math.sin(a) * d) * 10) / 10}`; }).join(' '), fill, ...ROUND, stroke: fill, strokeWidth: 2 });

const heart = (x, y, s, fill) => pathEl(`M${x} ${y + s * 0.9}C${x - s * 1.5} ${y - s * 0.1} ${x - s * 0.7} ${y - s * 1.1} ${x} ${y - s * 0.35}C${x + s * 0.7} ${y - s * 1.1} ${x + s * 1.5} ${y - s * 0.1} ${x} ${y + s * 0.9}Z`, { fill });

// ---- awning badges (about 28 units across)
const cupcake = (x, y) => pathEl(`M${x - 11} ${y + 1}h22l-4 11h-14z`, outline('#ffb3c7', { strokeWidth: 2 })) + circleEl(x, y - 2, 11, outline('#fff', { strokeWidth: 2 })) + circleEl(x, y - 12, 3.5, { fill: '#ff4d6d' });
const bear = (x, y) => circleEl(x - 10, y - 10, 5, outline('#d9a066', { strokeWidth: 2 })) + circleEl(x + 10, y - 10, 5, outline('#d9a066', { strokeWidth: 2 })) + circleEl(x, y, 13, outline('#d9a066', { strokeWidth: 2 })) + ellipseEl(x, y + 4, 6, 5, { fill: '#f5deb3' }) + circleEl(x, y + 2, 2, { fill: OUT_SOFT }) + circleEl(x - 5, y - 3, 1.8, { fill: OUT_SOFT }) + circleEl(x + 5, y - 3, 1.8, { fill: OUT_SOFT });
const book = (x, y) => rectEl(x - 12, y - 11, 24, 22, outline('#7ed99b', { rx: 3, strokeWidth: 2 })) + pathEl(`M${x - 6} ${y - 11}v22M${x - 1} ${y - 4}h9M${x - 1} ${y + 2}h9`, { stroke: OUT_SOFT, strokeWidth: 2 });
const paw = (x, y) => ellipseEl(x, y + 6, 10, 8, outline('#ffb300', { strokeWidth: 2 })) + [[-12, -3], [-4, -10], [4, -10], [12, -3]].map(([dx, dy]) => circleEl(x + dx, y + dy, 4.5, outline('#ffb300', { strokeWidth: 2 }))).join('');
const gift = (x, y) => rectEl(x - 12, y - 4, 24, 16, outline('#b39ddb', { rx: 3, strokeWidth: 2 })) + rectEl(x - 14, y - 9, 28, 7, outline('#9575cd', { rx: 2, strokeWidth: 2 })) + pathEl(`M${x} ${y - 9}v21`, { stroke: '#fff', strokeWidth: 3 }) + circleEl(x - 5, y - 13, 4, outline('#fff', { strokeWidth: 2 })) + circleEl(x + 5, y - 13, 4, outline('#fff', { strokeWidth: 2 }));
const cup = (x, y) => pathEl(`M${x - 11} ${y - 7}h22l-3 17h-16z`, outline('#ffc08a', { strokeWidth: 2 })) + pathEl(`M${x + 11} ${y - 3}q9 1 7 7q-2 4-9 3`, { fill: 'none', stroke: OUT_SOFT, strokeWidth: 2.5 }) + pathEl(`M${x - 4} ${y - 12}q2-4 0-7M${x + 3} ${y - 12}q2-4 0-7`, { fill: 'none', stroke: OUT_SOFT, strokeWidth: 2, ...ROUND });
const bloom = (x, y) => [0, 72, 144, 216, 288].map((a) => circleEl(x + Math.cos((a * Math.PI) / 180) * 8, y + Math.sin((a * Math.PI) / 180) * 8, 6, outline('#ff9ec7', { strokeWidth: 1.8 }))).join('') + circleEl(x, y, 5, outline('#ffe066', { strokeWidth: 1.8 }));
const candy = (x, y) => pathEl(`M${x - 10} ${y}l-9-7v14zM${x + 10} ${y}l9-7v14z`, outline('#ff9ed0', { strokeWidth: 2 })) + circleEl(x, y, 10, outline('#ff6fb1', { strokeWidth: 2 })) + pathEl(`M${x - 6} ${y - 5}q6 2 4 9`, { fill: 'none', stroke: '#fff', strokeWidth: 2.5, ...ROUND });
const note = (x, y) => circleEl(x - 5, y + 8, 6, outline('#8c9eff', { strokeWidth: 2 })) + pathEl(`M${x + 1} ${y + 8}V${y - 11}q8 1 9 8`, { fill: 'none', stroke: OUT_SOFT, strokeWidth: 3, ...ROUND });
const sport = (x, y) => circleEl(x, y, 12, outline('#ffd27a', { strokeWidth: 2 })) + pathEl(`M${x - 12} ${y}h24M${x} ${y - 12}v24M${x - 8} ${y - 8}q8 8 0 16M${x + 8} ${y - 8}q-8 8 0 16`, { fill: 'none', stroke: OUT_SOFT, strokeWidth: 1.8 });
