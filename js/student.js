// The phone: join, walk around with the joystick, bump into classmates to chat, answer the teacher's questions.
import { db, onValue, ref, signIn } from './firebase.js';
import { Room } from './room.js';
import { MAPS } from './maps.js';
import { WorldView } from './render.js';
import { Joystick } from './joystick.js';
import { createSounds } from './audio.js';
import { SHIRTS, avatarUrl, look } from './avatars.js';
import { addBubble, pairId, pruneBubbles, trackContacts } from './chat.js';
import { approach, dist, move, pickSpawn, relocate } from './world.js';
import { groupColor, groupLabel } from './grouping.js';
import { isCorrect, leaderboard } from './quiz.js';
import { isCode, normalizeCode } from './codes.js';
import { $, $$, h, store, toast } from './ui.js';

const sounds = createSounds();
const view = new WorldView($('#world'), { follow: true, minimap: true });
const joystick = new Joystick($('#joy'));
document.addEventListener('pointerdown', () => sounds.unlock(), { once: true }); // resumed sessions have no Join tap

const S = {
  uid: null,
  room: null,
  meta: null,
  me: null,
  map: MAPS.school,
  pos: { x: 0, y: 0 },
  facing: 1,
  moving: false,
  players: new Map(), // uid -> profile + { target, smooth, facing, moving, group, look }
  groups: {},
  contacts: new Set(), // uids of the avatars I'm touching right now
  chatWatch: new Map(), // uid -> unsubscribe for that pair's messages
  bubbles: new Map(),
  quiz: null,
  answer: null,
  answerKey: null,
  answerOff: null,
  scores: {},
  boardKind: 'players',
  sent: { t: 0, x: -1, y: -1 },
  lastChat: 0,
  running: false,
  unsubs: [],
};

// ---------------------------------------------------------------- join screen
const form = $('#joinForm');
const nameInput = $('#name');
const codeInput = $('#code');
const joinError = $('#joinError');
const joinBtn = $('#joinBtn');
let persona = null;

const saved = store.get('cq.profile', {});
nameInput.value = saved.name ?? '';
const urlCode = normalizeCode(new URLSearchParams(location.search).get('room'));
codeInput.value = urlCode;
if (!isCode(urlCode)) $('#codeRow').hidden = false;

for (const btn of $$('.persona')) {
  const p = btn.dataset.persona;
  $('img', btn).src = avatarUrl(look({ uid: `preview-${p}`, persona: p, color: p === 'male' ? 1 : 0 }));
  btn.addEventListener('click', () => pick(p));
}
function pick(p) {
  persona = p;
  for (const btn of $$('.persona')) btn.setAttribute('aria-pressed', String(btn.dataset.persona === p));
}
if (saved.persona) pick(saved.persona);

const fail = (message) => {
  joinError.textContent = message;
  joinError.hidden = false;
  joinBtn.disabled = false;
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  sounds.unlock(); // browsers only allow sound after a tap
  const name = nameInput.value.trim().replace(/\s+/g, ' ');
  const code = normalizeCode(codeInput.value);
  if (!isCode(code)) return fail('The class code has 6 letters and numbers. Ask your teacher.');
  if (!name) return fail('Please type your name.');
  if (!persona) return fail('Please pick a character.');
  joinBtn.disabled = true;
  joinError.hidden = true;
  try {
    const room = S.room?.code === code ? S.room : new Room(code, S.uid);
    const meta = await room.getMeta();
    if (!meta) return fail('We can’t find that class. Check the code with your teacher.');
    S.room = room;
    S.meta = meta;
    let profile = await room.getMe();
    let pos;
    if (profile) pos = await room.getMyPos();
    else {
      if (!meta.open) return fail('This class isn’t letting new students in right now.');
      profile = { name, persona, color: Math.floor(Math.random() * SHIRTS.length) };
      pos = pickSpawn(MAPS[meta.env] ?? MAPS.school);
      await room.join(profile, { x: Math.round(pos.x), y: Math.round(pos.y) });
    }
    store.set('cq.profile', { name, persona });
    enter(profile, pos);
  } catch (err) {
    fail(err?.code === 'PERMISSION_DENIED' ? 'You can’t join this class (it may be locked, or you were removed).' : 'Something went wrong. Please try again.');
  } finally {
    joinBtn.disabled = false;
  }
});

