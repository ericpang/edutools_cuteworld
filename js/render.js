// Canvas renderer shared by the big screen (whole map) and phones (a camera that follows you).
import { AVATAR_R, WORLD, clamp } from './world.js';
import { MAPS } from './maps.js';
import { avatarImage, look } from './avatars.js';
import { groupColor } from './grouping.js';

const SPRITE_H = 80; // drawn height in map units: larger than the hit circle so faces stay readable
const SPRITE_W = (SPRITE_H * 72) / 84;
const FOLLOW_WIDTH = 560; // map units across a phone screen
const INK = '#5b4a6b';
const FAMILY = 'Fredoka, ui-rounded, system-ui, sans-serif';
const DROP_MS = 900; // how long a new treasure box takes to fall in and settle
const DROP_HEIGHT = 240; // map units it falls from

// Ease-out bounce: 0 -> 1 with a few rebounds, so a dropped box lands, hops and settles.
function bounce(t) {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
}

function roundedRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Break text into lines that fit, with an ellipsis if it runs past maxLines.
function wrap(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let line = '';
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (ctx.measureText(word).width > maxWidth) {
      let i = word.length;
      while (i > 1 && ctx.measureText(word.slice(0, i)).width > maxWidth) i--;
      if (line) lines.push(line);
      line = '';
      lines.push(word.slice(0, i));
      word = word.slice(i);
    }
    const attempt = line ? `${line} ${word}` : word;
    if (ctx.measureText(attempt).width <= maxWidth) line = attempt;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/.$/, '')}…`;
  }
  return lines;
}

// A four-point twinkle centred on (x, y).
function sparkle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.closePath();
  ctx.fill();
}

// The treasure box sprite, in map units around (0, 0): about 38 wide and 36 tall, resting on y = 14.
// The caller has set the outline colour and width; `phase` staggers the glow so neighbouring boxes don't pulse in step.
function paintChest(ctx, open, now, phase) {
  const line = ctx.lineWidth;
  const thin = Math.max(1.4, line * 0.55);
  const gold = '#ffd54f';

  if (open) {
    roundedRect(ctx, -17, -30, 34, 17, 6); // the lid, standing open behind the box
    ctx.fillStyle = '#8a5a2b';
    ctx.fill();
    ctx.stroke();
  } else {
    const glow = ctx.createRadialGradient(0, -4, 4, 0, -4, 46);
    glow.addColorStop(0, `rgba(255,213,79,${0.4 + (0.5 + 0.5 * Math.sin(now / 380 + phase)) * 0.3})`);
    glow.addColorStop(1, 'rgba(255,213,79,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, -4, 46, 0, Math.PI * 2);
    ctx.fill();
  }

  roundedRect(ctx, -19, -4, 38, 18, 4); // the box itself, with two plank lines
  ctx.fillStyle = '#c98a4b';
  ctx.fill();
  ctx.strokeStyle = 'rgba(91,58,26,.4)';
  ctx.lineWidth = thin;
  for (const px of [-6, 6]) {
    ctx.beginPath();
    ctx.moveTo(px, -2);
    ctx.lineTo(px, 12);
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = line;
  roundedRect(ctx, -19, -4, 38, 18, 4);
  ctx.stroke();

  if (open) {
    ctx.beginPath(); // the dark inside, a heap of gold and a few coins on top
    ctx.ellipse(0, -4, 17, 5.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#4a2c12';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -6, 13, 4.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = gold;
    ctx.fill();
    ctx.lineWidth = thin;
    ctx.fillStyle = '#ffe680';
    for (const [cx, cy] of [[-7, -9], [1, -11], [8, -8]]) {
      ctx.beginPath();
      ctx.arc(cx, cy, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.lineWidth = line;
    return;
  }

  ctx.beginPath(); // the domed lid
  ctx.moveTo(-19, -3);
  ctx.quadraticCurveTo(-19, -22, 0, -22);
  ctx.quadraticCurveTo(19, -22, 19, -3);
  ctx.closePath();
  ctx.fillStyle = '#e0a860';
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.6)';
  ctx.lineWidth = thin * 1.5;
  ctx.beginPath();
  ctx.moveTo(-13, -11);
  ctx.quadraticCurveTo(-12, -17, -5, -18);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = line;
  roundedRect(ctx, -19, -7, 38, 7, 2); // the gold band round the seam, with a lock
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.stroke();
  roundedRect(ctx, -5, -9, 10, 11, 3);
  ctx.fillStyle = '#ffe680';
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0, -4.5, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-0.8, -4.5, 1.6, 4);

  ctx.fillStyle = '#fffbe0'; // twinkles that come and go
  [[-24, -20, 5], [23, -14, 4], [3, -33, 5]].forEach(([tx, ty, r], i) => {
    const k = Math.max(0, Math.sin(now / 420 + phase + i * 2.1));
    if (k > 0.05) sparkle(ctx, tx, ty, r * k);
  });
}

export class WorldView {
  constructor(canvas, { follow = false, minimap = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.follow = follow;
    this.minimap = minimap;
    this.mapId = null;
    this.img = null;
    this.bg = null;
    this.bgScale = 0;
    this.cam = null;
    this.sparks = [];
    this.view = { x0: 0, y0: 0, ox: 0, oy: 0 };
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  async setMap(id) {
    if (id === this.mapId) return;
    this.mapId = id;
    this.bg = null;
    const img = new Image();
    img.src = MAPS[id].src;
    try {
      await img.decode();
    } catch {
      return; // draw plain ground rather than crash
    }
    if (this.mapId !== id) return; // switched again while loading
    this.img = img;
    this.bake();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    Object.assign(this, { dpr, cw: w, ch: h });
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.scale = this.follow ? Math.max(w / FOLLOW_WIDTH, h / WORLD.h, w / WORLD.w) : Math.min(w / WORLD.w, h / WORLD.h);
    this.bake();
  }

  // Rasterise the map once at the resolution this screen needs (capped, so phones don't run out of memory).
  bake() {
    if (!this.img) return;
    const rs = clamp(Math.round(this.scale * this.dpr * 4) / 4, 0.5, 2);
    if (this.bg && rs === this.bgScale) return;
    const c = document.createElement('canvas');
    c.width = Math.round(WORLD.w * rs);
    c.height = Math.round(WORLD.h * rs);
    c.getContext('2d').drawImage(this.img, 0, 0, c.width, c.height);
    this.bg = c;
    this.bgScale = rs;
  }

  toWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const { x0, y0, ox, oy } = this.view;
    return { x: (clientX - r.left - ox) / this.scale + x0, y: (clientY - r.top - oy) / this.scale + y0 };
  }

  // A burst of stars and hearts at a map position.
  burst(x, y, now) {
    const colors = ['#ff7eb6', '#ffd54f', '#7fd4ff', '#a5e8c3', '#c9a8ff'];
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 110;
      this.sparks.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 40, t0: now, life: 650 + Math.random() * 350, color: colors[i % 5], heart: i % 4 === 0, size: 6 + Math.random() * 6 });
    }
  }

  // frame: { now, dt, players: [{uid, name, persona, color, group, on, x, y, facing, moving, look?}], meId, focus,
  //          bubbles: Map(uid -> [{text}]), links: [[a, b]], names,
  //          chests: [{ id, x, y, since, open, count? }]  (`since` is when the box dropped; `count` adds a badge) }
  draw(f) {
    const { ctx, dpr, scale } = this;
    const vw = this.cw / scale;
    const vh = this.ch / scale;
    let x0 = 0;
    let y0 = 0;
    let ox = 0;
    let oy = 0;
    if (this.follow) {
      const t = f.focus ?? { x: WORLD.w / 2, y: WORLD.h / 2 };
      this.cam ??= { x: t.x, y: t.y };
      const k = 1 - Math.exp(-(f.dt ?? 0.016) / 0.1);
      this.cam.x += (t.x - this.cam.x) * k;
      this.cam.y += (t.y - this.cam.y) * k;
      x0 = clamp(this.cam.x - vw / 2, 0, Math.max(0, WORLD.w - vw));
      y0 = clamp(this.cam.y - vh / 2, 0, Math.max(0, WORLD.h - vh));
    } else {
      ox = (this.cw - WORLD.w * scale) / 2;
      oy = (this.ch - WORLD.h * scale) / 2;
    }
    this.view = { x0, y0, ox, oy };
    const sx = (x) => ox + (x - x0) * scale;
    const sy = (y) => oy + (y - y0) * scale;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#efe6ff';
    ctx.fillRect(0, 0, this.cw, this.ch);
    if (this.bg) {
      const rs = this.bgScale;
      const w = this.follow ? vw : WORLD.w;
      const h = this.follow ? vh : WORLD.h;
      ctx.drawImage(this.bg, x0 * rs, y0 * rs, w * rs, h * rs, ox, oy, w * scale, h * scale);
    }

    for (const c of f.chests ?? []) this.drawChest(ctx, c, sx(c.x), sy(c.y), scale, f.now);
    for (const [a, b] of f.links ?? []) this.drawLink(ctx, sx(a.x), sy(a.y), sx(b.x), sy(b.y), scale, f.now);

    const players = [...f.players].sort((a, b) => a.y - b.y);
    for (const p of players) this.drawBody(ctx, p, sx(p.x), sy(p.y), scale, f.now, p.uid === f.meId);
    this.drawSparks(ctx, f.now, sx, sy, scale);
    const font = clamp(15 * scale + 4, 12, 20);
    for (const p of players) {
      if (f.names !== false) this.drawName(ctx, p, sx(p.x), sy(p.y), scale, font, p.uid === f.meId, f.now);
      const list = f.bubbles?.get(p.uid);
      if (list?.length) this.drawBubbles(ctx, list, sx(p.x), sy(p.y) + AVATAR_R * 0.9 * scale - SPRITE_H * scale - font - 14, font, p.uid === f.meId);
    }
    if (this.minimap && this.bg) this.drawMinimap(ctx, f, vw, vh);
  }

  // A treasure box lying on the ground (it is not solid: walking into it opens it). Closed boxes glow and twinkle;
  // opened ones sit open with their gold showing. A box with a `count` gets a badge: how many students have answered it.
  drawChest(ctx, c, x, y, s, now) {
    const lift = 1 - bounce(clamp((now - c.since) / DROP_MS, 0, 1)); // 1 = high up, 0 = on the ground
    const top = y - lift * DROP_HEIGHT * s;
    if (x < -70 || x > this.cw + 70 || top < -70 - 40 * s || y > this.ch + 70) return;
    ctx.save();
    ctx.fillStyle = `rgba(45,27,78,${0.2 - lift * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(x, y + 15 * s, (24 - lift * 8) * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(x, top);
    ctx.scale(s, s); // from here on, drawing is in map units with the box's centre at the origin
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2.5, 1.6 / s);
    ctx.strokeStyle = INK;
    paintChest(ctx, c.open, now, c.x * 0.05);
    ctx.restore();
    if (c.count != null) {
      const font = clamp(11 * s + 5, 12, 17);
      const text = String(c.count);
      ctx.save();
      ctx.font = `700 ${font}px ${FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = Math.max(font + 8, ctx.measureText(text).width + 14);
      const bx = x + 21 * s;
      const by = top - 25 * s;
      roundedRect(ctx, bx - w / 2, by - (font + 6) / 2, w, font + 6, (font + 6) / 2);
      ctx.fillStyle = c.count ? '#c9f5e5' : '#fff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillText(text, bx, by + 1);
      ctx.restore();
    }
  }

  drawBody(ctx, p, x, y, s, now, isMe) {
    ctx.save();
    ctx.globalAlpha = p.on === false ? 0.45 : 1;
    const foot = y + AVATAR_R * 0.9 * s;
    ctx.fillStyle = 'rgba(45,27,78,.18)';
    ctx.beginPath();
    ctx.ellipse(x, foot, (AVATAR_R + 5) * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (p.group) {
      ctx.strokeStyle = groupColor(p.group);
      ctx.lineWidth = Math.max(2.5, 4 * s);
      ctx.beginPath();
      ctx.ellipse(x, foot, (AVATAR_R + 9) * s, 11 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (isMe) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(2, 3 * s);
      ctx.setLineDash([6 * s, 5 * s]);
      ctx.beginPath();
      ctx.ellipse(x, foot, (AVATAR_R + 15) * s, 15 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const img = avatarImage(p.look ?? look(p));
    const h = SPRITE_H * s;
    const w = SPRITE_W * s;
    const beat = Math.sin(now / 90);
    const bob = p.moving ? Math.abs(beat) * 4 * s : 0;
    const squash = p.moving ? 1 + beat * 0.03 : 1;
    ctx.translate(x, foot - bob);
    if (p.facing < 0) ctx.scale(-1, 1);
    ctx.scale(1 / squash, squash);
    if (img.complete && img.naturalWidth) ctx.drawImage(img, -w / 2, -h, w, h);
    else {
      ctx.fillStyle = '#e6dcf5';
      ctx.beginPath();
      ctx.arc(0, -h / 2, w / 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawName(ctx, p, x, y, s, font, isMe, now) {
    const top = y + AVATAR_R * 0.9 * s - SPRITE_H * s;
    ctx.save();
    ctx.globalAlpha = p.on === false ? 0.55 : 1;
    ctx.font = `600 ${font}px ${FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const name = p.name ?? '';
    const w = ctx.measureText(name).width + 16;
    const h = font + 8;
    roundedRect(ctx, x - w / 2, top - h - 2, w, h, h / 2);
    ctx.fillStyle = isMe ? '#fff3a8' : 'rgba(255,255,255,.92)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(name, x, top - h / 2 - 1);
    if (isMe) {
      const bounce = Math.sin(now / 220) * 3;
      ctx.fillStyle = '#ff7eb6';
      ctx.beginPath();
      ctx.moveTo(x - 7, top - h - 12 + bounce);
      ctx.lineTo(x + 7, top - h - 12 + bounce);
      ctx.lineTo(x, top - h - 3 + bounce);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Speech bubbles sit above the speaker's name: newest at the bottom, up to two stacked.
  drawBubbles(ctx, list, x, bottom, font, mine) {
    ctx.save();
    ctx.font = `500 ${Math.max(13, font - 2)}px ${FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lineH = Math.max(13, font - 2) + 4;
    const maxW = Math.min(200, this.cw * 0.6);
    let y = bottom - 8;
    for (const [i, b] of [...list].reverse().entries()) {
      const lines = wrap(ctx, b.text, maxW, 3);
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20;
      const h = lines.length * lineH + 12;
      const bx = clamp(x - w / 2, 6, this.cw - w - 6);
      y -= h;
      ctx.globalAlpha = i === 0 ? 1 : 0.8;
      roundedRect(ctx, bx, y, w, h, 14);
      ctx.fillStyle = mine ? '#c9f5e5' : '#fff';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      if (i === 0) {
        const tx = clamp(x, bx + 14, bx + w - 14);
        ctx.beginPath();
        ctx.moveTo(tx - 7, y + h - 1);
        ctx.lineTo(tx + 7, y + h - 1);
        ctx.lineTo(tx, y + h + 8);
        ctx.closePath();
        ctx.fillStyle = mine ? '#c9f5e5' : '#fff';
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx - 6, y + h);
        ctx.lineTo(tx + 6, y + h);
        ctx.strokeStyle = mine ? '#c9f5e5' : '#fff';
        ctx.stroke();
        ctx.strokeStyle = INK;
      }
      ctx.fillStyle = INK;
      lines.forEach((line, k) => ctx.fillText(line, bx + 10, y + 6 + k * lineH));
      y -= 6;
    }
    ctx.restore();
  }

  // Two avatars in a chat: a dashed line and a little speech icon between them (big screen).
  drawLink(ctx, ax, ay, bx, by, s, now) {
    ctx.save();
    ctx.strokeStyle = '#ff7eb6';
    ctx.lineWidth = Math.max(2, 3 * s);
    ctx.setLineDash([5 * s, 6 * s]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2 - 34 * s + Math.sin(now / 300) * 2;
    const w = 40 * s + 8;
    const h = 26 * s + 6;
    roundedRect(ctx, mx - w / 2, my - h / 2, w, h, h / 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = '#ff7eb6';
    for (const dx of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.arc(mx + dx * 9 * s, my, 3 * s + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawSparks(ctx, now, sx, sy, s) {
    this.sparks = this.sparks.filter((p) => now - p.t0 < p.life);
    for (const p of this.sparks) {
      const age = (now - p.t0) / 1000;
      const fade = 1 - (now - p.t0) / p.life;
      const x = sx(p.x + p.vx * age);
      const y = sy(p.y + p.vy * age + 120 * age * age);
      const r = p.size * Math.max(s, 0.7) * (0.6 + fade * 0.6);
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillStyle = p.color;
      ctx.translate(x, y);
      ctx.rotate(age * 3);
      ctx.beginPath();
      if (p.heart) {
        ctx.moveTo(0, r * 0.9);
        ctx.bezierCurveTo(-r * 1.6, -r * 0.2, -r * 0.7, -r * 1.2, 0, -r * 0.4);
        ctx.bezierCurveTo(r * 0.7, -r * 1.2, r * 1.6, -r * 0.2, 0, r * 0.9);
      } else {
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          const d = i % 2 ? r * 0.4 : r * 1.3;
          ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // Phones get a little map so you can find your classmates.
  drawMinimap(ctx, f, vw, vh) {
    const w = 128;
    const h = (w * WORLD.h) / WORLD.w;
    const x = this.cw - w - 12;
    const y = 64;
    const k = w / WORLD.w;
    ctx.save();
    roundedRect(ctx, x, y, w, h, 10);
    ctx.clip();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(this.bg, 0, 0, this.bg.width, this.bg.height, x, y, w, h);
    ctx.globalAlpha = 1;
    const pulse = 1 + 0.3 * Math.sin(f.now / 260);
    for (const c of f.chests ?? []) {
      if (c.open) continue; // boxes this student has already opened are not worth looking for
      ctx.beginPath();
      ctx.rect(x + c.x * k - 3.5 * pulse, y + c.y * k - 3.5 * pulse, 7 * pulse, 7 * pulse);
      ctx.fillStyle = '#ffd54f';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    for (const p of f.players) {
      if (p.on === false) continue;
      const me = p.uid === f.meId;
      ctx.beginPath();
      ctx.arc(x + p.x * k, y + p.y * k, me ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = me ? '#ff4d94' : '#fff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + this.view.x0 * k, y + this.view.y0 * k, vw * k, vh * k);
    ctx.restore();
    roundedRect(ctx, x, y, w, h, 10);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // how many boxes are still waiting to be found
    const boxes = f.chests ?? [];
    if (boxes.length) {
      const left = boxes.filter((c) => !c.open).length;
      ctx.save();
      ctx.font = `600 13px ${FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = left ? `🎁 ${left} left` : '🎁 All found!';
      const pw = ctx.measureText(label).width + 18;
      roundedRect(ctx, x + w - pw, y + h + 6, pw, 24, 12);
      ctx.fillStyle = left ? '#fff3a8' : '#c9f5e5';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillText(label, x + w - pw / 2, y + h + 19);
      ctx.restore();
    }
  }
}
