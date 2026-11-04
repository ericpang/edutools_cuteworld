// Everything the app reads and writes in one classroom lives under worlds/<code> (see database.rules.json).
import { db, get, increment, limitToLast, onChildAdded, onChildChanged, onChildRemoved, onDisconnect, onValue, push, query, ref, remove, serverTimestamp, set, update } from './firebase.js';
import { makeCode } from './codes.js';

export class Room {
  constructor(code, uid) {
    this.code = code;
    this.uid = uid;
    this.offset = 0; // server clock minus ours, so message times can be compared with Date.now()
    onValue(ref(db, '.info/serverTimeOffset'), (s) => (this.offset = s.val() ?? 0));
  }

  ref = (path = '') => ref(db, `worlds/${this.code}${path ? `/${path}` : ''}`);
  serverNow = () => Date.now() + this.offset;

  // Every watcher returns its own unsubscribe function.
  watch(path, cb) {
    return onValue(this.ref(path), (snap) => cb(snap.val()));
  }

  watchChildren(path, { added, changed, removed }) {
    const r = this.ref(path);
    const offs = [];
    if (added) offs.push(onChildAdded(r, (s) => added(s.key, s.val())));
    if (changed) offs.push(onChildChanged(r, (s) => changed(s.key, s.val())));
    if (removed) offs.push(onChildRemoved(r, (s) => removed(s.key, s.val())));
    return () => offs.forEach((off) => off());
  }

  getMeta = async () => (await get(this.ref('meta'))).val();
  getMe = async () => (await get(this.ref(`players/${this.uid}`))).val();
  getMyPos = async () => (await get(this.ref(`pos/${this.uid}`))).val();

  // ---- students
  async join(profile, pos) {
    await set(this.ref(`players/${this.uid}`), { ...profile, on: true });
    await set(this.ref(`pos/${this.uid}`), pos);
    onDisconnect(this.ref(`players/${this.uid}/on`)).set(false);
  }

  async rejoin() {
    await set(this.ref(`players/${this.uid}/on`), true);
    onDisconnect(this.ref(`players/${this.uid}/on`)).set(false);
  }

  setPos = (x, y) => set(this.ref(`pos/${this.uid}`), { x: Math.round(x), y: Math.round(y) });
  sendChat = (pair, text) => push(this.ref(`chats/${pair}`), { from: this.uid, text, ts: serverTimestamp() });
  answer = (qid, subject, value) => set(this.ref(`quiz/ans/${qid}/${subject}`), { v: String(value), by: this.uid, ts: serverTimestamp() });

  // New messages in one pair's chat (plus the last few already there; callers filter by time).
  watchChat(pair, cb) {
    return onChildAdded(query(this.ref(`chats/${pair}`), limitToLast(20)), (s) => cb(s.key, s.val()));
  }

  // ---- the teacher
  static async create(uid, env = 'school') {
    let last;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode();
      try {
        // Fails if the code already belongs to someone else's room (or if the rules are not deployed yet).
        await set(ref(db, `worlds/${code}/meta`), { owner: uid, env, open: true, chat: true, bubbles: false, createdAt: serverTimestamp() });
        return new Room(code, uid);
      } catch (err) {
        last = err;
      }
    }
    throw last;
  }

  setMeta = (patch) => update(this.ref('meta'), patch);
  setGroups = (assignment) => set(this.ref('group'), assignment);
  assignGroup = (uid, group) => set(this.ref(`group/${uid}`), group);
  end = () => remove(this.ref());

  removePlayer = (uid) =>
    update(this.ref(), { [`players/${uid}`]: null, [`pos/${uid}`]: null, [`group/${uid}`]: null, [`banned/${uid}`]: true });

  publishQuestion = (question, key) => update(this.ref('quiz'), { cur: question, [`key/${question.id}`]: key ?? null });
  setQuestionState = (state) => set(this.ref('quiz/cur/state'), state);
  getKey = async (qid) => (await get(this.ref(`quiz/key/${qid}`))).val();

  // Reveal the answer and award a point to each right subject in a single atomic write.
  reveal(qid, answer, winners) {
    const patch = { 'cur/state': 'revealed' };
    if (answer !== null && answer !== undefined && answer !== '') patch['cur/answer'] = String(answer);
    for (const subject of winners) patch[`score/${subject}`] = increment(1);
    return update(this.ref('quiz'), patch);
  }
}
