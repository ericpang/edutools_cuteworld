import { BUMP_DIST, CHAT_CLOSE_DIST } from './world.js';

// Chats only exist between avatars that are touching. A pair's id is the same on both phones.
export const pairId = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
export const inPair = (pair, uid) => pair.split('_').includes(uid);
export const partnerOf = (pair, me) => pair.split('_').find((uid) => uid !== me) ?? null;

// Decide which neighbours are in contact. A chat opens on a bump and stays open until the pair drifts past `far`;
// the gap between the two distances stops a chat flickering when two avatars jostle at the edge.
// `open` is the Set of uids currently in contact, `distances` maps neighbour uid -> distance in map units.
export function trackContacts(open, distances, near = BUMP_DIST, far = CHAT_CLOSE_DIST) {
  const next = new Set();
  const opened = [];
  for (const [uid, d] of distances) {
    if (d <= (open.has(uid) ? far : near)) {
      next.add(uid);
      if (!open.has(uid)) opened.push(uid);
    }
  }
  const closed = [...open].filter((uid) => !next.has(uid));
  return { next, opened, closed };
}

// Speech bubbles shown above characters. Each speaker keeps their last two messages for the current pair.
export const BUBBLE_MS = 9000;

export function addBubble(bubbles, uid, text, now, pair, ttl = BUBBLE_MS) {
  const list = (bubbles.get(uid) ?? []).filter((b) => b.until > now);
  list.push({ text, pair, until: now + ttl });
  bubbles.set(uid, list.slice(-2));
}

export function pruneBubbles(bubbles, now, keepPair = null) {
  for (const [uid, list] of bubbles) {
    const live = list.filter((b) => b.until > now && (keepPair === null || keepPair(b.pair)));
    if (live.length) bubbles.set(uid, live);
    else bubbles.delete(uid);
  }
}