function notice(title, text, label, action) {
  $('#noticeTitle').textContent = title;
  $('#noticeText').textContent = text;
  $('#noticeBtn').textContent = label;
  $('#noticeBtn').onclick = action;
  $('#notice').hidden = false;
}

function stop(title, text, label, action) {
  if (!S.running) return;
  S.running = false;
  for (const off of [...S.unsubs, ...S.chatWatch.values(), S.answerOff]) off?.();
  notice(title, text, label, action);
}

// ---------------------------------------------------------------- entering the class
async function enter(profile, pos) {
  S.me = profile;
  S.map = MAPS[S.meta.env] ?? MAPS.school;
  S.pos = pos ? { x: pos.x, y: pos.y } : pickSpawn(S.map);
  setEnv(S.map.id, false);
  $('#join').hidden = true;
  $('#hud').hidden = false;
  $('#joy').hidden = false;
  $('#meName').textContent = profile.name;
  $('#meAvatar').src = avatarUrl(look({ uid: S.uid, ...profile }));
  document.title = `ClassQuest: ${profile.name}`;

  const r = S.room;
  S.unsubs = [
    onValue(ref(db, '.info/connected'), (snap) => snap.val() && r.rejoin().catch(() => {})),
    r.watch('meta', onMeta),
    r.watchChildren('players', { added: onPlayer, changed: onPlayer, removed: onGone }),
    r.watchChildren('pos', { added: onPos, changed: onPos }),
    r.watch('group', onGroups),
    r.watch('quiz/cur', onQuiz),
    r.watch('quiz/score', (v) => {
      S.scores = v ?? {};
      renderBoard();
    }),
  ];
  S.running = true;
  last = performance.now();
  requestAnimationFrame(tick);
}

const home = () => (location.href = 'index.html');

function onMeta(meta) {
  if (!meta) return stop('The class has ended', 'Thanks for playing! Ask your teacher for a new code to join another class.', 'Back to start', home);
  S.meta = meta;
  if (meta.env !== S.map.id) setEnv(meta.env, true);
  refreshChat();
}

function setEnv(id, fix) {
  S.map = MAPS[id] ?? MAPS.school;
  view.setMap(S.map.id);
  const chip = $('#envChip');
  chip.replaceChildren(h('span', { 'aria-hidden': 'true' }, S.map.emoji), h('span', { class: 'env-name' }, S.map.label));
  chip.setAttribute('role', 'img');
  chip.setAttribute('aria-label', `Map: ${S.map.label}`);
  if (fix) {
    S.pos = relocate(S.pos, S.map, solidOthers());
    sendPos(performance.now());
    toast(`Welcome to the ${S.map.label}!`);
  }
}

const entry = (uid) => {
  let p = S.players.get(uid);
  if (!p) {
    p = { uid, target: null, smooth: null, facing: 1, moving: false, group: S.groups[uid] ?? null };
    S.players.set(uid, p);
  }
  return p;
};

function onPlayer(uid, v) {
  const p = entry(uid);
  Object.assign(p, v);
  p.look = look(p);
  if (uid === S.uid) refreshHud();
  if (S.contacts.has(uid)) refreshChat();
}

async function onGone(uid) {
  if (uid !== S.uid) return S.players.delete(uid);
  // Ending the class removes everyone too, so check whether the room still exists before blaming the teacher.
  const meta = await S.room.getMeta().catch(() => S.meta);
  if (meta) stop('You were removed', 'Your teacher removed you from this class.', 'Back to start', home);
  else stop('The class has ended', 'Thanks for playing! Ask your teacher for a new code to join another class.', 'Back to start', home);
}

function onPos(uid, v) {
  if (uid === S.uid || !v) return;
  const p = entry(uid);
  p.target = { x: v.x, y: v.y };
  p.smooth ??= { ...p.target };
}

