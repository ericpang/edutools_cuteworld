// Cute sound effects made with the Web Audio API (no audio files). Browsers only allow sound after a tap,
// so call unlock() from the Join button.
export function createSounds() {
  let ctx = null;
  let muted = false;
  try {
    muted = localStorage.getItem('cq.muted') === '1';
  } catch {
    /* storage can be blocked; sound simply starts on */
  }

  function unlock() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function blip({ from, to, at = 0, dur = 0.2, type = 'sine', level = 0.25 }) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur * 0.5);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const play = (fn) => {
    if (ctx && !muted && ctx.state === 'running') fn();
  };

  return {
    unlock,
    get muted() {
      return muted;
    },
    setMuted(value) {
      muted = value;
      try {
        localStorage.setItem('cq.muted', value ? '1' : '0');
      } catch {
        /* ignore */
      }
    },
    // two avatars bump: a rising "boop" with a tiny sparkle on top
    bump: () =>
      play(() => {
        const base = 400 + Math.random() * 120;
        blip({ from: base, to: base * 1.9, dur: 0.22 });
        blip({ from: base * 3, to: base * 4, at: 0.07, dur: 0.14, type: 'triangle', level: 0.1 });
      }),
    // a new chat message arrives
    pop: () => play(() => blip({ from: 880, to: 1320, dur: 0.12, level: 0.18 })),
    // quiz question arrives
    ding: () =>
      play(() => {
        blip({ from: 660, to: 660, dur: 0.18, level: 0.2 });
        blip({ from: 990, to: 990, at: 0.12, dur: 0.3, level: 0.2 });
      }),
    // a treasure box opens: four quick notes climbing
    chest: () =>
      play(() => {
        [523, 659, 784, 1047].forEach((hz, i) => blip({ from: hz, to: hz * 1.03, at: i * 0.07, dur: 0.2, type: 'triangle', level: 0.16 }));
      }),
    // a wrong answer: two soft notes stepping down
    oops: () =>
      play(() => {
        blip({ from: 330, to: 262, dur: 0.22, type: 'triangle', level: 0.18 });
        blip({ from: 247, to: 196, at: 0.14, dur: 0.3, type: 'triangle', level: 0.16 });
      }),
  };
}
