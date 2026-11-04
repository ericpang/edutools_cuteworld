import { DECO, FLOOR, GROUND, Level, PATH, W, H, ball, block, circleEl, ellipseEl, flower, frame, lineEl, outline, pathEl, rectEl, rng, scatter, tree, tuft, wallH, wallV } from './kit.mjs';

const T = 20; // wall thickness
const WALL = { fill: '#f7b6c6', rx: 4 };
const ROUND = { strokeLinecap: 'round', strokeLinejoin: 'round' };
const OUT_SOFT = '#5b4a6b99'; // outline for small details on top of props

// A school campus seen from above: a roofless building (classroom, library, lab, hall) and a playground,
// court, field and pond around it.
export function school() {
  const L = new Level('school', 'School', '🏫', '#c3ebae');
  const rand = rng(21);

  L.defs.push(
    '<pattern id="planks" width="80" height="26" patternUnits="userSpaceOnUse"><rect width="80" height="26" fill="#ffe3ae"/><path d="M0 25H80M40 0V26" stroke="#f0c77a" stroke-width="2" fill="none"/></pattern>',
    '<pattern id="tiles" width="70" height="70" patternUnits="userSpaceOnUse"><rect width="70" height="70" fill="#fdf0dc"/><rect width="35" height="35" fill="#f8e4c6"/><rect x="35" y="35" width="35" height="35" fill="#f8e4c6"/></pattern>',
    '<pattern id="checks" width="60" height="60" patternUnits="userSpaceOnUse"><rect width="60" height="60" fill="#e7f6dc"/><rect width="30" height="30" fill="#d3eec2"/><rect x="30" y="30" width="30" height="30" fill="#d3eec2"/></pattern>',
    '<pattern id="mow" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="80" height="80" fill="#b7e49c"/><rect width="40" height="80" fill="#a9db8d"/></pattern>',
  );

  // Building footprint: x 120..1260, y 100..540. Rooms sit on top, the hall runs underneath.
  const BX0 = 120;
  const BX1 = 1260;
  const BY0 = 100;
  const BY1 = 540;
  const ROW = 360; // y of the wall between the rooms and the hall
  const rooms = [
    { x0: 140, x1: 490 },
    { x0: 510, x1: 860 },
    { x0: 880, x1: 1240 },
  ];
  const doors = rooms.map((r) => {
    const c = (r.x0 + r.x1) / 2;
    return [c - 75, c + 75];
  });

  // ---- ground: paths and plaza
  const road = (pts, width) => {
    const d = `M${pts.map((p) => p.join(' ')).join('L')}`;
    L.floor(PATH, pathEl(d, { fill: 'none', stroke: '#e6d0a4', strokeWidth: width + 12, ...ROUND }));
    L.floor(PATH + 0.5, pathEl(d, { fill: 'none', stroke: '#f6e7c9', strokeWidth: width, ...ROUND }));
  };
  road([[690, 545], [690, 740]], 150);
  road([[690, 740], [430, 800], [250, 770]], 110);
  road([[690, 740], [980, 800], [1130, 850]], 110);
  road([[1262, 445], [1420, 445], [1420, 300]], 100);
  L.floor(PATH, circleEl(690, 740, 162, { fill: '#e6d0a4' }));
  L.floor(PATH + 0.5, circleEl(690, 740, 150, { fill: '#f6e7c9' }));
  L.floor(PATH + 0.6, circleEl(690, 740, 112, { fill: 'none', stroke: '#ead7ae', strokeWidth: 6, strokeDasharray: '2 16', ...ROUND }));

  // ---- the building
  L.floor(FLOOR, rectEl(BX0, BY0, BX1 - BX0, BY1 - BY0, { fill: 'url(#tiles)' }));
  L.floor(FLOOR, rectEl(rooms[0].x0, BY0 + T, 350, ROW - BY0 - T, { fill: 'url(#planks)' }));
  L.floor(FLOOR, rectEl(rooms[1].x0, BY0 + T, 350, ROW - BY0 - T, { fill: '#dcecff' }));
  L.floor(FLOOR, rectEl(rooms[2].x0, BY0 + T, 360, ROW - BY0 - T, { fill: 'url(#checks)' }));
  for (const [g0, g1] of doors) L.floor(DECO, rectEl(g0 + 14, ROW + 2, g1 - g0 - 28, 18, outline('#ffb3c7', { rx: 6, strokeWidth: 2 })));
  L.floor(DECO, rectEl(626, 504, 128, 30, outline('#ffb3c7', { rx: 8, strokeWidth: 2 })));

  wallH(L, BX0, BX1, BY0, T, [], WALL);
  wallV(L, BX0, BY0 + T, BY1, T, [], WALL);
  wallV(L, BX1 - T, BY0 + T, BY1, T, [[385, 505]], WALL);
  wallH(L, BX0 + T, BX1 - T, BY1 - T, T, [[610, 770]], WALL);
  wallV(L, 490, BY0 + T, ROW, T, [], WALL);
  wallV(L, 860, BY0 + T, ROW, T, [], WALL);
  wallH(L, 140, 1240, ROW, T, doors, WALL);

  // Classroom
  {
    const cx = (rooms[0].x0 + rooms[0].x1) / 2;
    L.floor(DECO, rectEl(cx - 66, 123, 132, 16, outline('#3f7a64', { rx: 3 })) + lineEl(cx - 50, 131, cx - 12, 131, { stroke: '#fff', strokeWidth: 2, opacity: 0.7, ...ROUND }) + lineEl(cx + 6, 131, cx + 46, 131, { stroke: '#fff', strokeWidth: 2, opacity: 0.7, ...ROUND }));
    block(L, cx - 60, 152, 120, 42, { fill: '#f0b36a', rx: 8 });
    for (const y of [208, 300]) {
      for (const x of [cx - 107, cx + 43]) {
        block(L, x, y, 64, 36, { fill: '#ffd27a', rx: 7 });
        L.floor(DECO, circleEl(x + 32, y + 48, 13, outline('#ff9bb3')));
      }
    }
    block(L, 148, 125, 88, 24, { fill: '#c98a5b', rx: 5 });
    L.add(150, books(153, 128, 78, 14));
    ball(L, 466, 146, 17, { fill: '#7ed99b' });
  }

  // Library
  {
    const cx = (rooms[1].x0 + rooms[1].x1) / 2;
    L.floor(DECO, ellipseEl(cx, 214, 140, 84, { fill: '#bcdcff', stroke: '#9ec8f2', strokeWidth: 3 }));
    block(L, 530, 140, 26, 130, { fill: '#c98a5b', rx: 5 });
    block(L, 814, 140, 26, 130, { fill: '#c98a5b', rx: 5 });
    L.add(270, books(533, 146, 20, 118, true) + books(817, 146, 20, 118, true));
    for (const [dx, dy] of [[-64, 0], [64, 0], [0, -64], [0, 64]]) L.floor(DECO, circleEl(cx + dx, 204 + dy, 13, outline('#ffb347')));
    ball(L, cx, 204, 40, { fill: '#ffd8a8' });
    ball(L, 574, 320, 20, { fill: '#ff9bb3' });
    ball(L, 796, 320, 20, { fill: '#9be0c5' });
  }

  // Lab
  {
    const cx = (rooms[2].x0 + rooms[2].x1) / 2;
    for (const x of [905, 1125]) {
      block(L, x, 150, 90, 150, { fill: '#cfe8ff', rx: 8 });
      L.add(300, beakers(x + 45, 175) + beakers(x + 45, 245));
    }
    ball(L, cx, 156, 24, { fill: '#7ec8ff' });
    L.add(185, circleEl(cx - 7, 150, 7, { fill: '#7ed99b' }) + circleEl(cx + 8, 162, 5, { fill: '#7ed99b' }));
    ball(L, 1212, 334, 15, { fill: '#7ed99b' });
  }

  // Hall: lockers, trophy case
  block(L, 150, 498, 430, 22, { fill: '#7db9ea', rx: 4 });
  block(L, 800, 498, 430, 22, { fill: '#7db9ea', rx: 4 });
  L.add(520, lockerLines(150, 498, 430) + lockerLines(800, 498, 430));
  block(L, 150, 382, 84, 22, { fill: '#ffe08a', rx: 5 });

  // ---- plaza
  ball(L, 690, 740, 14, { fill: '#ffffff', sw: 3 });
  L.add(745, pathEl('M690 726l38 12l-38 12z', { ...outline('#ff6b81', { strokeWidth: 2.5 }) }));
  block(L, 500, 830, 92, 26, { fill: '#d9a066', rx: 6 });
  block(L, 790, 830, 92, 26, { fill: '#d9a066', rx: 6 });

  // ---- playground (south-west)
  L.floor(DECO, rectEl(130, 900, 240, 120, outline('#fbe3a4', { rx: 26 })) + circleEl(180, 950, 9, { fill: '#ff8aa6' }) + circleEl(300, 975, 6, { fill: '#6ec6ff' }));
  block(L, 132, 650, 170, 18, { fill: '#ff8aa6', rx: 8 });
  L.add(670, swing(177, 668) + swing(257, 668));
  block(L, 390, 640, 56, 150, { fill: '#6ec6ff', rx: 24 });
  L.add(790, pathEl('M404 660h28M404 690h28M404 720h28M404 750h28', { stroke: '#fff', strokeWidth: 3, opacity: 0.7, ...ROUND }));
  ball(L, 230, 800, 50, { fill: '#ffd86b' });
  L.add(851, pathEl('M230 800L230 750M230 800L273 825M230 800L187 825', { stroke: '#ff8aa6', strokeWidth: 8, ...ROUND, opacity: 0.85 }));
  ball(L, 100, 790, 18, { fill: '#ff9bb3' });
  ball(L, 100, 850, 18, { fill: '#9be0c5' });
  // school bus
  block(L, 400, 956, 300, 84, { fill: '#ffd23f', rx: 22 });
  L.add(1040, [0, 1, 2, 3, 4].map((i) => rectEl(424 + i * 52, 972, 40, 26, outline('#bfe9ff', { rx: 6, strokeWidth: 2.5 }))).join('') + rectEl(410, 1012, 280, 6, { fill: '#e8a800', opacity: 0.7, rx: 3 }));

  // ---- court (south-east)
  L.floor(
    DECO,
    rectEl(1010, 720, 520, 290, outline('#ffb9a8', { rx: 18 })) +
      rectEl(1030, 740, 480, 250, { fill: 'none', stroke: '#fff', strokeWidth: 4, rx: 8 }) +
      lineEl(1270, 740, 1270, 990, { stroke: '#fff', strokeWidth: 4 }) +
      circleEl(1270, 865, 52, { fill: 'none', stroke: '#fff', strokeWidth: 4 }) +
      rectEl(1030, 800, 90, 130, { fill: 'none', stroke: '#fff', strokeWidth: 4 }) +
      rectEl(1420, 800, 90, 130, { fill: 'none', stroke: '#fff', strokeWidth: 4 }),
  );
  block(L, 1018, 830, 12, 70, { fill: '#ff6b6b', rx: 4 });
  block(L, 1510, 830, 12, 70, { fill: '#ff6b6b', rx: 4 });

  // ---- field, pond and garden (north-east)
  L.floor(DECO, rectEl(1320, 90, 540, 300, outline('url(#mow)', { rx: 20 })) + lineEl(1590, 100, 1590, 380, { stroke: '#fff', strokeWidth: 4, opacity: 0.8 }) + circleEl(1590, 240, 46, { fill: 'none', stroke: '#fff', strokeWidth: 4, opacity: 0.8 }));
  block(L, 1326, 185, 14, 110, { fill: '#ffffff', rx: 4 });
  block(L, 1840, 185, 14, 110, { fill: '#ffffff', rx: 4 });
  ball(L, 1750, 500, 70, { fill: '#8fd3ff' });
  L.add(570, lily(1730, 485, 14) + lily(1775, 520, 11) + lily(1710, 528, 9));
  block(L, 1480, 440, 180, 44, { fill: '#e8b98a', rx: 14 });
  L.add(485, [0, 1, 2, 3, 4].map((i) => flower(1504 + i * 34, 462, ['#ff9ec7', '#ffd54f', '#ff8a65', '#b39ddb', '#80deea'][i])).join(''));
  block(L, 1440, 548, 116, 48, { fill: '#e7b27a', rx: 10 });

  // ---- trees
  for (const [x, y, r] of [
    [78, 630, 40], [76, 745, 36], [80, 1010, 42], [1180, 630, 44], [1240, 660, 38], [900, 600, 40],
    [1838, 640, 46], [1834, 760, 40], [1842, 870, 44], [1836, 980, 46], [1730, 1000, 38], [880, 1010, 44],
  ]) tree(L, x, y, r);

  frame(L, '#5fbf72'); // hedge border

  // ---- scenery (after all solids so it never lands under a wall or prop)
  const grass = [];
  scatter(L, rand, 420, { x: 24, y: 24, w: W - 48, h: H - 48 }, (x, y) => { grass.push(tuft(x, y)); return null; }, { pad: 8 });
  L.floor(GROUND, pathEl(grass.join(''), { fill: 'none', stroke: '#a6d98c', strokeWidth: 2.4, ...ROUND }));
  const petals = ['#ff9ec7', '#ffd54f', '#fff', '#b39ddb', '#ffab91'];
  const inside = (x, y, [x0, y0, w, h]) => x > x0 && x < x0 + w && y > y0 && y < y0 + h;
  const painted = [[1000, 700, 560, 330], [120, 890, 270, 150], [1300, 70, 580, 340]]; // court, sandbox, field
  const offPaths = (x, y) => Math.hypot(x - 690, y - 740) > 175 && !(Math.abs(x - 690) < 90 && y < 560) && !painted.some((r) => inside(x, y, r));
  scatter(L, rand, 70, { x: 40, y: 560, w: W - 80, h: H - 600 }, (x, y, r) => (offPaths(x, y) ? flower(x, y, petals[Math.floor(r() * petals.length)]) : null), { pad: 30 });

  for (const [x, y] of [[560, 640], [690, 620], [820, 640], [690, 860]]) L.spawn(x, y);
  return L;
}

