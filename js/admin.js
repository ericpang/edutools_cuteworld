// The big screen: create the class, watch everyone move, read chats, form groups, run quizzes.
import { signIn } from './firebase.js';
import { Room } from './room.js';
import { MAPS, MAP_IDS } from './maps.js';
import { WorldView } from './render.js';
import { avatarUrl, look } from './avatars.js';
import { addBubble, inPair, pairId, partnerOf, pruneBubbles, trackContacts } from './chat.js';
import { approach, clamp, dist } from './world.js';
import { formGroups, groupColor, groupLabel, groupNumber, isGroupId, smallestGroup } from './grouping.js';
import { MAX_OPTIONS, correctSubjects, leaderboard, tally } from './quiz.js';
import { $, $$, h, store, timeOf, toast } from './ui.js';

const view = new WorldView($('#world'), { follow: false });
const LETTERS = 'ABCDEF';

const A = {
  uid: null,
  room: null,
  meta: null,
  joinUrl: '',
  players: new Map(), // uid -> profile + { target, smooth, facing, moving, group, look }
  groups: {},
  quiz: null,
  answers: {},
  answersFor: null,
  answersOff: null,
  scores: {},
  boardKind: 'players',
  chats: new Map(), // pair -> [{ id, from, text, ts }]
  chatSeen: new Set(),
  pairs: new Set(), // pairs of avatars touching right now
  bubbles: new Map(),
  selected: null,
  unsubs: [],
  // quiz builder
  building: true,
  qType: 'choice',
  qMode: 'solo',
  options: ['', ''],
  correct: 0,
};

function notice(title, text, label, action) {
  $('#noticeTitle').textContent = title;
  $('#noticeText').textContent = text;
  $('#noticeBtn').textContent = label;
  $('#noticeBtn').onclick = action;
  $('#notice').hidden = false;
}

// ---------------------------------------------------------------- start up
(async function boot() {
  try {
    A.uid = await signIn();
  } catch {
    return notice('We can’t connect', 'Check your internet connection, then try again.', 'Try again', () => location.reload());
  }
  let room = null;
  const saved = store.get('cq.admin.room');
  if (saved) {
    const candidate = new Room(saved, A.uid);
    const meta = await candidate.getMeta().catch(() => null);
    if (meta?.owner === A.uid) room = candidate; // a refresh keeps your class
  }
  if (!room) {
    try {
      room = await Room.create(A.uid, 'school');
    } catch {
      return notice('We couldn’t start a class', 'The database refused the new class. On a first run, deploy database.rules.json (it contains the ClassQuest rules), then try again.', 'Try again', () => location.reload());
    }
  }
  store.set('cq.admin.room', room.code);
  A.room = room;
  start();
})();

