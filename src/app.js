/* Nigiri shell: island open/close, tabs, mascots and mood, shared state */
(function () {
  const N = (window.Nigiri = {
    api: window.nigiri,
    settings: null,
    snap: { sessions: [], approvals: [] },
    state: 'mini',
    tab: 'home',
    hover: false,
    streaming: false,
    autoOpened: false,
    lastActivity: Date.now(),
    modules: {},
    mascots: []
  });

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  N.$ = $;
  N.$$ = $$;
  const island = $('#island');
  const clamp = (v) => Math.max(-1, Math.min(1, v));

  N.touch = () => (N.lastActivity = Date.now());
  N.ago = (ts) => {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 10) return 'now';
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h`;
  };

  /* ---------- mascots and mood ---------- */
  const mood = { base: 'neutral', temp: null, timer: null };

  N.registerMascot = (el, emotion = 'neutral') => {
    const m = Mascot.create(el, emotion);
    N.mascots.push({ el, m });
    return m;
  };
  const applyMood = () => {
    const name = mood.temp || mood.base;
    N.mascots.forEach(({ m }) => m.set(name));
  };
  N.flash = (name, ms = 2600) => {
    mood.temp = name;
    clearTimeout(mood.timer);
    mood.timer = setTimeout(() => {
      mood.temp = null;
      applyMood();
    }, ms);
    applyMood();
  };
  N.refreshBase = () => {
    const working = N.snap.sessions.some((s) => s.state === 'working');
    let m = 'neutral';
    if (N.snap.approvals.length) m = 'surprise';
    else if (N.streaming) m = 'think';
    else if (working) m = 'music';
    else if (Date.now() - N.lastActivity > 120000) m = 'sleepy';
    mood.base = m;
    applyMood();
  };

  N.lookAt = (x, y) => {
    N.mascots.forEach(({ el, m }) => {
      if (!el.isConnected || el.closest('[hidden]')) return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      m.lookAt(clamp((x - (r.left + r.width / 2)) / 240), clamp((y - (r.top + r.height / 2)) / 180));
    });
  };

  /* ---------- mini pill text ---------- */
  N.refreshMini = () => {
    const { sessions, approvals } = N.snap;
    let title = 'Nigiri';
    let sub = 'All quiet';
    if (approvals.length) {
      title = approvals.length > 1 ? `${approvals.length} need your OK` : 'Needs your OK';
      sub = `${approvals[0].project} · ${approvals[0].summary}`;
    } else if (N.streaming) {
      title = 'Thinking…';
      sub = 'Answering in chat';
    } else {
      const w = sessions.find((s) => s.state === 'working');
      if (w) {
        title = 'Working';
        sub = `${w.project}: ${w.lastAction}`;
      } else if (sessions.some((s) => s.state === 'done')) {
        title = 'All done';
        sub = sessions.find((s) => s.state === 'done').project;
      } else if (sessions.length) {
        title = 'Connected';
        sub = sessions.length === 1 ? sessions[0].project : `${sessions.length} sessions`;
      }
    }
    $('#miniTitle').textContent = title;
    $('#miniSub').textContent = sub;
    const badge = $('#badge');
    badge.hidden = approvals.length === 0;
    badge.textContent = approvals.length;
    island.dataset.attention = String(approvals.length > 0);
    $('[data-tab="home"]').classList.toggle('attn', approvals.length > 0 && N.tab !== 'home');
  };

  /* ---------- open / close / tabs ---------- */
  N.showTab = (name) => {
    N.tab = name;
    $$('.view').forEach((v) => (v.hidden = v.id !== `view-${name}`));
    $$('#tabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    const mod = N.modules[name];
    if (mod && mod.onShow) mod.onShow();
    N.refreshMini();
  };

  N.open = (tab, { auto = false } = {}) => {
    N.touch();
    if (tab) N.showTab(tab);
    if (N.state === 'open') return;
    N.state = 'open';
    N.autoOpened = auto;
    island.dataset.state = 'open';
    Sounds.play('pop');
    N.refreshBase();
  };

  N.close = () => {
    if (N.state !== 'open') return;
    N.state = 'mini';
    N.autoOpened = false;
    island.dataset.state = 'mini';
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  };

  /* ---------- agents snapshot ---------- */
  N.onSnapshot = (snap) => {
    const before = N.snap.approvals;
    const seen = new Set(before.map((a) => a.id));
    const fresh = snap.approvals.filter((a) => !seen.has(a.id));
    N.snap = snap;
    N.touch();
    N.refreshMini();
    N.refreshBase();
    if (N.modules.home) N.modules.home.render();

    if (fresh.length) {
      Sounds.play('approval');
      N.flash('surprise', 4000);
      if (N.state === 'mini' && N.settings.autoOpenApprovals) N.open('home', { auto: true });
    }
    if (before.length && !snap.approvals.length && N.autoOpened) {
      setTimeout(() => {
        if (N.autoOpened && !N.snap.approvals.length) N.close();
      }, 1600);
    }
  };

  /* ---------- sound button ---------- */
  N.applySound = () => {
    const s = N.settings;
    Sounds.configure({ enabled: s.sound, volume: s.volume });
    $('#soundBtn').classList.toggle('off', !s.sound);
    $('#soundBtn').setAttribute('aria-pressed', String(s.sound));
  };

  /* ---------- init ---------- */
  N.init = () => {
    $('#mini').addEventListener('click', () => N.open(N.tab));
    $$('#tabs [data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        N.autoOpened = false; // the user took over, so don't close it for them
        N.showTab(b.dataset.tab);
      })
    );
    $('#newChat').addEventListener('click', () => {
      N.autoOpened = false;
      N.showTab('chat');
      if (N.modules.chat) N.modules.chat.reset();
    });
    $('#soundBtn').addEventListener('click', async () => {
      N.settings = await N.api.settings.set({ sound: !N.settings.sound });
      N.applySound();
      if (N.settings.sound) Sounds.play('pop');
      if (N.modules.settings) N.modules.settings.sync();
    });

    // hover peek and optional open-on-hover
    let hoverTimer = null;
    island.addEventListener('mouseenter', () => {
      N.hover = true;
      N.touch();
      if (N.state === 'mini') {
        if (!N.snap.approvals.length) N.flash('happy', 1800);
        if (N.settings.hoverOpen) hoverTimer = setTimeout(() => N.hover && N.open(N.tab), 380);
      }
    });
    island.addEventListener('mouseleave', () => {
      N.hover = false;
      clearTimeout(hoverTimer);
    });

    // the window is click-through except over the island itself
    let interactive = false;
    const setInteractive = (v) => {
      if (v !== interactive) {
        interactive = v;
        N.api.island.setInteractive(v);
      }
    };
    document.addEventListener('mousemove', (e) => setInteractive(!!e.target.closest('.bar, .panel')));
    document.addEventListener('mouseleave', () => setInteractive(false));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && N.state === 'open') N.close();
    });

    N.api.island.onCursor(({ x, y }) => N.lookAt(x, y));
    N.api.island.onBlur(() => {
      if (N.state === 'open' && !N.snap.approvals.length) N.close();
    });
    N.api.island.onToggle((tab) => {
      if (tab) return N.open(tab);
      if (N.state === 'open') N.close();
      else N.open(N.tab);
    });
    N.api.island.onOpenTab((tab) => N.open(tab));
    N.api.agents.onUpdate(N.onSnapshot);
    N.api.agents.onFinish(() => {
      Sounds.play('finish');
      N.flash('happy', 4500);
    });

    N.registerMascot($('#miniMascot'), 'neutral');
    setInterval(() => {
      N.refreshBase();
      if (N.modules.home && N.state === 'open' && N.tab === 'home') N.modules.home.tick();
    }, 5000);
  };
})();
