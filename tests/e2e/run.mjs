// End-to-end test: the real pages in headless Chrome (a teacher and phone-sized students) against the Firebase
// emulators, so the real security rules run too. Local only, like tests/rules: `npm run test:e2e`.
// Needs Java (for the emulators) and Chrome or Edge; set CHROME_PATH if it isn't found. Screenshots land in tests/e2e/shots/.
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = new URL('../../', import.meta.url);
const PORT = process.env.PORT ?? '5199';
process.env.PORT = PORT;
await import(new URL('tools/serve.mjs', root).href);

const CHROME =
  process.env.CHROME_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find(existsSync);
if (!CHROME) throw new Error('Chrome not found: set CHROME_PATH to a Chrome or Edge executable.');

const SHOTS = fileURLToPath(new URL('shots/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
const BASE = `http://localhost:${PORT}`;
const DB = 'http://127.0.0.1:9000';
const NS = 'demo-cuteworld-default-rtdb';
const rest = async (path) => (await fetch(`${DB}/${path}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const errors = [];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, async (err) => {
    console.log(`\nSCRIPT ERROR: ${err?.message ?? err}`);
    console.log((err?.stack ?? '').split('\n').filter((line) => line.includes('run.mjs')).slice(0, 2).join('\n'));
    console.log(`page errors so far: ${[...new Set(errors)].slice(0, 12).join('\n  ')}`);
    await browser.close().catch(() => {});
    process.exit(1);
  });
}

async function open(url, viewport, label) {
  const ctx = await browser.createBrowserContext(); // separate storage = separate anonymous user
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await page.setViewport(viewport);
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${label} console: ${m.text()}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}
const phone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const shot = (page, name) => page.screenshot({ path: `${SHOTS}${name}.png` });
const text = (page, sel) => page.$eval(sel, (e) => e.textContent);
const click = (page, sel) => page.$eval(sel, (e) => e.click());
const waitText = (page, sel, needle, timeout = 15000) => page.waitForFunction((s, n) => document.querySelector(s)?.textContent.includes(n), { timeout }, sel, needle);

// ---- teacher starts a class
const admin = await open(`${BASE}/admin.html?emulator=1`, { width: 1600, height: 900 }, 'admin');
await admin.waitForFunction(() => /^[A-HJKMNP-Z2-9]{6}$/.test(document.querySelector('#codeChip')?.textContent ?? ''));
const code = await text(admin, '#codeChip');
check('teacher gets a 6-character class code', true, code);
await admin.waitForSelector('#qr canvas, #qr img');
check('QR code is drawn', true);
const meta = await rest(`worlds/${code}/meta`);
check('room exists in the database with the teacher as owner', meta?.owner && meta.env === 'school' && meta.open === true);

// ---- two students join on phones
async function join(name, persona, shotName) {
  const page = await open(`${BASE}/student.html?room=${code}&emulator=1`, phone, name);
  await page.waitForSelector('#joinForm');
  await page.type('#name', name);
  if (shotName) await shot(page, shotName);
  await page.click(`.persona[data-persona="${persona}"]`);
  await page.click('#joinBtn');
  await page.waitForSelector('#hud:not([hidden])');
  return page;
}
const s1 = await join('Sam', 'male', 'student-0-join');
const s2 = await join('Alex', 'female');
check('both students are in the class', true);
await waitText(admin, '#countChip', '2 students');
check('teacher sees "2 students"', true, await text(admin, '#countChip'));

const players = await rest(`worlds/${code}/players`);
const uid = Object.fromEntries(Object.entries(players).map(([id, p]) => [p.name, id]));
check('profiles stored with name and persona', players[uid.Sam].persona === 'male' && players[uid.Alex].persona === 'female');

// ---- walking: drive a student with the arrow keys until the avatars touch
async function walk(page, who, targetFn, until, timeout = 40000) {
  const held = new Set();
  const hold = async (keys) => {
    for (const k of [...held]) if (!keys.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of keys) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  const t0 = Date.now();
  try {
    while (Date.now() - t0 < timeout) {
      const me = await rest(`worlds/${code}/pos/${uid[who]}`);
      const target = await targetFn();
      if (!me || !target) { await sleep(150); continue; }
      const dx = target.x - me.x;
      const dy = target.y - me.y;
      if (until(Math.hypot(dx, dy))) return true;
      const keys = new Set();
      if (dx > 18) keys.add('ArrowRight');
      if (dx < -18) keys.add('ArrowLeft');
      if (dy > 18) keys.add('ArrowDown');
      if (dy < -18) keys.add('ArrowUp');
      await hold(keys);
      await sleep(120);
    }
    return false;
  } finally {
    await hold(new Set());
  }
}

await s1.bringToFront();
// Spawn spots are random (the two may even start out touching), so first prove movement on its own...
const before = await rest(`worlds/${code}/pos/${uid.Sam}`);
let moved = 0;
for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) {
  await s1.keyboard.down(key);
  await sleep(700);
  await s1.keyboard.up(key);
  await sleep(300);
  const now = await rest(`worlds/${code}/pos/${uid.Sam}`);
  moved = Math.hypot(now.x - before.x, now.y - before.y);
  if (moved > 20) break;
}
check('the joystick (keyboard) moves a student and the position syncs', moved > 20, `${Math.round(moved)} units`);
// ...then walk into the other student.
const touched = await walk(s1, 'Sam', () => rest(`worlds/${code}/pos/${uid.Alex}`), (d) => d <= 50);
check('walking into another avatar stops at contact (they are solid)', touched);

// ---- bump opens a chat on both phones
await s1.waitForSelector('#chatBar:not([hidden])');
await s2.waitForSelector('#chatBar:not([hidden])');
check('a chat opens on both phones when avatars bump', true, `${await text(s1, '#chatWith')} / ${await text(s2, '#chatWith')}`);
await s1.type('#chatInput', 'Hello from Sam!');
await s1.keyboard.press('Enter');
await sleep(900);
const pair = [uid.Sam, uid.Alex].sort().join('_');
const sent = Object.values((await rest(`worlds/${code}/chats/${pair}`)) ?? {});
check('the message is stored under the pair', sent.some((m) => m.text === 'Hello from Sam!' && m.from === uid.Sam));
await s2.type('#chatInput', 'Hi Sam, nice to meet you');
await s2.keyboard.press('Enter');
await sleep(900);
await shot(s1, 'student-1-chat');
await shot(s2, 'student-1b-chat');

// ---- the teacher can read it
await admin.bringToFront();
await sleep(500);
const alexPos = await rest(`worlds/${code}/pos/${uid.Alex}`);
const k = Math.min(1600 / 1920, 900 / 1080);
await admin.mouse.click(alexPos.x * k, (alexPos.y - 18) * k);
await admin.waitForSelector('#inspector[open]');
await waitText(admin, '#insTranscript', 'Hello from Sam!');
check('teacher can open a character and read the chat transcript', (await text(admin, '#insTranscript')).includes('nice to meet you'));
check('inspector shows who they are chatting with', (await text(admin, '#insChatting')).includes('Chatting with'), await text(admin, '#insChatting'));
await shot(admin, 'admin-1-inspector');
await click(admin, '#insClose');

// ---- walking apart closes the chat
await s1.bringToFront();
await s1.keyboard.press('Escape'); // leave the chat box so the arrow keys walk again
let gap = 0;
for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
  await s1.keyboard.down(key);
  await sleep(1400);
  await s1.keyboard.up(key);
  await sleep(300);
  const a = await rest(`worlds/${code}/pos/${uid.Sam}`);
  const b = await rest(`worlds/${code}/pos/${uid.Alex}`);
  gap = Math.hypot(a.x - b.x, a.y - b.y);
  if (gap > 140) break;
}
check('Sam walked away from Alex', gap > 140, `${Math.round(gap)} units apart`);
await s1.waitForSelector('#chatBar[hidden]', { timeout: 15000 });
await s2.waitForSelector('#chatBar[hidden]', { timeout: 15000 });
check('the chat closes on both phones once the avatars drift apart', true);

// ---- map switch from the teacher
await admin.bringToFront();
await click(admin, '#btnPanel');
await admin.waitForSelector('#panel:not([hidden])');
await click(admin, '#envButtons [data-env="jungle"]');
await waitText(s1, '#envChip', 'Jungle');
await waitText(s2, '#envChip', 'Jungle');
check('switching the map on the big screen switches every phone', true);
await sleep(800);
await shot(admin, 'admin-2-jungle-panel');
await shot(s1, 'student-2-jungle');

// ---- groups
await click(admin, '#panelTabs [data-tab="groups"]');
await admin.$eval('#groupSize', (e) => (e.value = '2'));
await click(admin, '#btnForm');
await waitText(s1, '#meGroup', 'Group');
await waitText(s2, '#meGroup', 'Group');
const groups = await rest(`worlds/${code}/group`);
check('forming groups of 2 puts both students in one group', groups[uid.Sam] && groups[uid.Sam] === groups[uid.Alex], JSON.stringify(groups));

// ---- quiz 1: solo multiple choice
await click(admin, '#panelTabs [data-tab="quiz"]');
await admin.type('#qText', 'Which animal is bigger?');
const opts = await admin.$$('#optBox input.input');
await opts[0].type('Elephant');
await opts[1].type('Mouse');
await click(admin, '#btnPublish');
await s1.waitForSelector('#quizSheet:not([hidden]) .opt');
await s2.waitForSelector('#quizSheet:not([hidden]) .opt');
check('a published question pops up on every phone', (await text(s1, '#quizText')) === 'Which animal is bigger?');
await s1.click('#quizBody .opt:nth-child(1)');
await s2.click('#quizBody .opt:nth-child(2)');
await admin.waitForFunction(() => document.querySelector('#monitor')?.textContent.includes('2 of 2 answered'));
check('teacher sees live answer counts', true);
await admin.evaluate(() => [...document.querySelectorAll('#monitor button')].find((b) => b.textContent.includes('Reveal')).click());
await waitText(s1, '#quizStatus', 'Correct');
await waitText(s2, '#quizStatus', 'Not this time');
const score1 = await rest(`worlds/${code}/quiz/score`);
check('the right answer earns exactly one point', score1?.[uid.Sam] === 1 && score1?.[uid.Alex] === undefined, JSON.stringify(score1));
await shot(s1, 'student-3-quiz');
await shot(admin, 'admin-3-quiz');
await s1.click('#btnBoard');
await s1.waitForSelector('#boardSheet:not([hidden]) .lb-row');
check('the leaderboard lists the scorer', (await text(s1, '#boardList')).includes('Sam') && (await text(s1, '#boardList')).includes('1 pt'), await text(s1, '#boardList'));
await shot(s1, 'student-4-board');
await click(s1, '#boardClose');

// ---- quiz 2: group mode, short text
await admin.evaluate(() => [...document.querySelectorAll('#monitor button')].find((b) => b.textContent.includes('New question')).click());
await click(admin, '#qType [data-v="text"]');
await click(admin, '#qMode [data-v="group"]');
await admin.$eval('#qText', (e) => (e.value = ''));
await admin.type('#qText', 'Capital of France?');
await admin.type('#qKey', 'paris');
await click(admin, '#btnPublish');
await s1.waitForSelector('#quizSheet:not([hidden]) #quizBody input');
await s1.type('#quizBody input', 'Paris');
await s1.keyboard.press('Enter');
await admin.waitForFunction(() => document.querySelector('#monitor')?.textContent.includes('1 of 1 answered'));
await waitText(s2, '#quizStatus', 'answered for your group');
check('in group mode one member answers for the whole group', true, await text(s2, '#quizStatus'));
await admin.evaluate(() => [...document.querySelectorAll('#monitor button')].find((b) => b.textContent.includes('Reveal')).click());
await waitText(s2, '#quizStatus', 'Correct');
const score2 = await rest(`worlds/${code}/quiz/score`);
check('the group (not the individuals) is awarded the point', score2?.[groups[uid.Sam]] === 1 && score2?.[uid.Sam] === 1, JSON.stringify(score2));

// ---- the real phone input: drag the touch joystick
await click(s1, '#quizClose');
await shot(s1, 'student-5-hud');
const t0 = await rest(`worlds/${code}/pos/${uid.Alex}`);
await s2.bringToFront();
await s2.touchscreen.touchStart(150, 230);
await s2.touchscreen.touchMove(225, 230);
await sleep(900);
await s2.touchscreen.touchEnd();
await sleep(500);
const t1 = await rest(`worlds/${code}/pos/${uid.Alex}`);
check('the touch joystick moves a student', Math.hypot(t1.x - t0.x, t1.y - t0.y) > 40, `${Math.round(t0.x)},${Math.round(t0.y)} -> ${Math.round(t1.x)},${Math.round(t1.y)}`);

// ---- latecomers join the smallest group automatically
await join('Late', 'female');
const lateUid = Object.entries(await rest(`worlds/${code}/players`)).find(([, p]) => p.name === 'Late')[0];
await sleep(1500);
check('a latecomer is put in a group automatically', (await rest(`worlds/${code}/group/${lateUid}`)) === 'g1', String(await rest(`worlds/${code}/group/${lateUid}`)));

// ---- locking the room keeps new students out
await admin.bringToFront();
await click(admin, '#panelTabs [data-tab="class"]');
await shot(admin, 'admin-4-class');
await click(admin, '#swOpen');
await sleep(500);
const s4 = await open(`${BASE}/student.html?room=${code}&emulator=1`, phone, 's4');
await s4.waitForSelector('#joinForm');
await s4.type('#name', 'TooLate');
await s4.click('.persona[data-persona="male"]');
await s4.click('#joinBtn');
await waitText(s4, '#joinError', 'new students');
check('a locked room turns new students away politely', true, await text(s4, '#joinError'));
await s4.close();

// ---- refresh resumes
await s2.reload({ waitUntil: 'domcontentloaded' });
await s2.waitForSelector('#hud:not([hidden])');
check('refreshing a student drops them straight back in', true);
check('...with the same name', (await text(s2, '#meName')) === 'Alex');

// ---- remove a student, then end the class
await click(admin, '#panelTabs [data-tab="players"]');
await admin.evaluate(() => [...document.querySelectorAll('#playerList button')].find((b) => b.getAttribute('aria-label') === 'Remove Alex').click());
await waitText(s2, '#noticeTitle', 'removed');
check('a removed student is told so', true);
const rejoin = await rest(`worlds/${code}/banned/${uid.Alex}`);
check('...and cannot rejoin (banned)', rejoin === true);
await click(admin, '#panelTabs [data-tab="class"]');
await click(admin, '#btnEnd');
await waitText(s1, '#noticeTitle', 'ended');
check('ending the class tells students it ended', true);
check('...and deletes all the class data', (await rest(`worlds/${code}`)) === null);

console.log(`\nconsole/page errors: ${errors.length}`);
for (const e of [...new Set(errors)].slice(0, 15)) console.log('  ', e);
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
await browser.close();
process.exit(failed ? 1 : 0);