function start() {
  const r = A.room;
  $('#codeChip').textContent = r.code;
  $('#qrCode').textContent = r.code;
  const url = new URL('student.html', location.href);
  url.search = `?room=${r.code}`;
  url.hash = '';
  A.joinUrl = url.href;
  $('#joinUrl').textContent = `${url.host}${url.pathname}?room=${r.code}`;
  const qr = $('#qr');
  if (window.QRCode) new window.QRCode(qr, { text: A.joinUrl, width: 200, height: 200, colorDark: '#5b4a6b', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
  else qr.textContent = 'QR code unavailable';

  buildEnvButtons();
  buildBuilder();
  renderMonitor();
  A.unsubs = [
    r.watch('meta', onMeta),
    r.watchChildren('players', { added: onPlayer, changed: onPlayer, removed: onGone }),
    r.watchChildren('pos', { added: onPos, changed: onPos }),
    r.watch('group', onGroups),
    r.watch('quiz/cur', onQuiz),
    r.watch('quiz/score', (v) => {
      A.scores = v ?? {};
      renderBoard();
    }),
    r.watchChildren('chats', { added: onPair }),
  ];
  last = performance.now();
  requestAnimationFrame(tick);
}

function onMeta(meta) {
  if (!meta) {
    store.set('cq.admin.room', null);
    return notice('This class has ended', 'Start a new class to get a fresh code.', 'Start a new class', () => location.reload());
  }
  A.meta = meta;
  view.setMap(meta.env);
  const map = MAPS[meta.env] ?? MAPS.school;
  $('#envChip').textContent = `${map.emoji} ${map.label}`;
  for (const btn of $$('#envButtons [data-env]')) btn.setAttribute('aria-pressed', String(btn.dataset.env === meta.env));
  $('#swOpen').checked = !!meta.open;
  $('#swChat').checked = !!meta.chat;
  $('#swBubbles').checked = !!meta.bubbles;
}

// ---------------------------------------------------------------- people
const entry = (uid) => {
  let p = A.players.get(uid);
  if (!p) {
    p = { uid, target: null, smooth: null, facing: 1, moving: false, group: A.groups[uid] ?? null };
    A.players.set(uid, p);
  }
  return p;
};

function onPlayer(uid, v) {
  const p = entry(uid);
  const isNew = !p.name;
  Object.assign(p, v);
  p.look = look(p);
  if (isNew) autoGroup(uid);
  renderPeople();
  if (A.selected === uid) renderInspector();
}

function onGone(uid) {
  A.players.delete(uid);
  if (A.selected === uid) $('#inspector').close();
  renderPeople();
}

function onPos(uid, v) {
  if (!v) return;
  const p = entry(uid);
  p.target = { x: v.x, y: v.y };
  p.smooth ??= { ...p.target };
}

// Once groups exist, anyone who joins late goes to the smallest one.
function autoGroup(uid) {
  if (!Object.keys(A.groups).length || A.groups[uid]) return;
  const g = smallestGroup(A.groups);
  if (!g) return;
  A.groups[uid] = g;
  A.room.assignGroup(uid, g).catch(() => {});
}

function onGroups(v) {
  A.groups = v ?? {};
  for (const p of A.players.values()) p.group = A.groups[p.uid] ?? null;
  renderPeople();
  renderMonitor();
}

const named = () => [...A.players.values()].filter((p) => p.name);
const online = () => named().filter((p) => p.on !== false);
const nameOf = (id) => (isGroupId(id) ? groupLabel(id) : A.players.get(id)?.name ?? 'Student');

function renderPeople() {
  const here = online().length;
  const away = named().length - here;
  $('#countChip').textContent = `${here} student${here === 1 ? '' : 's'}${away ? ` · ${away} away` : ''}`;

  // groups
  const box = $('#groupList');
  const byGroup = new Map();
  for (const p of named()) if (p.group) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p.name]);
  box.replaceChildren(
    ...(byGroup.size
      ? [...byGroup].sort((a, b) => groupNumber(a[0]) - groupNumber(b[0])).map(([g, names]) => h('div', { class: 'person', style: `border-color: ${groupColor(g)}` }, h('span', { class: 'group-chip', style: `background: ${groupColor(g)}` }, groupLabel(g)), h('span', { class: 'name' }, names.join(', '))))
      : [h('p', { class: 'muted' }, 'No groups yet.')]),
  );

  // students
  $('#playerList').replaceChildren(
    ...(named().length
      ? named()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p) =>
            h('div', { class: 'person' },
              h('img', { src: avatarUrl(p.look), alt: '', width: 28, height: 33 }),
              h('span', { class: 'name' }, p.name),
              h('span', { class: `dot${p.on === false ? '' : ' on'}`, title: p.on === false ? 'Away' : 'Online', role: 'img', 'aria-label': p.on === false ? 'Away' : 'Online' }),
              p.group ? h('span', { class: 'group-chip', style: `background: ${groupColor(p.group)}` }, groupLabel(p.group)) : null,
              h('button', { class: 'btn small ghost', type: 'button', onclick: () => openInspector(p.uid) }, 'Chats'),
              h('button', { class: 'btn small danger', type: 'button', 'aria-label': `Remove ${p.name}`, onclick: () => removeStudent(p) }, 'Remove'),
            ),
          )
      : [h('p', { class: 'muted' }, 'Nobody has joined yet. Show them the QR code!')]),
  );
  renderMonitor();
}

