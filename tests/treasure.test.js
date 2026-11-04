import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, MAP_IDS } from '../js/maps.js';
import { trackContacts } from '../js/chat.js';
import { AVATAR_R, WORLD, dist, isFree, pickSpawn } from '../js/world.js';
import { CHEST_R, MAX_CHESTS, OPEN_DIST, REARM_DIST, chestProgress, cleanDrafts, scatterChests, shownAnswer, ungraded } from '../js/treasure.js';
import { regions } from './helpers/regions.js';

// A small deterministic random source (mulberry32), so a failing layout can be reproduced.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- where the boxes go
test('a box is about as big as a small avatar and opens when the two touch', () => {
  assert.equal(OPEN_DIST, AVATAR_R + CHEST_R);
  assert.ok(REARM_DIST > OPEN_DIST);
});

for (const id of MAP_IDS) {
  const map = MAPS[id];

  test(`${id}: a full set of boxes always fits, on reachable ground, clear of walls`, () => {
    const { at } = regions(map);
    const main = at(map.spawns[0]);
    for (let seed = 1; seed <= 25; seed++) {
      const spots = scatterChests(map, MAX_CHESTS, [], seeded(seed));
      assert.equal(spots.length, MAX_CHESTS, `seed ${seed}`);
      for (const p of spots) {
        assert.ok(isFree(p, map), `seed ${seed}: ${JSON.stringify(p)} is blocked`);
        assert.ok(isFree(p, map, [], OPEN_DIST), `seed ${seed}: ${JSON.stringify(p)} is too close to a wall to be touched from every side`);
        assert.equal(at(p), main, `seed ${seed}: ${JSON.stringify(p)} is walled off from the spawn points`);
        assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x <= WORLD.w && p.y <= WORLD.h);
      }
    }
  });

  test(`${id}: nobody can touch two boxes at once, and nobody spawns touching one`, () => {
    for (let seed = 1; seed <= 25; seed++) {
      const spots = scatterChests(map, 3 * MAX_CHESTS, [], seeded(seed)); // more than fit, so the map is packed as full as it gets
      assert.ok(spots.length >= MAX_CHESTS, `seed ${seed}: only ${spots.length} boxes fit`);
      spots.forEach((a, i) => {
        for (const b of spots.slice(i + 1)) assert.ok(dist(a, b) > 2 * OPEN_DIST, `seed ${seed}: two boxes are ${Math.round(dist(a, b))} apart`);
        // pickSpawn puts a newcomer up to 70 units off a spawn point on each axis
        for (const s of map.spawns) assert.ok(dist(a, s) > OPEN_DIST + 70 * Math.SQRT2, `seed ${seed}: a box is ${Math.round(dist(a, s))} from a spawn point`);
      });
    }
  });

  test(`${id}: a second drop keeps clear of the boxes already there`, () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rand = seeded(seed);
      const first = scatterChests(map, 6, [], rand);
      const second = scatterChests(map, 6, first, rand);
      assert.equal(second.length, 6, `seed ${seed}`);
      for (const p of second) for (const q of first) assert.ok(dist(p, q) > 2 * OPEN_DIST, `seed ${seed}`);
    }
  });
}

test('the same random source gives the same layout', () => {
  assert.deepEqual(scatterChests(MAPS.school, 8, [], seeded(7)), scatterChests(MAPS.school, 8, [], seeded(7)));
  assert.notDeepEqual(scatterChests(MAPS.school, 8, [], seeded(7)), scatterChests(MAPS.school, 8, [], seeded(8)));
});

test('a map without enough room gives back fewer boxes instead of failing', () => {
  const wall = (x, y, w, h) => ({ x, y, w, h });
  const room = { rects: [wall(0, 0, 1920, 100), wall(0, 400, 1920, 680), wall(0, 100, 100, 300), wall(400, 100, 1520, 300)], circles: [], spawns: [{ x: 1500, y: 800 }] };
  const spots = scatterChests(room, 10, [], seeded(3));
  assert.ok(spots.length >= 1 && spots.length < 10, `${spots.length} boxes in a 300x300 room`);
  for (const p of spots) assert.ok(p.x > 100 && p.x < 400 && p.y > 100 && p.y < 400);
  const solid = { rects: [wall(0, 0, WORLD.w, WORLD.h)], circles: [], spawns: [{ x: 5, y: 5 }] };
  assert.deepEqual(scatterChests(solid, 3, [], seeded(1)), []);
  assert.deepEqual(scatterChests(MAPS.school, 0), []);
});

test('pickSpawn stays within the spread that the keep-clear distance around spawn points assumes', () => {
  const map = MAPS.school;
  for (let i = 0; i < 200; i++) {
    const p = pickSpawn(map);
    assert.ok(map.spawns.some((s) => Math.abs(p.x - s.x) <= 70 && Math.abs(p.y - s.y) <= 70));
  }
});

// ---- touching a box
test('a box opens on contact, stays put while you linger, and can open again after you step away', () => {
  const touch = trackContacts(new Set(), new Map([['c1', OPEN_DIST]]), OPEN_DIST, REARM_DIST);
  assert.deepEqual(touch.opened, ['c1']);
  const linger = trackContacts(touch.next, new Map([['c1', REARM_DIST - 1]]), OPEN_DIST, REARM_DIST);
  assert.deepEqual(linger.opened, []);
  assert.deepEqual([...linger.next], ['c1']);
  const away = trackContacts(linger.next, new Map([['c1', REARM_DIST + 1]]), OPEN_DIST, REARM_DIST);
  assert.deepEqual(away.closed, ['c1']);
  const back = trackContacts(away.next, new Map([['c1', OPEN_DIST - 1]]), OPEN_DIST, REARM_DIST);
  assert.deepEqual(back.opened, ['c1']);
});

