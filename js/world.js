// Movement and collision on the shared map. Pure functions so the same rules run on phones and in tests.
// Units are map units: every map is WORLD.w x WORLD.h and the camera decides how big that looks.
export const WORLD = { w: 1920, h: 1080 };
export const AVATAR_R = 22;
export const SPEED = 230; // units per second at full joystick tilt

export const BUMP_DIST = AVATAR_R * 2 + 4; // centres this close = touching: a chat opens
export const CHAT_CLOSE_DIST = AVATAR_R * 2 + 56; // ...and closes once the pair drifts this far apart

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Each push helper moves p (a mutable {x, y}) just outside the shape and reports whether it had to.
function pushFromRect(p, r, rc) {
  const cx = clamp(p.x, rc.x, rc.x + rc.w);
  const cy = clamp(p.y, rc.y, rc.y + rc.h);
  const dx = p.x - cx;
  const dy = p.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    p.x = cx + (dx / d) * r;
    p.y = cy + (dy / d) * r;
    return true;
  }
  // centre is inside the rect: leave through the nearest side
  const left = p.x - rc.x;
  const right = rc.x + rc.w - p.x;
  const top = p.y - rc.y;
  const bottom = rc.y + rc.h - p.y;
  const nearest = Math.min(left, right, top, bottom);
  if (nearest === left) p.x = rc.x - r;
  else if (nearest === right) p.x = rc.x + rc.w + r;
  else if (nearest === top) p.y = rc.y - r;
  else p.y = rc.y + rc.h + r;
  return true;
}

function pushFromCircle(p, r, c) {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const min = r + c.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2);
  if (d < 1e-6) p.x = c.x + min;
  else {
    p.x = c.x + (dx / d) * min;
    p.y = c.y + (dy / d) * min;
  }
  return true;
}

// Slide an avatar out of walls, props, other avatars and the map edge. `map` is { rects, circles }.
export function resolve(pos, map, others = [], r = AVATAR_R) {
  const p = { x: pos.x, y: pos.y };
  for (let pass = 0; pass < 4; pass++) {
    let hit = false;
    for (const rc of map.rects) hit = pushFromRect(p, r, rc) || hit;
    for (const c of map.circles) hit = pushFromCircle(p, r, c) || hit;
    for (const o of others) hit = pushFromCircle(p, r, { x: o.x, y: o.y, r }) || hit;
    p.x = clamp(p.x, r, WORLD.w - r);
    p.y = clamp(p.y, r, WORLD.h - r);
    if (!hit) break;
  }
  return p;
}

// One movement step. `input` is the joystick vector (length 0..1); long frames are capped so nobody tunnels through a wall.
export function move(pos, input, dt, map, others) {
  const len = Math.hypot(input.x, input.y);
  if (len < 0.05) return { x: pos.x, y: pos.y };
  const k = Math.min(1, len) / len;
  const step = SPEED * Math.min(dt, 0.05);
  return resolve({ x: pos.x + input.x * k * step, y: pos.y + input.y * k * step }, map, others);
}

export function isFree(p, map, others = [], r = AVATAR_R) {
  if (p.x < r || p.y < r || p.x > WORLD.w - r || p.y > WORLD.h - r) return false;
  const q = { x: p.x, y: p.y };
  for (const rc of map.rects) if (pushFromRect(q, r - 0.01, rc)) return false;
  for (const c of map.circles) if (pushFromCircle(q, r - 0.01, c)) return false;
  for (const o of others) if (pushFromCircle(q, r - 0.01, { x: o.x, y: o.y, r })) return false;
  return true;
}

// A random free spot near one of the map's spawn points.
export function pickSpawn(map, others = [], rand = Math.random) {
  for (let i = 0; i < 60; i++) {
    const s = map.spawns[Math.floor(rand() * map.spawns.length)];
    const p = { x: s.x + (rand() - 0.5) * 140, y: s.y + (rand() - 0.5) * 140 };
    if (isFree(p, map, others)) return p;
  }
  return { x: map.spawns[0].x, y: map.spawns[0].y };
}

// Where to put someone whose spot is no longer valid (the teacher switched maps): nearest free spawn.
export function relocate(pos, map, others = []) {
  if (isFree(pos, map, others)) return { x: pos.x, y: pos.y };
  return pickSpawn(map, others);
}

// Ease a remote avatar toward its latest reported position; teleports (map switch, rejoin) snap.
export function approach(cur, target, dt, tau = 0.11) {
  if (dist(cur, target) > 320) return { x: target.x, y: target.y };
  const a = 1 - Math.exp(-dt / tau);
  return { x: cur.x + (target.x - cur.x) * a, y: cur.y + (target.y - cur.y) * a };
}