function removeStudent(p) {
  if (!confirm(`Remove ${p.name} from the class? They won’t be able to rejoin.`)) return;
  A.room.removePlayer(p.uid).catch(() => toast('Couldn’t remove that student.'));
}

// ---------------------------------------------------------------- chats
function onPair(pair) {
  if (A.chatSeen.has(pair)) return;
  A.chatSeen.add(pair);
  A.unsubs.push(A.room.watchChildren(`chats/${pair}`, { added: (id, msg) => onMessage(pair, id, msg) }));
}

function onMessage(pair, id, msg) {
  if (!msg) return;
  const list = A.chats.get(pair) ?? [];
  A.chats.set(pair, list);
  if (list.some((m) => m.id === id)) return;
  list.push({ id, ...msg });
  list.sort((a, b) => a.ts - b.ts);
  if (A.meta?.bubbles && msg.ts > A.room.serverNow() - 10000) addBubble(A.bubbles, msg.from, msg.text, performance.now(), pair);
  if (A.selected && inPair(pair, A.selected)) renderInspector();
}

$('#world').addEventListener('click', (event) => {
  const point = view.toWorld(event.clientX, event.clientY);
  let best = null;
  let nearest = 44;
  for (const p of named()) {
    if (!p.smooth) continue;
    const d = Math.hypot(p.smooth.x - point.x, p.smooth.y - 18 - point.y); // sprites are drawn above their hit circle
    if (d < nearest) {
      nearest = d;
      best = p;
    }
  }
  if (best) openInspector(best.uid);
});

function openInspector(uid) {
  A.selected = uid;
  renderInspector();
  const dialog = $('#inspector');
  if (!dialog.open) dialog.showModal();
}

function renderInspector() {
  const p = A.players.get(A.selected);
  if (!p) return;
  $('#insAvatar').src = avatarUrl(p.look);
  $('#insName').textContent = p.name;
  $('#insMeta').textContent = [p.persona === 'male' ? 'Male' : 'Female', p.group ? groupLabel(p.group) : null, p.on === false ? 'Away' : 'Online'].filter(Boolean).join(' · ');
  const partners = [...A.pairs].filter((pair) => inPair(pair, p.uid)).map((pair) => A.players.get(partnerOf(pair, p.uid))?.name).filter(Boolean);
  $('#insChatting').textContent = partners.length ? `Chatting with ${partners.join(' & ')} right now` : 'Not chatting right now';
  const messages = [...A.chats]
    .filter(([pair]) => inPair(pair, p.uid))
    .flatMap(([pair, list]) => list.map((m) => ({ ...m, pair })))
    .sort((a, b) => a.ts - b.ts)
    .slice(-40);
  const box = $('#insTranscript');
  box.replaceChildren(
    ...(messages.length
      ? messages.map((m) => h('div', { class: 'msg' }, h('small', {}, `${timeOf(m.ts)} · ${A.players.get(m.from)?.name ?? 'Someone'} → ${A.players.get(partnerOf(m.pair, m.from))?.name ?? 'someone'}`), m.text))
      : [h('p', { class: 'muted' }, 'No messages yet.')]),
  );
  box.scrollTop = box.scrollHeight;
}

$('#insClose').addEventListener('click', () => $('#inspector').close());
$('#inspector').addEventListener('close', () => (A.selected = null));
$('#insRemove').addEventListener('click', () => {
  const p = A.players.get(A.selected);
  if (p) removeStudent(p);
});