test('a box that is just out of reach does not open', () => {
  assert.deepEqual(trackContacts(new Set(), new Map([['c1', OPEN_DIST + 1]]), OPEN_DIST, REARM_DIST).opened, []);
});

// ---- marking answers
const chests = { c1: { type: 'choice', options: ['A', 'B'] }, c2: { type: 'text' } };
const keys = { c1: '1', c2: 'paris|the city of light' };
const byBox = (jobs) => Object.fromEntries(jobs.map((j) => [`${j.uid}/${j.cid}`, j]));

test('every answer that has no result yet gets marked', () => {
  const answers = { u1: { c1: { v: '1' }, c2: { v: 'PARIS' } }, u2: { c1: { v: '0' }, c2: { v: 'rome' } } };
  const jobs = byBox(ungraded(chests, keys, answers, {}));
  assert.deepEqual(Object.keys(jobs).sort(), ['u1/c1', 'u1/c2', 'u2/c1', 'u2/c2']);
  assert.deepEqual([jobs['u1/c1'].ok, jobs['u1/c2'].ok, jobs['u2/c1'].ok, jobs['u2/c2'].ok], [true, true, false, false]);
});

test('a wrong answer is shown the right one: the option, or the first accepted answer', () => {
  const jobs = byBox(ungraded(chests, keys, { u2: { c1: { v: '0' }, c2: { v: 'rome' } } }, {}));
  assert.equal(jobs['u2/c1'].answer, '1');
  assert.equal(jobs['u2/c2'].answer, 'paris');
  assert.equal(shownAnswer(chests.c2, ' Paris | the city of light'), 'Paris');
});

test('answers that already have a result are never marked twice', () => {
  const answers = { u1: { c1: { v: '1' }, c2: { v: 'paris' } } };
  const jobs = ungraded(chests, keys, answers, { u1: { c1: { ok: true } } });
  assert.deepEqual(jobs.map((j) => j.cid), ['c2']);
  assert.deepEqual(ungraded(chests, keys, answers, { u1: { c1: { ok: true }, c2: { ok: false } } }), []);
});

test('answers to boxes that are gone, or that have no key yet, wait', () => {
  const answers = { u1: { c1: { v: '1' }, c2: { v: 'paris' }, c3: { v: 'x' } } };
  assert.deepEqual(ungraded(chests, keys, answers, {}).map((j) => j.cid), ['c1', 'c2']); // c3 was removed
  assert.deepEqual(ungraded(chests, { c2: keys.c2 }, answers, {}).map((j) => j.cid), ['c2']);
  assert.deepEqual(ungraded(chests, { c1: '', c2: null }, answers, {}), []);
  assert.deepEqual(ungraded(undefined, undefined, undefined, undefined), []);
});

test('a key of 0 is a real answer, not a missing one', () => {
  const jobs = ungraded({ c1: chests.c1 }, { c1: '0' }, { u1: { c1: { v: '0' } } }, {});
  assert.deepEqual(jobs.map((j) => j.ok), [true]);
});

// ---- the teacher's progress rows
test('progress counts only the students listed, and only right answers as correct', () => {
  const answers = { u1: { c1: { v: '1' } }, u2: { c1: { v: '0' } }, gone: { c1: { v: '1' } } };
  const results = { u1: { c1: { ok: true } }, u2: { c1: { ok: false } }, gone: { c1: { ok: true } } };
  assert.deepEqual(chestProgress('c1', ['u1', 'u2', 'u3'], answers, results), { answered: 2, correct: 1 });
  assert.deepEqual(chestProgress('c2', ['u1'], answers, results), { answered: 0, correct: 0 });
  assert.deepEqual(chestProgress('c1', [], undefined, undefined), { answered: 0, correct: 0 });
});

// ---- questions saved in the browser
test('saved drafts keep the questions this app wrote and drop everything else', () => {
  const good = [
    { text: 'Capital of France?', type: 'choice', options: ['Paris', 'Rome'], key: '0' },
    { text: 'Two plus two?', type: 'text', key: '4 | four' },
  ];
  assert.deepEqual(cleanDrafts(good), good);
  const junk = [
    null,
    'text',
    { text: '', type: 'text', key: 'x' },
    { text: 'No key', type: 'text', key: '' },
    { text: 'Bad type', type: 'essay', key: 'x' },
    { text: 'One option', type: 'choice', options: ['A'], key: '0' },
    { text: 'Blank option', type: 'choice', options: ['A', ' '], key: '0' },
    { text: 'Key off the end', type: 'choice', options: ['A', 'B'], key: '2' },
    { text: 'Key below zero', type: 'choice', options: ['A', 'B'], key: '-1' },
    { text: 'Key not a number', type: 'choice', options: ['A', 'B'], key: 'A' },
    { text: 'x'.repeat(201), type: 'text', key: 'x' },
  ];
  assert.deepEqual(cleanDrafts(junk), []);
  assert.deepEqual(cleanDrafts('nonsense'), []);
  assert.deepEqual(cleanDrafts(undefined), []);
});

test('saved drafts are trimmed to what can be dropped and lose unknown fields', () => {
  const many = Array.from({ length: MAX_CHESTS + 5 }, (_, i) => ({ text: `Q${i}`, type: 'text', key: 'a', extra: 'ignored' }));
  const clean = cleanDrafts(many);
  assert.equal(clean.length, MAX_CHESTS);
  assert.deepEqual(Object.keys(clean[0]).sort(), ['key', 'text', 'type']);
});