function onGroups(v) {
  S.groups = v ?? {};
  for (const p of S.players.values()) p.group = S.groups[p.uid] ?? null;
  refreshHud();
  subscribeAnswer();
  renderQuiz();
}

function refreshHud() {
  const g = S.groups[S.uid];
  const badge = $('#meGroup');
  badge.hidden = !g;
  if (g) {
    badge.textContent = groupLabel(g);
    badge.style.background = groupColor(g);
  }
}

const nameOf = (id) => (/^g\d/.test(id) ? groupLabel(id) : S.players.get(id)?.name ?? 'Someone');
const solidOthers = () => [...S.players.values()].filter((p) => p.uid !== S.uid && p.on !== false && p.smooth).map((p) => p.smooth);

// ---------------------------------------------------------------- the game loop
let last = 0;
function tick(now) {
  if (!S.running) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const input = joystick.vector;
  const next = move(S.pos, input, dt, S.map, solidOthers());
  S.moving = Math.hypot(next.x - S.pos.x, next.y - S.pos.y) > 0.15;
  if (Math.abs(input.x) > 0.2) S.facing = input.x > 0 ? 1 : -1;
  S.pos = next;
  if (S.moving) $('#joyHint').classList.add('gone');

  for (const p of S.players.values()) {
    if (p.uid === S.uid || !p.target) continue;
    const before = p.smooth;
    p.smooth = approach(before, p.target, dt);
    const dx = p.smooth.x - before.x;
    if (Math.abs(dx) > 0.05) p.facing = dx > 0 ? 1 : -1;
    p.moving = Math.hypot(dx, p.smooth.y - before.y) > 0.3;
  }

  updateContacts(now);
  if (now - S.sent.t > 120 && dist(S.pos, S.sent) > 1.5) sendPos(now);

  const live = new Set([...S.contacts].map((u) => pairId(S.uid, u)));
  pruneBubbles(S.bubbles, now, (pair) => live.has(pair));

  const players = [];
  let sawMe = false;
  for (const p of S.players.values()) {
    if (!p.name) continue;
    if (p.uid === S.uid) {
      sawMe = true;
      players.push({ ...p, x: S.pos.x, y: S.pos.y, facing: S.facing, moving: S.moving, on: true });
    } else if (p.smooth && p.on !== false) players.push({ ...p, x: p.smooth.x, y: p.smooth.y });
  }
  if (!sawMe) players.push({ uid: S.uid, ...S.me, look: look({ uid: S.uid, ...S.me }), x: S.pos.x, y: S.pos.y, facing: S.facing, moving: S.moving });
  view.draw({ now, dt, players, meId: S.uid, focus: S.pos, bubbles: S.bubbles });
  requestAnimationFrame(tick);
}

function sendPos(now) {
  S.room.setPos(S.pos.x, S.pos.y).catch(() => {});
  S.sent = { t: now, x: S.pos.x, y: S.pos.y };
}

// ---------------------------------------------------------------- bumping and chatting
function updateContacts(now) {
  const distances = new Map();
  for (const p of S.players.values()) if (p.uid !== S.uid && p.on !== false && p.smooth) distances.set(p.uid, dist(S.pos, p.smooth));
  const { next, opened, closed } = trackContacts(S.contacts, distances);
  S.contacts = next;
  for (const uid of opened) onBump(uid, now);
  for (const uid of closed) {
    S.chatWatch.get(uid)?.();
    S.chatWatch.delete(uid);
  }
  if (opened.length || closed.length) refreshChat();
}

function onBump(uid, now) {
  const other = S.players.get(uid);
  view.burst((S.pos.x + other.smooth.x) / 2, (S.pos.y + other.smooth.y) / 2, now);
  sounds.bump();
  navigator.vibrate?.(25);
  const pair = pairId(S.uid, uid);
  const since = S.room.serverNow() - 2500; // ignore messages from an earlier meeting
  S.chatWatch.set(
    uid,
    S.room.watchChat(pair, (_id, msg) => {
      if (!msg || msg.ts < since) return;
      addBubble(S.bubbles, msg.from, msg.text, performance.now(), pair);
      if (msg.from !== S.uid) sounds.pop();
    }),
  );
  if (S.contacts.size === 1) toast(`You bumped into ${other.name ?? 'a classmate'}! Say hi 👋`);
}

