import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addBubble, inPair, pairId, partnerOf, pruneBubbles, trackContacts } from '../js/chat.js';
import { BUMP_DIST, CHAT_CLOSE_DIST } from '../js/world.js';

test('both phones compute the same pair id', () => {
  assert.equal(pairId('bob', 'alice'), pairId('alice', 'bob'));
  assert.equal(pairId('alice', 'bob'), 'alice_bob');
});

test('partnerOf and inPair read a pair id', () => {
  assert.equal(partnerOf('alice_bob', 'alice'), 'bob');
  assert.equal(partnerOf('alice_bob', 'bob'), 'alice');
  assert.ok(inPair('alice_bob', 'bob'));
  assert.ok(!inPair('alice_bob', 'carol'));
});

test('a chat opens only when avatars touch', () => {
  const far = trackContacts(new Set(), new Map([['bob', BUMP_DIST + 1]]));
  assert.deepEqual([...far.next], []);
  const touch = trackContacts(new Set(), new Map([['bob', BUMP_DIST]]));
  assert.deepEqual(touch.opened, ['bob']);
  assert.deepEqual([...touch.next], ['bob']);
});

test('an open chat survives a little drifting but closes once they are apart', () => {
  const open = new Set(['bob']);
  const drift = trackContacts(open, new Map([['bob', CHAT_CLOSE_DIST - 1]]));
  assert.deepEqual([...drift.next], ['bob']);
  assert.deepEqual(drift.opened, []);
  const apart = trackContacts(open, new Map([['bob', CHAT_CLOSE_DIST + 1]]));
  assert.deepEqual([...apart.next], []);
  assert.deepEqual(apart.closed, ['bob']);
});

test('after a chat closes, drifting back into the gap does not reopen it', () => {
  const again = trackContacts(new Set(), new Map([['bob', CHAT_CLOSE_DIST - 1]]));
  assert.deepEqual([...again.next], []);
});

test('a neighbour who disappears closes their chat', () => {
  const gone = trackContacts(new Set(['bob']), new Map());
  assert.deepEqual(gone.closed, ['bob']);
});

test('several contacts can be open at once', () => {
  const r = trackContacts(new Set(), new Map([['bob', 10], ['carol', 20], ['dan', 500]]));
  assert.deepEqual(r.opened.sort(), ['bob', 'carol']);
});

test('a speaker keeps their last two bubbles and they expire', () => {
  const bubbles = new Map();
  addBubble(bubbles, 'a', 'one', 0, 'a_b', 1000);
  addBubble(bubbles, 'a', 'two', 10, 'a_b', 1000);
  addBubble(bubbles, 'a', 'three', 20, 'a_b', 1000);
  assert.deepEqual(bubbles.get('a').map((b) => b.text), ['two', 'three']);
  pruneBubbles(bubbles, 1015);
  assert.deepEqual(bubbles.get('a').map((b) => b.text), ['three']);
  pruneBubbles(bubbles, 2000);
  assert.equal(bubbles.has('a'), false);
});

test('closing a chat takes its bubbles with it', () => {
  const bubbles = new Map();
  addBubble(bubbles, 'a', 'hi bob', 0, 'a_b');
  addBubble(bubbles, 'a', 'hi carol', 0, 'a_c');
  pruneBubbles(bubbles, 1, (pair) => pair !== 'a_b');
  assert.deepEqual(bubbles.get('a').map((b) => b.text), ['hi carol']);
});
