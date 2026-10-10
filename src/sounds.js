/* Tiny synthesized sounds (no audio files needed) */
(function (root) {
  let ctx = null;
  let enabled = true;
  let volume = 0.6;

  function ac() {
    if (!ctx) ctx = new (root.AudioContext || root.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ f = 440, t = 0, d = 0.15, type = 'sine', g = 0.2, slide = 0 }) {
    const c = ac();
    const o = c.createOscillator();
    const a = c.createGain();
    const t0 = c.currentTime + t;
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t0 + d);
    const peak = g * volume;
    a.gain.setValueAtTime(0.0001, t0);
    a.gain.linearRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.012);
    a.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(a);
    a.connect(c.destination);
    o.start(t0);
    o.stop(t0 + d + 0.02);
  }

  const lib = {
    pop: () => tone({ f: 520, d: 0.09, slide: 1.7, g: 0.18 }),
    hello: () => [523, 659, 784].forEach((f, i) => tone({ f, t: i * 0.1, d: 0.16 + i * 0.04, type: 'triangle', g: 0.16 })),
    approval: () => {
      tone({ f: 880, d: 0.13, type: 'triangle', g: 0.2 });
      tone({ f: 660, t: 0.15, d: 0.2, type: 'triangle', g: 0.2 });
    },
    allow: () => {
      tone({ f: 660, d: 0.08, type: 'triangle', g: 0.16 });
      tone({ f: 990, t: 0.08, d: 0.14, type: 'triangle', g: 0.16 });
    },
    deny: () => tone({ f: 330, d: 0.18, slide: 0.65, type: 'triangle', g: 0.18 }),
    finish: () => [523, 659, 784, 1047].forEach((f, i) => tone({ f, t: i * 0.08, d: 0.17, type: 'triangle', g: 0.15 })),
    error: () => tone({ f: 300, d: 0.28, slide: 0.55, type: 'sawtooth', g: 0.1 }),
    squish: () => tone({ f: 250, d: 0.15, slide: 0.5, g: 0.2 }),
    send: () => tone({ f: 700, d: 0.07, slide: 1.4, g: 0.12 })
  };

  root.Sounds = {
    play(name) {
      if (!enabled || !lib[name]) return;
      try {
        lib[name]();
      } catch (e) {
        /* audio unavailable: stay silent */
      }
    },
    configure(o) {
      if (typeof o.enabled === 'boolean') enabled = o.enabled;
      if (typeof o.volume === 'number') volume = Math.max(0, Math.min(1, o.volume));
    }
  };
})(window);
