import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAPS, MAP_IDS } from '../js/maps.js';
import { WORLD, isFree } from '../js/world.js';
import { buildAll } from '../tools/build-maps.mjs';

const root = new URL('../', import.meta.url);
const CELL = 8; // flood-fill resolution in map units

// Label every walkable cell (one where an avatar's centre may stand) with the connected region it belongs to.
function regions(map) {
  const cols = Math.floor(WORLD.w / CELL);
  const rows = Math.floor(WORLD.h / CELL);
  const label = new Int32Array(cols * rows).fill(-2); // -2 blocked, -1 walkable but not yet visited
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isFree({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 }, map)) label[r * cols + c] = -1;
    }
  }
  const sizes = [];
  for (let start = 0; start < label.length; start++) {
    if (label[start] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const i = stack.pop();
      size++;
      const c = i % cols;
      for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) {
        if (j >= 0 && j < label.length && label[j] === -1) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    sizes.push(size);
  }
  const at = (p) => label[Math.floor(p.y / CELL) * cols + Math.floor(p.x / CELL)];
  return { sizes, at };
}

test('there are three maps: school, jungle and shopping', () => {
  assert.deepEqual(MAP_IDS, ['school', 'jungle', 'shopping']);
});

for (const id of MAP_IDS) {
  const map = MAPS[id];

  test(`${id}: artwork exists and matches the map size`, async () => {
    const svg = await readFile(new URL(map.src, root), 'utf8');
    assert.match(svg, new RegExp(`<svg [^>]*width="${WORLD.w}" height="${WORLD.h}" viewBox="0 0 ${WORLD.w} ${WORLD.h}"`));
  });

  test(`${id}: every obstacle lies on the map`, () => {
    for (const r of map.rects) {
      assert.ok(r.w > 0 && r.h > 0 && r.x >= 0 && r.y >= 0 && r.x + r.w <= WORLD.w && r.y + r.h <= WORLD.h, `rect ${JSON.stringify(r)}`);
    }
    for (const c of map.circles) {
      assert.ok(c.r > 0 && c.x >= 0 && c.x <= WORLD.w && c.y >= 0 && c.y <= WORLD.h, `circle ${JSON.stringify(c)}`);
    }
  });

  test(`${id}: spawn points are free and share one walkable area`, () => {
    assert.ok(map.spawns.length >= 3, 'needs a few spawn points');
    const { at } = regions(map);
    for (const s of map.spawns) assert.ok(isFree(s, map), `spawn ${JSON.stringify(s)} is blocked`);
    assert.equal(new Set(map.spawns.map(at)).size, 1, 'spawn points are cut off from each other');
  });

  test(`${id}: nobody can be trapped (all walkable ground is reachable from the spawn points)`, () => {
    const { sizes, at } = regions(map);
    const main = at(map.spawns[0]);
    const total = sizes.reduce((a, b) => a + b, 0);
    assert.ok(sizes[main] / total >= 0.98, `only ${((sizes[main] / total) * 100).toFixed(1)}% is reachable`);
    sizes.forEach((size, i) => {
      assert.ok(i === main || size <= 40, `a walled-off pocket of ${size} cells exists (region ${i})`);
    });
  });
}

test('the committed map files are what the generator produces', async () => {
  for (const [path, expected] of buildAll()) {
    const actual = await readFile(new URL(path, root), 'utf8');
    assert.equal(actual.replace(/\r\n/g, '\n'), expected, `${path} is stale: run npm run build:maps`);
  }
});
