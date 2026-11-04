// Security-rules tests for the `worlds` block. They need the Firebase emulator: `npm run test:rules`.
import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, remove, serverTimestamp, set, update } from 'firebase/database';

const CODE = 'ABC234';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cuteworld',
    database: { rules: readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8') },
  });
});
after(() => env.cleanup());
beforeEach(() => env.clearDatabase());

const db = (uid) => env.authenticatedContext(uid).database();
const at = (d, path = '') => ref(d, `worlds/${CODE}${path ? `/${path}` : ''}`);
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.database()));

const meta = (over = {}) => ({ owner: 'teacher', env: 'school', open: true, chat: true, bubbles: false, createdAt: 1, ...over });
const player = (name, persona = 'female') => ({ name, persona, color: 1, on: true });
const question = (over = {}) => ({ id: 'q1', text: 'Capital of France?', type: 'choice', options: ['Paris', 'Rome'], mode: 'solo', state: 'open', ts: 1, ...over });

// A running class: teacher, Alice and Bob in group g1, Carol in g2.
async function seedRoom({ open = true, chat = true, quiz } = {}) {
  await seed((d) =>
    update(at(d), {
      meta: meta({ open, chat }),
      'players/alice': player('Alice'),
      'players/bob': player('Bob', 'male'),
      'players/carol': player('Carol'),
      'pos/alice': { x: 100, y: 100 },
      'group/alice': 'g1',
      'group/bob': 'g1',
      'group/carol': 'g2',
      ...(quiz ? { 'quiz/cur': quiz, 'quiz/key/q1': '0' } : {}),
    }),
  );
}

// ---- rooms
test('a teacher can create a room and becomes its owner', async () => {
  await assertSucceeds(set(at(db('teacher'), 'meta'), meta({ createdAt: serverTimestamp() })));
});

test('a room must name its creator as owner', async () => {
  await assertFails(set(at(db('teacher'), 'meta'), meta({ owner: 'someone-else', createdAt: serverTimestamp() })));
});

test('room codes use the six-character alphabet', async () => {
  await assertFails(set(ref(db('teacher'), 'worlds/abc/meta'), meta({ createdAt: serverTimestamp() })));
  await assertFails(set(ref(db('teacher'), 'worlds/ABC10O/meta'), meta({ createdAt: serverTimestamp() })));
});

test('only the three maps are valid environments', async () => {
  await assertFails(set(at(db('teacher'), 'meta'), meta({ env: 'moon', createdAt: serverTimestamp() })));
});

test('only the owner can change room settings', async () => {
  await seedRoom();
  await assertSucceeds(update(at(db('teacher'), 'meta'), { env: 'jungle' }));
  await assertFails(update(at(db('alice'), 'meta'), { env: 'shopping' }));
  await assertFails(set(at(db('mallory'), 'meta'), meta({ owner: 'mallory', createdAt: serverTimestamp() })));
});

test('signed-out visitors cannot read a room, signed-in users can read its settings', async () => {
  await seedRoom();
  await assertFails(get(at(env.unauthenticatedContext().database(), 'meta')));
  await assertSucceeds(get(at(db('alice'), 'meta')));
});

test('students cannot read the whole room, but the owner can', async () => {
  await seedRoom();
  await assertFails(get(at(db('alice'))));
  await assertSucceeds(get(at(db('teacher'))));
});

// ---- players and positions
test('a student can join an open room as themselves', async () => {
  await seedRoom();
  await assertSucceeds(set(at(db('dave'), 'players/dave'), player('Dave')));
});

test('nobody new can join a locked room, but existing students keep working', async () => {
  await seedRoom({ open: false });
  await assertFails(set(at(db('dave'), 'players/dave'), player('Dave')));
  await assertSucceeds(update(at(db('alice'), 'players/alice'), { on: false }));
});

test('a student cannot write another student\'s profile', async () => {
  await seedRoom();
  await assertFails(set(at(db('alice'), 'players/bob'), player('Not Bob')));
});

test('profiles are validated', async () => {
  await seedRoom();
  await assertFails(set(at(db('dave'), 'players/dave'), player('x'.repeat(21))));
  await assertFails(set(at(db('dave'), 'players/dave'), player('')));
  await assertFails(set(at(db('dave'), 'players/dave'), { ...player('Dave'), persona: 'robot' }));
  await assertFails(set(at(db('dave'), 'players/dave'), { ...player('Dave'), admin: true }));
});

