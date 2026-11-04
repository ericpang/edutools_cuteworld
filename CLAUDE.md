# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ClassQuest / Virtual Classroom Grid: students join on phones (QR code), walk a cute character around a themed map with a joystick, chat when their characters bump, and answer the teacher's quizzes. A static site (no build step, no server) on GitHub Pages, with Firebase Realtime Database + Anonymous Auth for all shared state. `README.MD` is the original design doc and is not kept in sync; see "README drift" below.

## Commands

- `npm start` — static preview server (`tools/serve.mjs`, port 5173, prints a LAN URL for testing on a real phone). Teacher: `/admin.html`; students: `/student.html?room=CODE` or `/`.
- `npm test` — unit tests, `node --test "tests/*.test.js"` (Node 22+, no dependencies). This is what CI runs. One file: `node --test tests/<name>.test.js`; one case: add `--test-name-pattern="<regex>"`.
- `npm run test:rules` — `tests/rules` against the Firebase database emulator. Local only (needs Java); CI skips it.
- `npm run test:e2e` — `tests/e2e/run.mjs`: real pages in headless Chrome (a teacher plus phone-sized students) against the auth + database emulators, so the real rules run too. Local only; needs Java and Chrome/Edge (`CHROME_PATH` overrides detection). Screenshots land in `tests/e2e/shots/`. It uses real keyboard and touch input and asserts against the emulator's REST API. The same script passed all 31 checks (no browser errors) before it was moved into the repo; the moved copy has been syntax-checked but not yet run to completion, because the auth + database emulators would not start on the machine it was moved on. Treat the first local run as a check of the script itself.
- On Windows, firebase-tools can leave the emulator's `java` process holding port 9000 after a run, which makes the next run fail ("port taken", or "Database Emulator has exited with code: 3221225786"). Stop only the process listening on 9000/9099 and rerun.
- `npm run emulators` starts the emulators; then add `?emulator` to a page URL on localhost (e.g. `http://localhost:5173/admin.html?emulator`) to use them instead of the real Firebase project.
- `npm run build:maps` regenerates `assets/maps/*.svg` and `js/maps.js`.
- Deploy: `.github/workflows/pages.yml` runs the unit tests on pushes to `main` and on PRs; pushes to `main` and manual runs also publish. The deploy job `cp`s a fixed list (`index.html admin.html student.html css js assets`) into `_site/`, so a new top-level runtime file or folder must be added there, and the step fails if a listed path is missing. `database.rules.json` is not deployed by the workflow.
- Agent skills are managed with `npx skills add <github-url> --skill <name>`: the real copy goes to `.agents/skills/<name>/`, `.claude/skills/<name>` links to it (a junction on Windows), and `skills-lock.json` records it. `web-design-guidelines` is installed this way; it fetches its rules from `raw.githubusercontent.com` on every run.

## Architecture

- **Pages:** `index.html` (role picker), `admin.html` + `js/admin.js` (big screen and teacher controls), `student.html` + `js/student.js` (phone). Plain ES modules; Tailwind (CDN) is used for layout utilities and `css/style.css` holds the theme; `qrcode.min.js` (cdnjs) is only on the admin page. With no bundler every library loads from a CDN URL.
- **`js/firebase.js`** is the only file that names the Firebase SDK URL and version; everything else imports from it. **`js/room.js`** is the only file that reads or writes the database. `js/config.js` is the public web config for the Firebase project shared with `edutools_pinboard`; the rules are the access control, not the config.
- **Pure logic, unit tested, no DOM or Firebase imports:** `world.js` (movement, collision, spawn), `chat.js` (contact hysteresis, speech bubbles), `grouping.js`, `quiz.js` (grading, leaderboard), `codes.js`. Rendering and input: `render.js` (canvas; the big screen shows the whole map, phones follow the player and show a minimap), `joystick.js` (floating touch joystick, arrow keys/WASD on a laptop), `avatars.js` (SVG characters, no image files), `audio.js` (synthesized sounds, no audio files).
- **Maps:** `tools/maps/*.mjs` generate both the artwork (`assets/maps/*.svg`) and the obstacle data (`js/maps.js`) from one definition, so the two cannot disagree. Edit the generator and run `npm run build:maps`, never the generated files (a test fails if they are stale). Every map is 1920x1080 map units, and avatars are 44 units across. `tests/maps.test.js` flood-fills each map to prove spawn points are connected and nobody can be trapped, so keep every gap between solids at least ~60 units. Obstacles are rects and circles only; the Jungle river is a chain of circles along its curve.
- **Data** under `worlds/<code>` (6-character code from an alphabet without I, L, O, 0, 1): `meta` {owner, env, open, chat, bubbles, createdAt}; `players/$uid` {name, persona, color, on}; `pos/$uid` {x, y} (separate from profiles because it is written ~8 times a second); `group/$uid` ('g1', 'g2', ...); `banned/$uid`; `chats/$pairId/$msg` {from, text, ts} (pairId = the two uids sorted and joined by `_`); `quiz/cur`, `quiz/key/$qid` (only the owner can read it), `quiz/ans/$qid/$subject` (subject is a uid, or a group id in group mode), `quiz/score/$subject`.
- **There is no server, so the teacher's page is the coordinator:** it assigns latecomers to the smallest group, grades on reveal (atomic `increment` per winner), and deletes the room on "End session". It must stay open during a class.
- **Rules** (`database.rules.json`) are shared with the other edutools apps (`sessions`, `boards`, `polls`, `mindmaps`); only the `worlds` block is this app's. Deploying the file replaces the whole project's rules, so compare it with the live rules first. Rules enforce identity, membership, lengths, server timestamps, and who may write what, but they cannot check positions, so "must be touching to chat" is enforced on the clients only.

## Behaviour decisions

- Teacher = the room creator's anonymous uid in `meta/owner` (the same convention as the other apps). Refreshing keeps the room (code in localStorage `cq.admin.room`); clearing browser data loses control of a live room.
- Chat opens when two avatars touch (centres within `BUMP_DIST` = 48) and closes once they are more than `CHAT_CLOSE_DIST` = 100 apart. Messages appear as speech bubbles above the characters on the phones; they are stored per pair, and the teacher reads any student's chats from the inspector. The big screen shows a marker between chatting pairs and shows bubble text only if the "show chat bubbles" switch is on. There are no standalone group chat channels.
- Quiz: typed live, one question at a time; multiple choice or short text (accepted answers separated by `|`); asked of each student or of groups (any member answers for the group, the latest answer counts). One point per correct answer on reveal, shown on a simple leaderboard (students or groups). A question with no correct answer is not scored.
- Groups: the teacher picks a size; students are shuffled round-robin so sizes differ by at most one.
- Lifecycle: "End session" deletes all room data; "Remove" bans a student; "Let new students join" off locks the room. Abandoned rooms are never cleaned up automatically.
- Positions are in map units so phones and the projector agree; remote avatars are eased on the receiving side; collisions run on each client.

## README drift

`README.MD` still says `js/firebase-config.js` (the file is `js/config.js`, config only, no initialization), "Realtime Database / Firestore" (it is Realtime Database), JPG maps in `assets/maps` (they are SVG), `assets/avatars` and `assets/audio` (avatars are generated SVG, sounds are synthesized), `nipplejs` (the joystick is custom), and group chat channels (not built). `pages.yml` no longer publishes `manifest.webmanifest` or `sw.js`; there is no PWA.
