/* Home tab: hero, approval cards, agent sessions */
(function () {
  const N = window.Nigiri;
  const { $ } = N;
  const home = {};
  N.modules.home = home;

  const approvalsEl = $('#approvals');
  const sessionsEl = $('#sessions');
  const emptyEl = $('#empty');
  const cards = new Map(); // approval id -> element
  let hero = null;
  let pokes = 0;
  let pokeTimer = null;
  let backTimer = null;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function decide(id, decision) {
    N.api.agents.decide(id, decision);
    if (decision === 'allow') {
      Sounds.play('allow');
      N.flash('happy', 2200);
    } else if (decision === 'deny') {
      Sounds.play('deny');
      N.flash('cry', 2200);
    }
  }

  function buildCard(a) {
    const card = el('article', 'approval');
    const head = el('div', 'approval-head');
    head.append(el('span', null, 'Allow this?'), el('span', 'tag', a.tool), el('span', 'where', `${a.agent} · ${a.project}`));
    const pre = el('pre', null, a.detail || a.summary);
    const actions = el('div', 'approval-actions');
    const allow = el('button', 'btn', 'Allow');
    const deny = el('button', 'btn danger', 'Deny');
    const term = el('button', 'link', 'Ask in terminal');
    allow.addEventListener('click', () => decide(a.id, 'allow'));
    deny.addEventListener('click', () => decide(a.id, 'deny'));
    term.addEventListener('click', () => decide(a.id, 'terminal'));
    actions.append(allow, deny, term);
    card.append(head, pre, actions);
    return card;
  }

  function renderApprovals() {
    const ids = new Set(N.snap.approvals.map((a) => a.id));
    for (const [id, node] of cards) {
      if (!ids.has(id)) {
        node.remove();
        cards.delete(id);
      }
    }
    for (const a of N.snap.approvals) {
      if (!cards.has(a.id)) {
        const node = buildCard(a);
        cards.set(a.id, node);
        approvalsEl.append(node);
      }
    }
  }

  function renderSessions() {
    sessionsEl.replaceChildren();
    for (const s of N.snap.sessions) {
      const row = el('div', 'session');
      const dot = el('span', `dot ${s.state}`);
      const main = el('div', 'session-main');
      main.append(el('b', null, s.project), el('span', null, `${s.agent} · ${s.lastAction}`));
      const t = el('time', null, N.ago(s.updatedAt));
      row.append(dot, main, t);
      sessionsEl.append(row);
    }
  }

  function renderHero() {
    const { sessions, approvals } = N.snap;
    let title = 'All quiet';
    let sub = 'No agent is running right now.';
    if (approvals.length) {
      const a = approvals[0];
      title = approvals.length > 1 ? `${approvals.length} requests waiting` : 'Needs your OK';
      sub = `${a.agent} in ${a.project} wants to: ${a.summary}`;
    } else {
      const w = sessions.find((s) => s.state === 'working');
      if (w) {
        title = `${w.agent} is working`;
        sub = `${w.project}: ${w.lastAction}`;
      } else if (sessions.some((s) => s.state === 'done')) {
        const d = sessions.find((s) => s.state === 'done');
        title = 'All done';
        sub = `${d.agent} finished in ${d.project}.`;
      } else if (sessions.length) {
        title = 'Connected';
        sub = 'Waiting for the next prompt.';
      }
    }
    $('#heroTitle').textContent = title;
    $('#heroSub').textContent = sub;
  }

  home.render = () => {
    renderHero();
    renderApprovals();
    renderSessions();
    emptyEl.hidden = N.snap.sessions.length > 0 || N.snap.approvals.length > 0;
  };

  home.tick = () => {
    $('#sessions').querySelectorAll('time').forEach((t, i) => {
      const s = N.snap.sessions[i];
      if (s) t.textContent = N.ago(s.updatedAt);
    });
  };

  home.onShow = () => {
    home.render();
    $('[data-tab="home"]').classList.remove('attn');
  };

  home.init = () => {
    hero = N.registerMascot($('#heroMascot'), 'neutral');
    $('#heroMascot').addEventListener('click', () => {
      N.touch();
      pokes = hero.poke();
      Sounds.play('squish');
      N.flash(pokes >= 3 ? 'cry' : 'angry', 1500);
      clearTimeout(backTimer);
    });
    $('#goConnect').addEventListener('click', () => N.showTab('settings'));
    $('#runDemo').addEventListener('click', () => N.api.app.demo());
    N.snap = { sessions: [], approvals: [] };
    N.api.agents.snapshot().then((s) => {
      N.snap = s;
      N.refreshMini();
      N.refreshBase();
      home.render();
    });
  };
})();