test('a removed student stays out', async () => {
  await seedRoom();
  await assertSucceeds(update(at(db('teacher')), { 'players/bob': null, 'pos/bob': null, 'banned/bob': true }));
  await assertFails(set(at(db('bob'), 'players/bob'), player('Bob', 'male')));
});

test('students move only themselves, inside the map', async () => {
  await seedRoom();
  await assertSucceeds(set(at(db('alice'), 'pos/alice'), { x: 500, y: 300 }));
  await assertFails(set(at(db('alice'), 'pos/bob'), { x: 500, y: 300 }));
  await assertFails(set(at(db('alice'), 'pos/alice'), { x: 2500, y: 300 }));
  await assertFails(set(at(db('alice'), 'pos/alice'), { x: -1, y: 300 }));
});

test('someone who has not joined cannot place themselves on the map', async () => {
  await seedRoom();
  await assertFails(set(at(db('dave'), 'pos/dave'), { x: 5, y: 5 }));
});

// ---- groups
test('only the teacher assigns groups; students can read them', async () => {
  await seedRoom();
  await assertSucceeds(update(at(db('teacher'), 'group'), { alice: 'g2' }));
  await assertFails(set(at(db('alice'), 'group/alice'), 'g3'));
  await assertFails(update(at(db('teacher'), 'group'), { alice: 'team-red' }));
  await assertSucceeds(get(at(db('alice'), 'group')));
});

// ---- chat
const pair = 'alice_bob';

test('chat partners can message each other', async () => {
  await seedRoom();
  const msg = { from: 'alice', text: 'hi!', ts: serverTimestamp() };
  await assertSucceeds(set(ref(db('alice'), `worlds/${CODE}/chats/${pair}/m1`), msg));
  await assertSucceeds(get(ref(db('bob'), `worlds/${CODE}/chats/${pair}`)));
});

test('a message must come from its sender, be short, and be stamped by the server', async () => {
  await seedRoom();
  const path = `worlds/${CODE}/chats/${pair}/m1`;
  await assertFails(set(ref(db('alice'), path), { from: 'bob', text: 'hi', ts: serverTimestamp() }));
  await assertFails(set(ref(db('alice'), path), { from: 'alice', text: 'x'.repeat(301), ts: serverTimestamp() }));
  await assertFails(set(ref(db('alice'), path), { from: 'alice', text: '', ts: serverTimestamp() }));
  await assertFails(set(ref(db('alice'), path), { from: 'alice', text: 'hi', ts: 12345 }));
});

test('outsiders cannot read or write a private chat, but the teacher can read everything', async () => {
  await seedRoom();
  await seed((d) => set(ref(d, `worlds/${CODE}/chats/${pair}/m1`), { from: 'alice', text: 'secret', ts: 1 }));
  await assertFails(get(ref(db('carol'), `worlds/${CODE}/chats/${pair}`)));
  await assertFails(set(ref(db('carol'), `worlds/${CODE}/chats/${pair}/m2`), { from: 'carol', text: 'hey', ts: serverTimestamp() }));
  await assertSucceeds(get(at(db('teacher'), 'chats')));
});

test('nobody can edit or delete a sent message', async () => {
  await seedRoom();
  await seed((d) => set(ref(d, `worlds/${CODE}/chats/${pair}/m1`), { from: 'alice', text: 'hi', ts: 1 }));
  await assertFails(set(ref(db('alice'), `worlds/${CODE}/chats/${pair}/m1`), { from: 'alice', text: 'edited', ts: serverTimestamp() }));
  await assertFails(remove(ref(db('alice'), `worlds/${CODE}/chats/${pair}/m1`)));
});

test('the teacher can switch chat off, which stops new messages', async () => {
  await seedRoom({ chat: false });
  await assertFails(set(ref(db('alice'), `worlds/${CODE}/chats/${pair}/m1`), { from: 'alice', text: 'hi', ts: serverTimestamp() }));
});

test('students can only chat with people who are in the room', async () => {
  await seedRoom();
  await assertFails(set(ref(db('alice'), `worlds/${CODE}/chats/alice_ghost/m1`), { from: 'alice', text: 'hi', ts: serverTimestamp() }));
});

