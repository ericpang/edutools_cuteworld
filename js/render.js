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
  //          bubbles: Map(uid -> [{text}]), links: [[a, b]], names }
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
  }
}