// ---- small drawing helpers shared by the school props
function books(x, y, w, h, vertical = false) {
  const colors = ['#ff7eb6', '#4fc3f7', '#ffca28', '#81c784', '#b39ddb', '#ff8a65'];
  const out = [];
  for (let i = 0, p = 0; p < (vertical ? h : w) - 8; i++) {
    const t = 7 + (i % 3) * 2;
    out.push(vertical ? rectEl(x, y + p, w, t, { fill: colors[i % 6], rx: 1.5, stroke: OUT_SOFT, strokeWidth: 1 }) : rectEl(x + p, y, t, h, { fill: colors[i % 6], rx: 1.5, stroke: OUT_SOFT, strokeWidth: 1 }));
    p += t + 1;
  }
  return out.join('');
}
function beakers(cx, y) {
  return (
    circleEl(cx - 18, y + 6, 9, { fill: '#ff9bb3', stroke: OUT_SOFT, strokeWidth: 2 }) +
    circleEl(cx + 8, y + 10, 8, { fill: '#9be0c5', stroke: OUT_SOFT, strokeWidth: 2 }) +
    rectEl(cx + 14, y - 6, 10, 22, { fill: '#ffd86b', rx: 3, stroke: OUT_SOFT, strokeWidth: 2 })
  );
}

function lockerLines(x, y, w) {
  let d = '';
  for (let i = 1; i < w / 36; i++) d += `M${x + i * 36} ${y + 3}v16`;
  return pathEl(d, { stroke: '#4a8bbf', strokeWidth: 2, opacity: 0.8 });
}

function swing(x, y) {
  return pathEl(`M${x - 14} ${y}v44M${x + 14} ${y}v44`, { stroke: OUT_SOFT, strokeWidth: 3, ...ROUND }) + rectEl(x - 18, y + 42, 36, 9, outline('#ffd86b', { rx: 4, strokeWidth: 2.5 }));
}

function lily(x, y, r) {
  return circleEl(x, y, r, { fill: '#6fd08c', stroke: '#3fa862', strokeWidth: 2 }) + pathEl(`M${x} ${y}L${x + r} ${y - r * 0.3}`, { stroke: '#8fd3ff', strokeWidth: 3 });
}