// ---- quiz
test('students see the question but never the answer key', async () => {
  await seedRoom({ quiz: question() });
  await assertSucceeds(get(at(db('alice'), 'quiz/cur')));
  await assertFails(get(at(db('alice'), 'quiz/key')));
  await assertFails(get(at(db('alice'), 'quiz/key/q1')));
  await assertSucceeds(get(at(db('teacher'), 'quiz/key')));
});

test('only the teacher publishes questions and keys', async () => {
  await seedRoom();
  await assertSucceeds(set(at(db('teacher'), 'quiz/cur'), question()));
  await assertFails(set(at(db('alice'), 'quiz/cur'), question()));
  await assertFails(set(at(db('alice'), 'quiz/key/q1'), '0'));
  await assertFails(set(at(db('teacher'), 'quiz/cur'), question({ type: 'essay' })));
});

test('in solo mode a student answers as themselves while the question is open', async () => {
  await seedRoom({ quiz: question() });
  const answer = { v: '0', by: 'alice', ts: serverTimestamp() };
  await assertSucceeds(set(at(db('alice'), 'quiz/ans/q1/alice'), answer));
  await assertFails(set(at(db('alice'), 'quiz/ans/q1/bob'), { ...answer }));
  await assertFails(set(at(db('alice'), 'quiz/ans/q1/alice'), { ...answer, by: 'bob' }));
});

test('answers stop when the question closes or is not the current one', async () => {
  await seedRoom({ quiz: question({ state: 'closed' }) });
  await assertFails(set(at(db('alice'), 'quiz/ans/q1/alice'), { v: '0', by: 'alice', ts: serverTimestamp() }));
  await seedRoom({ quiz: question() });
  await assertFails(set(at(db('alice'), 'quiz/ans/q2/alice'), { v: '0', by: 'alice', ts: serverTimestamp() }));
});

test('in group mode any member answers for the group, nobody answers for another group', async () => {
  await seedRoom({ quiz: question({ mode: 'group' }) });
  const answer = (by) => ({ v: '1', by, ts: serverTimestamp() });
  await assertSucceeds(set(at(db('alice'), 'quiz/ans/q1/g1'), answer('alice')));
  await assertSucceeds(set(at(db('bob'), 'quiz/ans/q1/g1'), answer('bob')));
  await assertFails(set(at(db('carol'), 'quiz/ans/q1/g1'), answer('carol')));
  await assertFails(set(at(db('alice'), 'quiz/ans/q1/alice'), answer('alice')));
});

test('students only see their own (or their group\'s) answers, the teacher sees all', async () => {
  await seedRoom({ quiz: question({ mode: 'group' }) });
  await seed((d) => update(at(d, 'quiz/ans/q1'), { g1: { v: '0', by: 'alice', ts: 1 }, g2: { v: '1', by: 'carol', ts: 1 } }));
  await assertSucceeds(get(at(db('bob'), 'quiz/ans/q1/g1')));
  await assertFails(get(at(db('bob'), 'quiz/ans/q1/g2')));
  await assertFails(get(at(db('bob'), 'quiz/ans/q1')));
  await assertSucceeds(get(at(db('teacher'), 'quiz/ans/q1')));
});

test('scores are public to read and only the teacher writes them', async () => {
  await seedRoom({ quiz: question() });
  await assertSucceeds(update(at(db('teacher'), 'quiz'), { 'score/alice': 1, 'score/g1': 2 }));
  await assertFails(set(at(db('alice'), 'quiz/score/alice'), 99));
  await assertSucceeds(get(at(db('bob'), 'quiz/score')));
  await assertFails(set(at(db('teacher'), 'quiz/score/alice'), -1));
});

test('the teacher can reveal an answer in one atomic update', async () => {
  await seedRoom({ quiz: question() });
  await assertSucceeds(update(at(db('teacher'), 'quiz'), { 'cur/state': 'revealed', 'cur/answer': '0', 'score/alice': 1 }));
});

// ---- ending the session
test('only the owner can end a session', async () => {
  await seedRoom();
  await assertFails(remove(at(db('alice'))));
  await assertSucceeds(remove(at(db('teacher'))));
});

// ---- other apps in the shared project are untouched by this block
test('unknown top-level data under a room is rejected', async () => {
  await seedRoom();
  await assertFails(set(at(db('teacher'), 'secrets'), { a: 1 }));
});