function refreshChat() {
  const names = [...S.contacts].map((uid) => S.players.get(uid)?.name).filter(Boolean);
  const on = S.meta?.chat !== false;
  $('#chatBar').hidden = !names.length || !on;
  $('#chatWith').textContent = names.length ? `Chatting with ${names.join(' & ')}` : '';
}

$('#chatBar').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#chatInput');
  const text = input.value.trim();
  if (!text) return;
  if (S.meta?.chat === false) return toast('The teacher turned chat off.');
  if (Date.now() - S.lastChat < 400) return;
  S.lastChat = Date.now();
  input.value = '';
  for (const uid of S.contacts) S.room.sendChat(pairId(S.uid, uid), text).catch(() => toast('That message didn’t send.'));
  input.focus();
});

// On a laptop the arrow keys walk, except while typing: Escape leaves the chat box.
$('#chatInput').addEventListener('keydown', (event) => event.key === 'Escape' && event.target.blur());

// Keep the chat box above the on-screen keyboard.
window.visualViewport?.addEventListener('resize', () => {
  const v = window.visualViewport;
  $('#chatBar').style.transform = `translateY(${-(window.innerHeight - v.height - v.offsetTop)}px)`;
});

// ---------------------------------------------------------------- sound, leaderboard
const soundBtn = $('#btnSound');
const syncSound = () => {
  soundBtn.textContent = sounds.muted ? '🔇' : '🔊';
  soundBtn.setAttribute('aria-pressed', String(!sounds.muted));
  soundBtn.setAttribute('aria-label', sounds.muted ? 'Sound is off' : 'Sound is on');
};
soundBtn.addEventListener('click', () => {
  sounds.unlock();
  sounds.setMuted(!sounds.muted);
  syncSound();
});
syncSound();

$('#btnBoard').addEventListener('click', () => {
  $('#quizSheet').hidden = true;
  $('#boardSheet').hidden = !$('#boardSheet').hidden;
  renderBoard();
});
$('#boardClose').addEventListener('click', () => ($('#boardSheet').hidden = true));
for (const tab of $$('#boardSheet [data-kind]')) {
  tab.addEventListener('click', () => {
    S.boardKind = tab.dataset.kind;
    for (const t of $$('#boardSheet [data-kind]')) t.setAttribute('aria-selected', String(t === tab));
    renderBoard();
  });
}

function renderBoard() {
  const list = $('#boardList');
  if ($('#boardSheet').hidden) return;
  const rows = leaderboard(S.scores, nameOf, S.boardKind).slice(0, 10);
  list.replaceChildren(
    ...(rows.length
      ? rows.map((row) => h('li', { class: `lb-row${row.id === S.uid || row.id === S.groups[S.uid] ? ' me' : ''}` }, h('span', { class: 'lb-rank' }, String(row.rank)), h('span', { class: 'lb-name' }, row.name), h('span', { class: 'lb-points' }, `${row.points} pt${row.points === 1 ? '' : 's'}`)))
      : [h('li', { class: 'muted' }, 'No points yet. Answer a question to get on the board!')]),
  );
}

// ---------------------------------------------------------------- quiz
const subject = () => (S.quiz?.mode === 'group' ? S.groups[S.uid] ?? null : S.uid);

function onQuiz(q) {
  const prev = S.quiz;
  S.quiz = q;
  $('#btnQuiz').hidden = !q;
  if (!q) {
    $('#quizSheet').hidden = true;
    return;
  }
  subscribeAnswer();
  if (!prev || prev.id !== q.id) {
    S.answer = null;
    sounds.ding();
    toast('New question!');
    $('#boardSheet').hidden = true;
    $('#quizSheet').hidden = false;
  }
  $('#btnQuiz').classList.toggle('pulse', q.state === 'open' && S.answer == null);
  renderQuiz();
}

