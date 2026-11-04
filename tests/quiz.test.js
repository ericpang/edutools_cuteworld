import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctSubjects, isCorrect, leaderboard, normalizeAnswer, tally } from '../js/quiz.js';

const choice = { type: 'choice' };
const text = { type: 'text' };

test('short answers ignore case, spacing and punctuation', () => {
  assert.equal(normalizeAnswer('  The  Pacific, Ocean! '), 'the pacific ocean');
  assert.equal(normalizeAnswer(undefined), '');
});

test('multiple choice compares the option index', () => {
  assert.ok(isCorrect(choice, '2', 2));
  assert.ok(isCorrect(choice, 2, '2'));
  assert.ok(!isCorrect(choice, '1', '2'));
});

test('text answers accept any of the alternatives', () => {
  assert.ok(isCorrect(text, 'PARIS', 'paris'));
  assert.ok(isCorrect(text, 'the big apple', 'New York|The Big Apple'));
  assert.ok(!isCorrect(text, '', 'paris'));
  assert.ok(!isCorrect(text, 'rome', 'paris'));
});

test('a question without a key is never graded', () => {
  assert.ok(!isCorrect(choice, '0', undefined));
  assert.ok(!isCorrect(text, 'x', ''));
});

test('correctSubjects picks out the right answers for players or groups', () => {
  const answers = { u1: { v: '1' }, g2: { v: '0' }, u3: { v: '1' } };
  assert.deepEqual(correctSubjects(choice, '1', answers).sort(), ['u1', 'u3']);
  assert.deepEqual(correctSubjects(choice, '1', undefined), []);
});

test('tally counts votes per option and ignores junk', () => {
  const answers = { a: { v: '0' }, b: { v: '2' }, c: { v: '2' }, d: { v: '9' }, e: { v: 'x' } };
  assert.deepEqual(tally(3, answers), [1, 0, 2]);
});

test('the leaderboard ranks by points, shares ranks on ties and separates players from groups', () => {
  const scores = { u1: 3, u2: 3, u3: 1, u4: 0, g1: 5, g2: 2 };
  const name = (id) => ({ u1: 'Zed', u2: 'Amy', u3: 'Bo', u4: 'Cy', g1: 'Group 1', g2: 'Group 2' })[id];
  const players = leaderboard(scores, name, 'players');
  assert.deepEqual(players.map((r) => [r.name, r.rank]), [['Amy', 1], ['Zed', 1], ['Bo', 3]]);
  const groups = leaderboard(scores, name, 'groups');
  assert.deepEqual(groups.map((r) => [r.name, r.rank, r.points]), [['Group 1', 1, 5], ['Group 2', 2, 2]]);
  assert.deepEqual(leaderboard(undefined, name), []);
});
