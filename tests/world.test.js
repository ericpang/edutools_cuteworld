import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_R, WORLD, approach, isFree, move, pickSpawn, relocate, resolve } from '../js/world.js';

const empty = { rects: [], circles: [], spawns: [{ x: 300, y: 300 }] };
const wall = { rects: [{ x: 500, y: 100, w: 16, h: 600 }], circles: [], spawns: [{ x: 300, y: 300 }] };
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} is not within ${eps} of ${b}`);

test('an avatar cannot leave the map', () => {
  const p = resolve({ x: -50, y: WORLD.h + 50 }, empty);
  assert.deepEqual(p, { x: AVATAR_R, y: WORLD.h - AVATAR_R });
});

test('a wall stops movement but not the sliding along it', () => {
  let p = { x: 440, y: 300 };
  for (let i = 0; i < 60; i++) p = move(p, { x: 1, y: 0.5 }, 1 / 60, wall, []);
  near(p.x, 500 - AVATAR_R);
  assert.ok(p.y > 300, 'should keep sliding down the wall');
});

test('a long frame cannot tunnel through a thin wall', () => {
  let p = { x: 500 - AVATAR_R, y: 300 };
  p = move(p, { x: 1, y: 0 }, 5, wall, []); // dt is capped inside move()
  assert.ok(p.x <= 500 - AVATAR_R + 0.01);
});

test('circular props push avatars around them', () => {
  const tree = { rects: [], circles: [{ x: 400, y: 300, r: 50 }], spawns: [] };
  const p = resolve({ x: 440, y: 300 }, tree);
  near(p.x, 400 + 50 + AVATAR_R);
  near(p.y, 300);
});

test('a centre buried inside a rect is pushed out the nearest side', () => {
  const box = { rects: [{ x: 100, y: 100, w: 200, h: 100 }], circles: [] };
  const p = resolve({ x: 110, y: 150 }, box);
  near(p.x, 100 - AVATAR_R);
});

test('other avatars are solid, which is what makes a bump', () => {
  const other = { x: 400, y: 300 };
  const p = move({ x: 350, y: 300 }, { x: 1, y: 0 }, 0.05, empty, [other]); // one 11.5-unit step reaches contact
  near(Math.hypot(p.x - other.x, p.y - other.y), AVATAR_R * 2);
});

test('joystick input below the dead zone does not move the avatar', () => {
  assert.deepEqual(move({ x: 10, y: 10 }, { x: 0.02, y: 0 }, 0.016, empty, []), { x: 10, y: 10 });
});

test('over-length joystick vectors are clamped to full speed', () => {
  const a = move({ x: 500, y: 500 }, { x: 1, y: 0 }, 0.05, empty, []);
  const b = move({ x: 500, y: 500 }, { x: 5, y: 0 }, 0.05, empty, []);
  assert.deepEqual(a, b);
});

test('isFree and pickSpawn agree about blocked ground', () => {
  assert.ok(isFree({ x: 300, y: 300 }, wall));
  assert.ok(!isFree({ x: 505, y: 300 }, wall));
  assert.ok(!isFree({ x: 5, y: 300 }, wall));
  for (let i = 0; i < 50; i++) assert.ok(isFree(pickSpawn(wall, []), wall));
});

test('relocate leaves valid positions alone and rescues buried ones', () => {
  assert.deepEqual(relocate({ x: 300, y: 300 }, wall), { x: 300, y: 300 });
  assert.ok(isFree(relocate({ x: 508, y: 300 }, wall), wall));
});

test('approach eases toward the target and snaps across big jumps', () => {
  let p = { x: 0, y: 0 };
  for (let i = 0; i < 120; i++) p = approach(p, { x: 100, y: 0 }, 1 / 60);
  near(p.x, 100, 0.5);
  assert.deepEqual(approach({ x: 0, y: 0 }, { x: 900, y: 0 }, 1 / 60), { x: 900, y: 0 });
});
