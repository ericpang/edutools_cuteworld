// A floating thumb joystick: it appears wherever the finger lands. Arrow keys / WASD work too, for laptops.
export class Joystick {
  constructor(zone, { radius = 56 } = {}) {
    this.zone = zone;
    this.radius = radius;
    this.base = zone.querySelector('.joy-base');
    this.knob = zone.querySelector('.joy-knob');
    this.pointer = null;
    this.origin = { x: 0, y: 0 };
    this.vec = { x: 0, y: 0 };
    this.keys = new Set();

    zone.addEventListener('pointerdown', (e) => this.start(e));
    zone.addEventListener('pointermove', (e) => this.drag(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(type, (e) => this.end(e));
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }

  start(e) {
    if (this.pointer !== null) return;
    this.pointer = e.pointerId;
    this.zone.setPointerCapture(e.pointerId);
    const rect = this.zone.getBoundingClientRect();
    this.origin = { x: e.clientX, y: e.clientY };
    this.base.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px)`;
    this.zone.classList.add('active');
    this.drag(e);
  }

  drag(e) {
    if (e.pointerId !== this.pointer) return;
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    const len = Math.hypot(dx, dy);
    if (len > this.radius) {
      dx = (dx / len) * this.radius;
      dy = (dy / len) * this.radius;
    }
    this.vec = { x: dx / this.radius, y: dy / this.radius };
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  end(e) {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    this.vec = { x: 0, y: 0 };
    this.knob.style.transform = '';
    this.zone.classList.remove('active');
  }

  key(e, down) {
    if (e.target.closest?.('input, textarea, select')) return;
    const names = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
    const dir = names[e.key.toLowerCase()];
    if (!dir) return;
    e.preventDefault();
    if (down) this.keys.add(dir);
    else this.keys.delete(dir);
  }

  get vector() {
    const k = this.keys;
    if (k.size) {
      const x = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0);
      const y = (k.has('down') ? 1 : 0) - (k.has('up') ? 1 : 0);
      const len = Math.hypot(x, y) || 1;
      return { x: x / len, y: y / len };
    }
    return this.vec;
  }
}