// ---------------------------------------------------------------- the animation loop
let last = 0;
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  for (const p of A.players.values()) {
    if (!p.smooth || !p.target) continue;
    const before = p.smooth;
    p.smooth = approach(before, p.target, dt);
    const dx = p.smooth.x - before.x;
    if (Math.abs(dx) > 0.05) p.facing = dx > 0 ? 1 : -1;
    p.moving = Math.hypot(dx, p.smooth.y - before.y) > 0.3;
  }

  // who is touching whom: the same rule the phones use, so the big screen agrees with them
  const here = online().filter((p) => p.smooth);
  const distances = new Map();
  for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) distances.set(pairId(here[i].uid, here[j].uid), dist(here[i].smooth, here[j].smooth));
  const { next, opened, closed } = trackContacts(A.pairs, distances);
  A.pairs = next;
  for (const pair of opened) {
    const [a, b] = pair.split('_').map((uid) => A.players.get(uid)?.smooth);
    if (a && b) view.burst((a.x + b.x) / 2, (a.y + b.y) / 2, now);
  }
  if ((opened.length || closed.length) && A.selected) renderInspector();

  const links = [...A.pairs].map((pair) => pair.split('_').map((uid) => A.players.get(uid)?.smooth)).filter(([a, b]) => a && b);
  pruneBubbles(A.bubbles, now, (pair) => A.pairs.has(pair));
  const players = named().filter((p) => p.smooth).map((p) => ({ ...p, x: p.smooth.x, y: p.smooth.y }));
  view.draw({ now, dt, players, links, bubbles: A.meta?.bubbles ? A.bubbles : null, names: true });
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- controls panel
const panel = $('#panel');
function togglePanel(show = panel.hidden) {
  panel.hidden = !show;
  $('#btnPanel').setAttribute('aria-expanded', String(show));
}
$('#btnPanel').addEventListener('click', () => togglePanel());
$('#btnClosePanel').addEventListener('click', () => togglePanel(false));
document.addEventListener('keydown', (e) => e.key === 'Escape' && !panel.hidden && !$('#inspector').open && togglePanel(false));

for (const tab of $$('#panelTabs [data-tab]')) {
  tab.addEventListener('click', () => {
    for (const t of $$('#panelTabs [data-tab]')) t.setAttribute('aria-selected', String(t === tab));
    for (const section of $$('[data-panel]')) section.hidden = section.dataset.panel !== tab.dataset.tab;
  });
}

$('#btnHideQr').addEventListener('click', () => {
  $('#qrCard').hidden = true;
  $('#btnQr').hidden = false;
});
$('#btnQr').addEventListener('click', () => {
  $('#qrCard').hidden = false;
  $('#btnQr').hidden = true;
});

function buildEnvButtons() {
  $('#envButtons').replaceChildren(
    ...MAP_IDS.map((id) => h('button', { class: 'btn env-btn', type: 'button', 'data-env': id, 'aria-pressed': 'false', onclick: () => A.room.setMeta({ env: id }).catch(() => toast('Couldn’t change the map.')) }, `${MAPS[id].emoji} ${MAPS[id].label}`)),
  );
}

for (const [id, key] of [['#swOpen', 'open'], ['#swChat', 'chat'], ['#swBubbles', 'bubbles']]) {
  $(id).addEventListener('change', (e) => A.room.setMeta({ [key]: e.target.checked }).catch(() => toast('Couldn’t save that setting.')));
}

$('#btnCopy').addEventListener('click', () => navigator.clipboard?.writeText(A.joinUrl).then(() => toast('Join link copied!'), () => toast(A.joinUrl, 6000)));

$('#btnEnd').addEventListener('click', async () => {
  if (!confirm('End the class for everyone? Chats, groups and scores will be deleted.')) return;
  try {
    store.set('cq.admin.room', null);
    await A.room.end();
  } catch {
    toast('Couldn’t end the class. Try again.');
  }
});

// ---------------------------------------------------------------- groups
$('#btnForm').addEventListener('click', () => formNow().then((ok) => ok && toast('Groups formed!')));
$('#btnClearGroups').addEventListener('click', () => A.room.setGroups({}).catch(() => toast('Couldn’t clear the groups.')));

async function formNow() {
  const size = clamp(parseInt($('#groupSize').value, 10) || 3, 2, 10);
  const uids = online().map((p) => p.uid);
  if (uids.length < 2) {
    toast('Wait for at least two students to join first.');
    return false;
  }
  try {
    await A.room.setGroups(formGroups(uids, size));
    return true;
  } catch {
    toast('Couldn’t form groups. Try again.');
    return false;
  }
}