// Follow my (or my group's) answer to the current question.
function subscribeAnswer() {
  const subj = S.quiz ? subject() : null;
  const key = subj ? `${S.quiz.id}/${subj}` : null;
  if (key === S.answerKey) return;
  S.answerOff?.();
  S.answerOff = null;
  S.answerKey = key;
  S.answer = null;
  if (key) {
    S.answerOff = S.room.watch(`quiz/ans/${key}`, (v) => {
      S.answer = v;
      $('#btnQuiz').classList.toggle('pulse', S.quiz?.state === 'open' && v == null);
      renderQuiz();
    });
  }
}

function submit(value) {
  const subj = subject();
  if (!subj || S.quiz?.state !== 'open') return;
  S.room.answer(S.quiz.id, subj, value).catch(() => toast('That answer didn’t send. Try again.'));
}

function renderQuiz() {
  const q = S.quiz;
  if (!q) return;
  const group = S.groups[S.uid];
  const subj = subject();
  const open = q.state === 'open' && !!subj;
  const mine = S.answer?.v;
  const body = $('#quizBody');
  const typing = $('input', body);
  const keep = typing && document.activeElement === typing ? typing.value : null;

  $('#quizMeta').textContent = q.mode === 'group' ? `Group question${group ? ` · ${groupLabel(group)}` : ''}` : 'Question for you';
  $('#quizText').textContent = q.text;
  body.replaceChildren();
  if (q.type === 'choice') {
    const revealed = q.state === 'revealed' && q.answer != null;
    Object.values(q.options ?? {}).forEach((label, i) => {
      const right = revealed && String(i) === String(q.answer);
      const wrong = revealed && mine === String(i) && !right;
      body.append(h('button', { class: `opt${right ? ' correct' : ''}${wrong ? ' wrong' : ''}`, type: 'button', disabled: !open, 'aria-pressed': String(mine === String(i)), onclick: () => submit(i) }, h('span', { class: 'letter' }, 'ABCDEF'[i]), label));
    });
  } else {
    const input = h('input', { class: 'input', maxlength: 100, placeholder: 'Type your answer', 'aria-label': 'Your answer', disabled: !open });
    input.value = keep ?? mine ?? '';
    const send = h('button', { class: 'btn primary', type: 'button', disabled: !open, onclick: () => input.value.trim() && submit(input.value.trim()) }, mine === undefined ? 'Send' : 'Change');
    input.addEventListener('keydown', (e) => e.key === 'Enter' && send.click());
    body.append(h('div', { class: 'flex gap-2' }, input, send));
    if (keep !== null) input.focus();
  }

  let status;
  if (!subj) status = 'Waiting for your teacher to put you in a group…';
  else if (q.state === 'open') status = mine === undefined ? 'Choose your answer.' : q.mode === 'group' ? `${nameOf(S.answer.by)} answered for your group. You can still change it.` : 'Answer sent! You can change it until time’s up.';
  else if (q.state === 'closed') status = 'Time’s up! Waiting for the answer…';
  else if (q.answer == null) status = 'Thanks for answering!';
  else if (isCorrect(q, mine, q.answer)) status = '🎉 Correct! +1 point';
  else status = q.type === 'text' ? `The answer was: ${String(q.answer).split('|')[0].trim()}` : 'Not this time. The right answer is highlighted.';
  $('#quizStatus').textContent = status;
}

$('#btnQuiz').addEventListener('click', () => {
  $('#boardSheet').hidden = true;
  $('#quizSheet').hidden = !$('#quizSheet').hidden;
  renderQuiz();
});
$('#quizClose').addEventListener('click', () => ($('#quizSheet').hidden = true));

// ---------------------------------------------------------------- start
(async function boot() {
  try {
    S.uid = await signIn();
  } catch {
    return notice('We can’t connect', 'Check your internet connection, then try again.', 'Try again', () => location.reload());
  }
  // Already in this class (a refresh)? Jump straight back in.
  if (isCode(urlCode)) {
    try {
      const room = new Room(urlCode, S.uid);
      const [meta, me] = await Promise.all([room.getMeta(), room.getMe()]);
      if (meta && me) {
        S.room = room;
        S.meta = meta;
        enter(me, await room.getMyPos());
      }
    } catch {
      /* fall back to the join form */
    }
  }
})();
