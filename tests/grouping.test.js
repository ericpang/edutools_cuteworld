import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formGroups, groupColor, groupLabel, groupNumber, isGroupId, smallestGroup } from '../js/grouping.js';

// Small deterministic generator so shuffles are repeatable.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sizes = (assignment) => {
  const counts = {};
  for (const g of Object.values(assignment)) counts[g] = (counts[g] ?? 0) + 1;
  return Object.values(counts).sort();
};
const people = (n) => Array.from({ length: n }, (_, i) => `u${i}`);

test('everyone lands in a group and group sizes differ by at most one', () => {
  for (const [n, size] of [[7, 3], [4, 3], [30, 4], [5, 5], [2, 4], [11, 2]]) {
    const result = formGroups(people(n), size, seeded(n));
    assert.equal(Object.keys(result).length, n);
    const counts = sizes(result);
    assert.ok(counts.at(-1) - counts[0] <= 1, `n=${n} size=${size} -> ${counts}`);
    assert.equal(counts.length, Math.ceil(n / size));
  }
});

test('the shuffle is repeatable for a given generator and differs between seeds', () => {
  assert.deepEqual(formGroups(people(12), 3, seeded(1)), formGroups(people(12), 3, seeded(1)));
  assert.notDeepEqual(formGroups(people(12), 3, seeded(1)), formGroups(people(12), 3, seeded(2)));
});

test('empty classes and silly sizes are safe', () => {
  assert.deepEqual(formGroups([], 3), {});
  assert.deepEqual(Object.values(formGroups(['a', 'b'], 0)).sort(), ['g1', 'g2']);
});

test('latecomers join the emptiest group, lowest number first', () => {
  assert.equal(smallestGroup({ a: 'g1', b: 'g1', c: 'g2' }), 'g2');
  assert.equal(smallestGroup({ a: 'g1', b: 'g2' }), 'g1');
  assert.equal(smallestGroup({}), null);
});

test('a group that emptied out is refilled before the others grow', () => {
  assert.equal(smallestGroup({ a: 'g1', b: 'g1', c: 'g3' }), 'g2');
});

test('group ids read back as labels and colours', () => {
  assert.equal(groupNumber('g3'), 3);
  assert.equal(groupLabel('g12'), 'Group 12');
  assert.ok(isGroupId('g3') && !isGroupId('abc123') && !isGroupId('g'));
  assert.equal(groupColor('g1'), groupColor('g9'));
});