// ---------------------------------------------------------------- quiz builder
for (const [id, field] of [['#qType', 'qType'], ['#qMode', 'qMode']]) {
  for (const btn of $$(`${id} button`)) {
    btn.addEventListener('click', () => {
      A[field] = btn.dataset.v;
      for (const b of $$(`${id} button`)) b.setAttribute('aria-pressed', String(b === btn));
      buildBuilder();
    });
  }
}
$('#btnAddOpt').addEventListener('click', () => {
  if (A.options.length < MAX_OPTIONS) A.options.push('');
  buildBuilder();
});

function buildBuilder() {
  $('#optBox').replaceChildren(
    ...A.options.map((text, i) => {
      const letter = LETTERS[i];
      const radio = h('input', { type: 'radio', name: 'correct', class: 'switch-radio', 'aria-label': `Option ${letter} is the correct answer`, checked: A.correct === i, onchange: () => (A.correct = i), style: 'width:24px;height:24px;accent-color:#d6408a;flex:none' });
      const input = h('input', { class: 'input', maxlength: 80, placeholder: `Option ${letter}`, 'aria-label': `Option ${letter}`, oninput: (e) => (A.options[i] = e.target.value) });
      input.value = text;
      const remove = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove option ${letter}`, disabled: A.options.length <= 2, onclick: () => {
        A.options.splice(i, 1);
        A.correct = Math.min(A.correct > i ? A.correct - 1 : A.correct, A.options.length - 1);
        buildBuilder();
      } }, '✕');
      return h('div', { class: 'row' }, radio, h('div', { class: 'grow' }, input), remove);
    }),
  );
  const choice = A.qType === 'choice';
  $('#optBox').hidden = !choice;
  $('#btnAddOpt').hidden = !choice;
  $('#btnAddOpt').disabled = A.options.length >= MAX_OPTIONS;
  $('#textKeyBox').hidden = choice;
}

$('#btnPublish').addEventListener('click', async () => {
  const error = $('#builderError');
  const fail = (message) => {
    error.textContent = message;
    error.hidden = false;
  };
  error.hidden = true;
  const text = $('#qText').value.trim();
  if (!text) return fail('Type the question first.');
  let options;
  let key = null;
  if (A.qType === 'choice') {
    options = A.options.map((o) => o.trim());
    if (options.some((o) => !o)) return fail('Fill in every option, or remove the empty ones.');
    key = String(A.correct);
  } else key = $('#qKey').value.trim() || null;
  if (A.qMode === 'group' && !Object.keys(A.groups).length && !(await formNow())) return fail('Groups need at least two students. Wait for more to join.');
  const n = (Number(A.quiz?.id?.slice(1)) || 0) + 1;
  const question = { id: `q${n}`, text, type: A.qType, mode: A.qMode, state: 'open', ts: Date.now(), ...(options ? { options } : {}) };
  try {
    await A.room.publishQuestion(question, key);
    A.building = false;
    toast('Question sent to the students!');
    renderMonitor();
  } catch {
    fail('Couldn’t send the question. Try again.');
  }
});

// ---------------------------------------------------------------- quiz monitor
function onQuiz(q) {
  A.quiz = q;
  if (!q) A.building = true;
  if (q?.id !== A.answersFor) {
    A.answersOff?.();
    A.answersOff = null;
    A.answers = {};
    A.answersFor = q?.id ?? null;
    if (q) {
      A.answersOff = A.room.watch(`quiz/ans/${q.id}`, (v) => {
        A.answers = v ?? {};
        renderMonitor();
      });
    }
  }
  renderMonitor();
}

function renderMonitor() {
  const q = A.quiz;
  const box = $('#monitor');
  $('#builder').hidden = !(A.building || !q);
  box.hidden = A.building || !q;
  const chip = $('#quizChip');
  if (!q) {
    chip.hidden = true;
    return;
  }

  const subjects = q.mode === 'group' ? [...new Set(online().map((p) => p.group).filter(Boolean))] : online().map((p) => p.uid);
  const answered = subjects.filter((s) => A.answers[s]);
  const stateLabel = { open: 'Open', closed: 'Closed', revealed: 'Revealed' }[q.state];
  chip.hidden = false;
  chip.textContent = `❓ ${stateLabel} · ${answered.length}/${subjects.length} answered`;
  if (box.hidden) return;

  const options = Object.values(q.options ?? {});
  const parts = [
    h('p', { class: 'eyebrow' }, `${q.mode === 'group' ? 'Groups' : 'Each student'} · ${stateLabel}`),
    h('h3', { class: 'text-lg font-bold' }, q.text),
    h('div', { class: 'bar' }, h('i', { style: `width: ${subjects.length ? (answered.length / subjects.length) * 100 : 0}%` }), h('span', {}, `${answered.length} of ${subjects.length} answered`)),
  ];
  if (q.type === 'choice') {
    const counts = tally(options.length, A.answers);
    const most = Math.max(1, ...counts);
    options.forEach((label, i) => {
      const right = q.state === 'revealed' && String(i) === String(q.answer);
      parts.push(h('div', { class: `bar${right ? ' correct' : ''}` }, h('i', { style: `width: ${(counts[i] / most) * 100}%` }), h('span', {}, `${LETTERS[i]}. ${label} · ${counts[i]}`)));
    });
  } else {
    const rows = Object.entries(A.answers).slice(0, 12).map(([subject, a]) => h('div', { class: 'msg' }, h('small', {}, nameOf(subject)), a.v));
    if (rows.length) parts.push(h('div', { class: 'transcript' }, rows));
    if (q.state === 'revealed' && q.answer) parts.push(h('p', { class: 'font-semibold' }, `Answer: ${String(q.answer).split('|').map((s) => s.trim()).join(' / ')}`));
  }
  const waiting = subjects.filter((s) => !A.answers[s]).map(nameOf);
  if (q.state === 'open' && waiting.length) parts.push(h('p', { class: 'muted' }, `Still thinking: ${waiting.slice(0, 12).join(', ')}${waiting.length > 12 ? '…' : ''}`));
  parts.push(
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', disabled: q.state !== 'open', onclick: () => A.room.setQuestionState('closed').catch(() => toast('Couldn’t close the question.')) }, 'Close answers'),
      h('button', { class: 'btn mint grow', type: 'button', disabled: q.state === 'revealed', onclick: reveal }, 'Reveal & score'),
    ),
    h('button', { class: 'btn primary', type: 'button', onclick: () => { A.building = true; renderMonitor(); } }, 'New question'),
  );
  box.replaceChildren(...parts);
}

async function reveal() {
  const q = A.quiz;
  if (!q || q.state === 'revealed') return;
  try {
    const key = await A.room.getKey(q.id);
    const winners = key == null ? [] : correctSubjects(q, key, A.answers);
    await A.room.reveal(q.id, key, winners);
    toast(key == null ? 'Answers revealed (no correct answer was set, so nobody scored).' : `${winners.length} correct. Points awarded!`);
  } catch {
    toast('Couldn’t reveal the answer. Try again.');
  }
}

// ---------------------------------------------------------------- scores
for (const tab of $$('#boardTabs [data-kind]')) {
  tab.addEventListener('click', () => {
    A.boardKind = tab.dataset.kind;
    for (const t of $$('#boardTabs [data-kind]')) t.setAttribute('aria-selected', String(t === tab));
    renderBoard();
  });
}

function renderBoard() {
  const rows = leaderboard(A.scores, nameOf, A.boardKind).slice(0, 10);
  $('#boardList').replaceChildren(
    ...(rows.length
      ? rows.map((row) => h('li', { class: 'lb-row' }, h('span', { class: 'lb-rank' }, String(row.rank)), h('span', { class: 'lb-name' }, row.name), h('span', { class: 'lb-points' }, `${row.points} pt${row.points === 1 ? '' : 's'}`)))
      : [h('li', { class: 'muted' }, 'No points yet. Reveal a question that has a correct answer.')]),
  );
}

$('#btnPublish').closest('section').addEventListener('input', () => ($('#builderError').hidden = true));
