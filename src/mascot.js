/* Nigiri mascot engine
 * Renders the squircle mascot as SVG with 16 emotions.
 * API: Mascot.create(el, emotion) -> { set, lookAt, poke, destroy }
 *      Mascot.svg(emotion, uid)   -> static SVG string
 *      Mascot.EMOTIONS            -> ordered list of emotion names
 */
(function (root) {
  const INK = '#1c1b26';
  const ROSE = '#E8566F';
  const YEL = '#FFD94A';
  const RED = '#FF3B4E';

  const heart = (x, y, s = 1, c = RED, cls = 'fx') =>
    `<path class="${cls}" transform="translate(${x} ${y}) scale(${s})" d="M0,8 C-14,-2 -10,-14 0,-6 C10,-14 14,-2 0,8Z" fill="${c}"/>`;

  const sparkle = (x, y, s = 1, c = YEL, cls = 'fx') =>
    `<path class="${cls}" transform="translate(${x} ${y}) scale(${s})" d="M0,-10 Q1.5,-1.5 10,0 Q1.5,1.5 0,10 Q-1.5,1.5 -10,0 Q-1.5,-1.5 0,-10Z" fill="${c}"/>`;

  const stroke = (d, w = 4.5, c = INK) =>
    `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

  const ticks = (d) =>
    `<path class="fx" d="${d}" fill="none" stroke="${YEL}" stroke-width="4.5" stroke-linecap="round"/>`;

  const drop = (x, y) =>
    `<path transform="translate(${x} ${y})" d="M0,-9 C7,0 9,5 9,8 A9,9 0 0 1 -9,8 C-9,5 -7,0 0,-9Z" fill="#59B4F5"/>`;

  /* ---------- eyes ---------- */
  const dot = (x, y = 128) =>
    `<ellipse class="blink" cx="${x}" cy="${y}" rx="6.5" ry="8" fill="${INK}"/>`;

  const EYES = {
    dots: () => `<g class="gaze">${dot(70)}${dot(130)}</g>`,
    happy: () => stroke('M57 134 Q70 117 83 134 M117 134 Q130 117 143 134'),
    closed: () => stroke('M57 125 Q70 138 83 125 M117 125 Q130 138 143 125'),
    wink: () => `<g class="gaze">${dot(70)}</g>` + stroke('M121 119 L138 128 L121 137'),
    kiss: () => `<g class="gaze">${dot(68)}</g>` + stroke('M140 119 L123 128 L140 137'),
    love: () => heart(70, 126, 1.8, RED, '') + heart(130, 126, 1.8, RED, ''),
    cool: () =>
      `<path d="M42 114 H158 V128 Q158 148 138 148 H124 Q108 148 106 130 H94 Q92 148 76 148 H62 Q42 148 42 128Z" fill="${INK}"/>` +
      `<path d="M52 120 L66 120 M52 127 L60 127" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"/>` +
      `<path d="M116 120 L130 120 M116 127 L124 127" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"/>`,
    laugh: () =>
      stroke('M57 117 L79 128 L57 139', 5) + stroke('M143 117 L121 128 L143 139', 5) +
      drop(48, 146) + drop(152, 146),
    angry: () =>
      `<g class="gaze"><ellipse cx="70" cy="134" rx="6" ry="7" fill="${INK}"/><ellipse cx="130" cy="134" rx="6" ry="7" fill="${INK}"/></g>` +
      stroke('M55 116 L84 128 M145 116 L116 128', 5),
    cry: () =>
      stroke('M55 126 Q70 121 85 131 M115 131 Q130 121 145 126', 4.5) +
      `<path d="M55 133 H74 L71 182 H57Z" fill="#59B4F5" opacity=".92"/>` +
      `<path d="M145 133 H126 L129 182 H143Z" fill="#59B4F5" opacity=".92"/>`,
    think: () =>
      `<g class="gaze">${dot(70)}${dot(130, 130)}</g>` +
      stroke('M117 116 Q130 106 144 110', 4.5),
    star: () =>
      `<circle cx="70" cy="128" r="14" fill="${INK}"/><circle cx="130" cy="128" r="14" fill="${INK}"/>` +
      [[64, 121], [75, 133], [124, 121], [135, 133]]
        .map(([x, y]) => `<path transform="translate(${x} ${y}) scale(.5)" d="M0,-10 Q1.5,-1.5 10,0 Q1.5,1.5 0,10 Q-1.5,1.5 -10,0 Q-1.5,-1.5 0,-10Z" fill="#fff"/>`)
        .join('')
  };

  /* ---------- mouths ---------- */
  const MOUTHS = {
    o: () => `<ellipse cx="100" cy="152" rx="4.5" ry="6" fill="${ROSE}"/><ellipse cx="100" cy="154" rx="2.4" ry="2.6" fill="#FF8FA3"/>`,
    oSmall: () => `<ellipse cx="100" cy="152" rx="3.4" ry="4.6" fill="${ROSE}"/>`,
    bigO: () => `<ellipse cx="100" cy="152" rx="8" ry="10" fill="${ROSE}"/><ellipse cx="100" cy="157" rx="4.5" ry="4" fill="#FF8FA3"/>`,
    smile: () => stroke('M91 146 Q100 156 109 146', 3.6),
    grin: () =>
      `<path d="M85 141 Q100 172 115 141 Z" fill="${ROSE}" stroke="${ROSE}" stroke-width="3" stroke-linejoin="round"/>` +
      `<ellipse cx="100" cy="156" rx="7" ry="4.5" fill="#FF8FA3"/>`,
    laugh: () =>
      `<path d="M80 138 Q100 182 120 138 Z" fill="${ROSE}" stroke="${ROSE}" stroke-width="3" stroke-linejoin="round"/>` +
      `<ellipse cx="100" cy="162" rx="10" ry="6" fill="#FF8FA3"/>`,
    frown: () => stroke('M91 156 Q100 146 109 156', 3.6),
    wobble: () =>
      `<path d="M92 158 Q96 148 100 152 Q104 148 108 158 Q100 152 92 158Z" fill="${ROSE}" stroke="${ROSE}" stroke-width="3" stroke-linejoin="round"/>`,
    smirk: () => stroke('M92 152 Q101 150 110 144', 3.6),
    three: () => stroke('M96 143 Q108 147 99 151 Q110 156 98 160', 3.4),
    none: () => ''
  };

  /* ---------- extras (drawn on top of the body) ---------- */
  const zzz = () =>
    ['z|150|34|18', 'z|166|20|24', 'Z|184|2|30']
      .map((s) => s.split('|'))
      .map(([t, x, y, f]) => `<text class="fx" x="${x}" y="${y}" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${f}" fill="#4A7DFF">${t}</text>`)
      .join('');

  const EXTRAS = {
    none: () => '',
    rays: () =>
      ticks('M20 98 L6 90 M18 112 L2 112 M20 126 L6 134') +
      ticks('M180 98 L194 90 M182 112 L198 112 M180 126 L194 134'),
    sparkleR: () => sparkle(168, 30, 1.5),
    hearts: () => heart(186, 22, 1.4) + heart(198, 50, 1.0, '#FF6B81'),
    shineR: () => sparkle(186, 96, 1.2),
    zzz,
    anger: () =>
      `<path class="fx" transform="translate(172 28)" d="M-12 -5 L-5 -5 L-5 -12 M12 -5 L5 -5 L5 -12 M-12 5 L-5 5 L-5 12 M12 5 L5 5 L5 12" fill="none" stroke="${RED}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    hug: () =>
      heart(100, 170, 3.4, RED, '') +
      `<circle cx="74" cy="170" r="11" fill="#fff" stroke="#E6E6F2" stroke-width="2"/><circle cx="126" cy="170" r="11" fill="#fff" stroke="#E6E6F2" stroke-width="2"/>` +
      heart(196, 128, 1.0) + heart(188, 150, 0.7) + heart(-6, 150, 0.8),
    alert: () => ticks('M164 8 L172 26 M180 2 L194 16'),
    heartR: () => heart(184, 20, 1.5, '#FF7A93'),
    question: () =>
      `<text class="fx" x="160" y="40" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="46" fill="${YEL}">?</text>` +
      `<ellipse cx="72" cy="176" rx="15" ry="12" fill="#fff" stroke="#E6E6F2" stroke-width="2"/>` +
      `<ellipse cx="84" cy="168" rx="7" ry="9" fill="#fff" stroke="#E6E6F2" stroke-width="2" transform="rotate(25 84 168)"/>`,
    kissHeart: () => heart(156, 164, 1.6),
    sparkles: () =>
      sparkle(172, 28, 1.7) + sparkle(194, 52, 0.9) + sparkle(8, 70, 1.2) + sparkle(24, 48, 0.8) + sparkle(190, 8, 0.7),
    note: () =>
      `<text class="fx" x="178" y="26" font-family="Arial, sans-serif" font-weight="900" font-size="34" fill="${YEL}">♪</text>`
  };

  /* headphones: band behind body, cups in front */
  const BACK = {
    headphones: () => `<path d="M30 108 C24 -52 176 -52 170 108" fill="none" stroke="#3b3b4d" stroke-width="10" stroke-linecap="round"/><path d="M34 104 C30 -40 170 -40 166 104" fill="none" stroke="#5a5a70" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>`
  };
  const FRONT_EXTRA = {
    headphones: () =>
      `<rect x="10" y="96" width="26" height="54" rx="13" fill="#3b3b4d"/><rect x="14" y="102" width="7" height="40" rx="3.5" fill="#5a5a70"/>` +
      `<rect x="164" y="96" width="26" height="54" rx="13" fill="#3b3b4d"/><rect x="179" y="102" width="7" height="40" rx="3.5" fill="#5a5a70"/>`
  };

  /* ---------- the 16 emotions ---------- */
  const E = {
    neutral:  { label: 'Neutral',   eyes: 'dots',   mouth: 'o',     extra: 'none' },
    happy:    { label: 'Happy',     eyes: 'happy',  mouth: 'grin',  extra: 'rays' },
    wink:     { label: 'Wink',      eyes: 'wink',   mouth: 'smile', extra: 'sparkleR' },
    love:     { label: 'In love',   eyes: 'love',   mouth: 'o',     extra: 'hearts' },
    cool:     { label: 'Cool',      eyes: 'cool',   mouth: 'smile', extra: 'shineR' },
    laugh:    { label: 'LOL',       eyes: 'laugh',  mouth: 'laugh', extra: 'none' },
    sleepy:   { label: 'Sleepy',    eyes: 'closed', mouth: 'oSmall',extra: 'zzz' },
    angry:    { label: 'Angry',     eyes: 'angry',  mouth: 'frown', extra: 'anger' },
    hug:      { label: 'Hug',       eyes: 'happy',  mouth: 'none',  extra: 'hug' },
    surprise: { label: 'Surprised', eyes: 'dots',   mouth: 'bigO',  extra: 'alert' },
    content:  { label: 'Content',   eyes: 'happy',  mouth: 'smile', extra: 'heartR' },
    cry:      { label: 'Crying',    eyes: 'cry',    mouth: 'wobble',extra: 'none' },
    think:    { label: 'Thinking',  eyes: 'think',  mouth: 'smirk', extra: 'question' },
    kiss:     { label: 'Kiss',      eyes: 'kiss',   mouth: 'three', extra: 'kissHeart' },
    starry:   { label: 'Starry',    eyes: 'star',   mouth: 'o',     extra: 'sparkles' },
    music:    { label: 'Music',     eyes: 'closed', mouth: 'smile', extra: 'note', back: 'headphones', front: 'headphones' }
  };

  const EMOTIONS = Object.keys(E);
  const BODY = 'M72 20 H128 C164 20 180 36 180 72 V128 C180 164 164 180 128 180 H72 C36 180 20 164 20 128 V72 C20 36 36 20 72 20Z';

  function svg(name, uid = 'm0') {
    const e = E[name] || E.neutral;
    return `
<svg class="mascot-svg" viewBox="-24 -24 248 248" xmlns="http://www.w3.org/2000/svg" overflow="visible" data-emotion="${name}">
  <defs>
    <linearGradient id="${uid}-top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFB86B"/><stop offset="1" stop-color="#FF8658"/>
    </linearGradient>
    <linearGradient id="${uid}-face" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F1EEF8"/>
    </linearGradient>
    <radialGradient id="${uid}-gloss" cx=".3" cy=".1" r=".7">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="${uid}-clip"><path d="${BODY}"/></clipPath>
  </defs>
  <ellipse class="shadow" cx="100" cy="196" rx="62" ry="7" fill="#000" opacity=".25"/>
  <g class="body-wrap">
    ${e.back ? BACK[e.back]() : ''}
    <path d="${BODY}" fill="url(#${uid}-top)"/>
    <g clip-path="url(#${uid}-clip)">
      <path d="M0 114 Q0 96 28 96 H172 Q200 96 200 114 V210 H0Z" fill="url(#${uid}-face)"/>
      <ellipse cx="62" cy="40" rx="52" ry="22" fill="url(#${uid}-gloss)"/>
    </g>
    <g class="face">
      <ellipse cx="50" cy="146" rx="13" ry="8.5" fill="#FFB3C7" opacity=".75"/>
      <ellipse cx="150" cy="146" rx="13" ry="8.5" fill="#FFB3C7" opacity=".75"/>
      <g class="eyes">${EYES[e.eyes]()}</g>
      <g class="mouth">${MOUTHS[e.mouth]()}</g>
    </g>
    ${e.front ? FRONT_EXTRA[e.front]() : ''}
    <g class="extras">${EXTRAS[e.extra]()}</g>
  </g>
</svg>`;
  }

  let counter = 0;

  function create(el, emotion = 'neutral') {
    const uid = 'm' + counter++;
    let current = emotion;
    let blinkTimer = null;
    let poked = 0;
    let pokeReset = null;

    el.classList.add('mascot');
    const render = (animate) => {
      el.innerHTML = svg(current, uid);
      if (animate) {
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }
    };
    render(false);

    function scheduleBlink() {
      blinkTimer = setTimeout(() => {
        el.classList.add('blinking');
        setTimeout(() => el.classList.remove('blinking'), 120);
        scheduleBlink();
      }, 2200 + Math.random() * 3200);
    }
    scheduleBlink();

    return {
      get emotion() { return current; },
      set(name, animate = true) {
        if (!E[name] || name === current) return;
        current = name;
        render(animate);
      },
      /* nx, ny in -1..1 : where the pointer is relative to the mascot */
      lookAt(nx, ny) {
        const max = 5.5;
        el.style.setProperty('--gx', (nx * max).toFixed(2) + 'px');
        el.style.setProperty('--gy', (ny * max * 0.7).toFixed(2) + 'px');
      },
      poke() {
        el.classList.remove('squish');
        void el.offsetWidth;
        el.classList.add('squish');
        poked++;
        clearTimeout(pokeReset);
        pokeReset = setTimeout(() => (poked = 0), 1400);
        return poked;
      },
      destroy() {
        clearTimeout(blinkTimer);
        el.innerHTML = '';
      }
    };
  }

  const api = { create, svg, EMOTIONS, LABELS: Object.fromEntries(EMOTIONS.map((k) => [k, E[k].label])) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Mascot = api;
})(typeof window !== 'undefined' ? window : globalThis);
