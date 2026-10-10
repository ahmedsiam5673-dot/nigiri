/* Settings tab: general, Claude Code hooks, AI provider keys, demo */
(function () {
  const N = window.Nigiri;
  const { $ } = N;
  const settings = {};
  N.modules.settings = settings;

  const CLOUD = [
    ['anthropic', 'Anthropic', 'console.anthropic.com'],
    ['openai', 'OpenAI', 'platform.openai.com'],
    ['google', 'Google AI', 'aistudio.google.com']
  ];
  const LOCAL = [
    ['ollama', 'Ollama', 'http://localhost:11434'],
    ['lmstudio', 'LM Studio', 'http://localhost:1234']
  ];

  const view = $('#view-settings');
  let keys = {};
  let info = { version: '', port: 0, shortcut: 'Ctrl+Alt+N' };

  function sw(id, label, hint) {
    return `<div class="field"><label for="${id}">${label}${hint ? `<small>${hint}</small>` : ''}</label>
      <span class="switch"><input type="checkbox" id="${id}"><i></i></span></div>`;
  }

  function build() {
    view.innerHTML = `
      <section class="group">
        <h2>General</h2>
        ${sw('sSound', 'Sounds', 'Little chimes for approvals, finished work and clicks')}
        <div class="field"><label for="sVolume">Volume</label><input type="range" id="sVolume" min="0" max="1" step="0.05"></div>
        ${sw('sHover', 'Open on hover', 'Expand the island when you point at it')}
        ${sw('sAuto', 'Open for approvals', 'Pop open when an agent needs your OK')}
        ${sw('sLogin', 'Start with Windows')}
        <div class="field"><label>Show or hide<small>Works from anywhere</small></label><kbd id="sShortcut">Ctrl+Alt+N</kbd></div>
      </section>

      <section class="group">
        <h2>Claude Code</h2>
        <p>Shows your sessions here and lets you allow or deny requests from the island. Nigiri adds a few hooks to your Claude Code settings and keeps a backup of the original file.</p>
        <div class="field"><label>Connection</label><span class="status" id="hookStatus">Checking…</span></div>
        <div class="row" style="margin-top:8px">
          <button class="btn small" id="hookInstall">Connect Claude Code</button>
          <button class="btn small ghost" id="hookRemove">Disconnect</button>
        </div>
        <p class="msg-line" id="hookMsg"></p>
      </section>

      <section class="group">
        <h2>AI providers</h2>
        <p>Keys are encrypted with Windows and stay on this PC. They are only sent to the provider you chat with.</p>
        ${CLOUD.map(([id, name, site]) => `
          <div class="field stack" data-provider="${id}">
            <label for="key-${id}">${name}<small>${site}</small></label>
            <input type="password" id="key-${id}" placeholder="Paste API key" autocomplete="off" spellcheck="false">
            <button class="btn small" data-save="${id}">Save</button>
            <button class="btn small ghost" data-clear="${id}">Remove</button>
            <span class="status" id="st-${id}">No key</span>
          </div>`).join('')}
        <p class="msg-line" id="keyMsg"></p>
        ${LOCAL.map(([id, name, def]) => `
          <div class="field stack" data-local="${id}">
            <label for="url-${id}">${name}<small>Runs on this PC, no key needed</small></label>
            <input type="text" id="url-${id}" placeholder="${def}" spellcheck="false">
            <button class="btn small ghost" data-test="${id}">Test</button>
            <span class="status" id="stl-${id}">Not tested</span>
          </div>`).join('')}
      </section>

      <section class="group">
        <h2>Try it</h2>
        <p>Plays a pretend agent session with a permission request, so you can see how everything behaves.</p>
        <div class="row"><button class="btn small" id="sDemo">Start the demo</button></div>
      </section>

      <section class="group">
        <h2>About</h2>
        <div class="field"><label>Nigiri<small id="sVersion"></small></label><button class="btn small danger" id="sQuit">Quit Nigiri</button></div>
      </section>`;
  }

  function setStatus(el, text, kind) {
    el.textContent = text;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  function line(el, text, kind) {
    el.textContent = text || '';
    el.className = 'msg-line' + (kind ? ' ' + kind : '');
  }

  settings.sync = () => {
    const s = N.settings;
    $('#sSound').checked = s.sound;
    $('#sVolume').value = s.volume;
    $('#sHover').checked = s.hoverOpen;
    $('#sAuto').checked = s.autoOpenApprovals;
    CLOUD.forEach(([id]) => setStatus($(`#st-${id}`), keys[id] ? 'Saved' : 'No key', keys[id] ? 'ok' : ''));
    LOCAL.forEach(([id]) => ($(`#url-${id}`).value = s.urls[id]));
  };

  async function refreshHooks() {
    const st = await N.api.hooks.status();
    const el = $('#hookStatus');
    const install = $('#hookInstall');
    const remove = $('#hookRemove');
    remove.disabled = st.state === 'missing' || st.state === 'error';
    install.disabled = !info.port;
    if (!info.port) {
      setStatus(el, 'Hook server could not start', 'bad');
      line($('#hookMsg'), 'Another app may be using the ports 47821 to 47831. Close it and restart Nigiri.', 'bad');
      return;
    }
    const map = {
      installed: ['Connected', 'ok', 'Reconnect'],
      missing: ['Not connected', '', 'Connect Claude Code'],
      outdated: ['Needs reconnecting', 'warn', 'Reconnect'],
      partial: ['Incomplete', 'warn', 'Reconnect'],
      error: ['Settings file problem', 'bad', 'Connect Claude Code']
    };
    const [text, kind, label] = map[st.state] || map.missing;
    setStatus(el, text, kind);
    install.textContent = label;
    if (st.state === 'error') line($('#hookMsg'), st.message, 'bad');
  }

  async function hookAction(kind) {
    const res = await N.api.hooks[kind]();
    if (!res.ok) line($('#hookMsg'), res.error, 'bad');
    else
      line(
        $('#hookMsg'),
        kind === 'install' ? 'Connected. Restart any Claude Code session that is already open.' : 'Disconnected. Your other hooks were left alone.',
        'ok'
      );
    refreshHooks();
  }

  async function saveKey(id) {
    const input = $(`#key-${id}`);
    const res = await N.api.keys.set(id, input.value);
    if (!res.ok) return line($('#keyMsg'), res.error, 'bad');
    input.value = '';
    keys = await N.api.keys.status();
    N.modules.chat.setKeys(keys);
    settings.sync();
    line($('#keyMsg'), 'Key saved.', 'ok');
  }
  async function clearKey(id) {
    await N.api.keys.clear(id);
    keys = await N.api.keys.status();
    N.modules.chat.setKeys(keys);
    settings.sync();
    line($('#keyMsg'), 'Key removed.', 'ok');
  }
  async function testLocal(id) {
    const st = $(`#stl-${id}`);
    const url = $(`#url-${id}`).value.trim();
    N.settings = await N.api.settings.set({ urls: { [id]: url } });
    setStatus(st, 'Testing…');
    const res = await N.api.models.list(id);
    if (res.ok) setStatus(st, `${res.models.length} model${res.models.length === 1 ? '' : 's'} found`, 'ok');
    else setStatus(st, 'Not reachable', 'bad');
  }

  async function change(patch) {
    N.settings = await N.api.settings.set(patch);
    N.applySound();
  }

  settings.onShow = async () => {
    keys = await N.api.keys.status();
    info = await N.api.app.info();
    settings.sync();
    refreshHooks();
  };

  settings.init = async () => {
    build();
    info = await N.api.app.info();
    keys = await N.api.keys.status();
    $('#sVersion').textContent = `Version ${info.version}`;
    $('#sShortcut').textContent = info.shortcut;
    settings.sync();

    $('#sSound').addEventListener('change', (e) => change({ sound: e.target.checked }));
    $('#sVolume').addEventListener('change', (e) => {
      change({ volume: parseFloat(e.target.value) }).then(() => Sounds.play('pop'));
    });
    $('#sHover').addEventListener('change', (e) => change({ hoverOpen: e.target.checked }));
    $('#sAuto').addEventListener('change', (e) => change({ autoOpenApprovals: e.target.checked }));
    $('#sLogin').addEventListener('change', async (e) => {
      e.target.checked = await N.api.app.setLogin(e.target.checked);
    });
    $('#hookInstall').addEventListener('click', () => hookAction('install'));
    $('#hookRemove').addEventListener('click', () => hookAction('uninstall'));
    view.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.save) saveKey(t.dataset.save);
      else if (t.dataset.clear) clearKey(t.dataset.clear);
      else if (t.dataset.test) testLocal(t.dataset.test);
    });
    LOCAL.forEach(([id]) => $(`#url-${id}`).addEventListener('change', () => testLocal(id)));
    $('#sDemo').addEventListener('click', () => {
      N.api.app.demo();
      N.showTab('home');
    });
    $('#sQuit').addEventListener('click', () => N.api.app.quit());
    refreshHooks();
  };
})();
