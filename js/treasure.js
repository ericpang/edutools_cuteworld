// Treasure boxes: where they go, when a student is touching one, and which answers still need marking.
// Pure functions with no DOM or Firebase imports, so the same rules run on the phones, the big screen and in tests.
import { AVATAR_R, WORLD, dist, isFree } from './world.js';
import { MAX_OPTIONS, isCorrect } from './quiz.js';

export const CHEST_R = 20; // a box is about as wide as a small avatar
export const OPEN_DIST = AVATAR_R + CHEST_R; // centres this close = touching: the box opens
export const REARM_DIST = OPEN_DIST + 40; // ...and can open again once the student has stepped this far away
export const MAX_CHESTS = 12; // per class: plenty to hunt for, and every map has room for far more

const CLEARANCE = 56; // free ground all round a box, so it never hides in a corner or a doorway
const MIN_GAP = 160; // boxes sit at least this far apart, so nobody can touch two at once
const SPAWN_GAP = 150; // ...and clear of where new students appear (pickSpawn lands them up to ~100 units from a spawn point)
const CANDIDATES = 12; // valid spots weighed for each box; the one furthest from the other boxes wins
const ATTEMPTS = 600; // random draws allowed per box before giving up on a crowded map

// Random spots for `count` boxes, spread out rather than clumped. `taken` holds boxes already on the map.
// Returns fewer spots than asked for if the map has no room left. `rand` is injectable for tests.
export function scatterChests(map, count, taken = [], rand = Math.random) {
  const spots = [];
  const others = [...taken];
  for (let n = 0; n < count; n++) {
    let best = null;
    let bestGap = 0;
    let found = 0;
    for (let i = 0; i < ATTEMPTS && found < CANDIDATES; i++) {
      const p = { x: Math.round(CLEARANCE + rand() * (WORLD.w - 2 * CLEARANCE)), y: Math.round(CLEARANCE + rand() * (WORLD.h - 2 * CLEARANCE)) };
      if (!isFree(p, map, [], CLEARANCE) || map.spawns.some((s) => dist(s, p) < SPAWN_GAP)) continue;
      const gap = Math.min(Infinity, ...others.map((o) => dist(o, p)));
      if (gap < MIN_GAP) continue;
      found++;
      if (gap > bestGap) {
        best = p;
        bestGap = gap;
      }
    }
    if (!best) break;
    spots.push(best);
    others.push(best);
  }
  return spots;
}

// Answers the teacher's page has yet to mark, as { uid, cid, ok, answer } jobs.
// `chests` maps box id -> box, `keys` box id -> answer key, `answers` and `results` map uid -> box id -> record.
// A box with no key is left alone until its key shows up.
export function ungraded(chests, keys, answers, results) {
  const jobs = [];
  for (const [uid, byBox] of Object.entries(answers ?? {})) {
    for (const [cid, given] of Object.entries(byBox ?? {})) {
      const chest = chests?.[cid];
      const key = keys?.[cid];
      if (!chest || key === undefined || key === null || key === '' || results?.[uid]?.[cid]) continue;
      jobs.push({ uid, cid, ok: isCorrect(chest, given?.v, key), answer: shownAnswer(chest, key) });
    }
  }
  return jobs;
}

// What a student who got it wrong is shown: the right option, or the first accepted answer.
export const shownAnswer = (chest, key) => (chest.type === 'choice' ? String(key) : String(key).split('|')[0].trim());

// How a box is doing among the students listed in `uids`.
export function chestProgress(cid, uids, answers, results) {
  let answered = 0;
  let correct = 0;
  for (const uid of uids) {
    if (answers?.[uid]?.[cid]) answered++;
    if (results?.[uid]?.[cid]?.ok) correct++;
  }
  return { answered, correct };
}

// Questions the teacher wrote but has not dropped yet are kept in the browser, so a refresh doesn't lose them.
// Anything that doesn't look like a question this app wrote is dropped.
export function cleanDrafts(list) {
  const isString = (v) => typeof v === 'string' && v.trim() !== '';
  const valid = (q) => {
    if (!q || !isString(q.text) || q.text.length > 200 || !isString(q.key)) return false;
    if (q.type === 'text') return true;
    return q.type === 'choice' && Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= MAX_OPTIONS && q.options.every(isString) && Number.isInteger(Number(q.key)) && Number(q.key) >= 0 && Number(q.key) < q.options.length;
  };
  return (Array.isArray(list) ? list : [])
    .filter(valid)
    .slice(0, MAX_CHESTS)
    .map((q) => ({ text: q.text, type: q.type, ...(q.type === 'choice' ? { options: q.options } : {}), key: q.key }));
}
