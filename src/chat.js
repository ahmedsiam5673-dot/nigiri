/* Chat tab: provider + model picker, streaming messages, safe markdown */
(function () {
  const N = window.Nigiri;
  const { $ } = N;
  const chat = {};
  N.modules.chat = chat;

  const LABELS = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google AI', ollama: 'Ollama (local)', lmstudio: 'LM Studio (local)' };
  const LOCAL = ['ollama', 'lmstudio'];
  const FALLBACK_MODELS = {
    anthropic: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'],
    openai: [],
    google: [],
    ollama: [],
    lmstudio: []
  };
  const STORE_KEY = 'nigiri.chat.v1';

  let messages = [];
  let currentId = null;
  let keys = {};
  let renderQueued = false;
  const providerEl = $('#provider');
  const modelEl = $('#model');
  const listEl = $('#modelList');
  const msgsEl = $('#messages');
  const inputEl = $('#input');
  const sendBtn = $('#sendBtn');
  const noticeEl = $('#chatNotice');
  const refreshBtn = $('#refreshModels');

  /* ---------- safe markdown (escape first, then format) ---------- */
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function inline(t) {
    return esc(t)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }
  function markdown(text) {
    let out = '';
    let last = 0;
    const re = /```[\w+-]*\n?([\s\S]*?)(```|$)/g;
    let m;
    while ((m = re.exec(text))) {
      out += inline(text.slice(last, m.index).replace(/\n+$/, ''));
      out += `<div class="code"><button type="button" data-copy>Copy</button><pre><code>${esc(m[1].replace(/\n$/, ''))}</code></pre></div>`;
      last = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++;
    }
    out += inline(last ? text.slice(last).replace(/^\n+/, '') : text);
    return out;
  }
  chat.markdown = markdown;

  /* ---------- persistence ---------- */
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      if (Array.isArray(raw)) messages = raw.filter((m) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role)).slice(-60);
    } catch (e) {
      messages = [];
    }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(messages.filter((m) => !m.error).slice(-60)));
    } catch (e) {
      /* storage full or unavailable: ignore */
    }
  }

  /* ---------- rendering ---------- */
  function bubble(m) {
    const d = document.createElement('div');
    d.className = `msg ${m.error ? 'error' : m.role}`;
    fill(d, m);
    return d;
  }
  function fill(d, m) {
    if (m.role === 'user' || m.error) d.textContent = m.content;
    else d.innerHTML = markdown(m.content);
  }
  function renderAll() {
    msgsEl.replaceChildren();
    if (!messages.length) {
      const e = document.createElement('div');
      e.className = 'chat-empty';
      const mascot = document.createElement('div');
      mascot.className = 'mascot';
      mascot.innerHTML = Mascot.svg('wink', 'chatEmpty');
      const p = document.createElement('p');
      p.textContent = 'Ask me anything. Pick a provider above and start typing.';
      e.append(mascot, p);
      msgsEl.append(e);
      return;
    }
    messages.forEach((m) => msgsEl.append(bubble(m)));
    scrollDown(true);
  }
  function scrollDown(force) {
    const near = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 90;
    if (force || near) msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  function updateLast() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      const node = msgsEl.lastElementChild;
      const m = messages[messages.length - 1];
      if (!node || !m) return;
      fill(node, m);
      node.classList.toggle('typing', !!currentId);
      scrollDown(false);
    });
  }
  function setBusy(busy) {
    N.streaming = busy;
    sendBtn.classList.toggle('stop', busy);
    sendBtn.setAttribute('aria-label', busy ? 'Stop' : 'Send');
    N.refreshMini();
    N.refreshBase();
  }

  /* ---------- provider / model ---------- */
  function notice(text, withButton) {
    noticeEl.replaceChildren();
    noticeEl.hidden = !text;
    if (!text) return;
    noticeEl.append(document.createTextNode(text));
    if (withButton) {
      const b = document.createElement('button');
      b.className = 'btn small ghost';
      b.type = 'button';
      b.textContent = 'Open settings';
      b.addEventListener('click', () => N.showTab('settings'));
      noticeEl.append(b);
    }
  }
  function checkKey() {
    const p = providerEl.value;
    if (!LOCAL.includes(p) && !keys[p]) notice(`Add your ${LABELS[p]} API key to start chatting.`, true);
    else notice('');
  }
  function fillModels(list) {
    listEl.replaceChildren();
    list.forEach((id) => {
      const o = document.createElement('option');
      o.value = id;
      listEl.append(o);
    });
  }
  async function refreshModels(manual) {
    const p = providerEl.value;
    fillModels(FALLBACK_MODELS[p]);
    if (!LOCAL.includes(p) && !keys[p]) return;
    refreshBtn.classList.add('spin');
    const res = await N.api.models.list(p);
    refreshBtn.classList.remove('spin');
    if (p !== providerEl.value) return;
    if (res.ok && res.models.length) {
      fillModels(res.models);
      if (!modelEl.value) {
        const pick = res.models.find((m) => /sonnet/i.test(m)) || res.models[0];
        modelEl.value = pick;
        saveModel();
      }
      checkKey();
    } else if (!res.ok && (manual || LOCAL.includes(p))) {
      notice(LOCAL.includes(p) ? `Can't reach ${LABELS[p]}. Is it running? (${res.error})` : `Couldn't load models: ${res.error}`);
    }
  }
  function saveModel() {
    N.settings.models[providerEl.value] = modelEl.value.trim();
    N.api.settings.set({ models: { [providerEl.value]: modelEl.value.trim() } });
  }
  function applyProvider() {
    const p = providerEl.value;
    modelEl.value = N.settings.models[p] || (FALLBACK_MODELS[p] && FALLBACK_MODELS[p][0]) || '';
    checkKey();
    refreshModels(false);
  }

  /* ---------- sending ---------- */
  async function send() {
    if (N.streaming) return;
    const text = inputEl.value.trim();
    if (!text) return;
    const model = modelEl.value.trim();
    if (!model) return notice('Pick a model first. Type a name or use the refresh button to load the list.');
    inputEl.value = '';
    autosize();
    messages.push({ role: 'user', content: text }, { role: 'assistant', content: '' });
    renderAll();
    N.touch();
    Sounds.play('send');
    setBusy(true);
    const history = messages.slice(0, -1).filter((m) => !m.error && m.content);
    const res = await N.api.chat.send({ provider: providerEl.value, model, messages: history });
    if (!res.ok) return fail(res.error);
    currentId = res.id;
    updateLast();
  }
  function fail(message) {
    currentId = null;
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant' && !last.content) messages.pop();
    messages.push({ role: 'assistant', content: message, error: true });
    renderAll();
    save();
    setBusy(false);
    Sounds.play('error');
    N.flash('cry', 3500);
  }
  function stop() {
    if (currentId) N.api.chat.abort(currentId);
  }
  function autosize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 96) + 'px';
  }

  chat.reset = () => {
    stop();
    messages = [];
    currentId = null;
    save();
    renderAll();
    setBusy(false);
    inputEl.focus();
  };

  chat.onShow = async () => {
    keys = await N.api.keys.status();
    checkKey();
    refreshModels(false);
    setTimeout(() => inputEl.focus(), 60);
  };
  chat.setKeys = (k) => {
    keys = k;
    checkKey();
  };

  chat.init = async () => {
    load();
    keys = await N.api.keys.status();
    Object.entries(LABELS).forEach(([id, label]) => {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = label;
      providerEl.append(o);
    });
    providerEl.value = N.settings.provider;
    providerEl.addEventListener('change', () => {
      N.settings.provider = providerEl.value;
      N.api.settings.set({ provider: providerEl.value });
      applyProvider();
    });
    modelEl.addEventListener('change', saveModel);
    refreshBtn.addEventListener('click', () => refreshModels(true));
    $('#composer').addEventListener('submit', (e) => {
      e.preventDefault();
      if (currentId) stop();
      else send();
    });
    inputEl.addEventListener('input', autosize);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (!currentId) send();
      }
    });
    msgsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-copy]');
      if (!b) return;
      const code = b.parentElement.querySelector('code');
      N.api.app.copy(code ? code.textContent : '');
      b.textContent = 'Copied';
      setTimeout(() => (b.textContent = 'Copy'), 1400);
    });

    N.api.chat.onChunk(({ id, text }) => {
      if (id !== currentId) return;
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') {
        last.content += text;
        updateLast();
      }
    });
    N.api.chat.onDone(({ id, aborted }) => {
      if (id !== currentId) return;
      currentId = null;
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant' && !last.content) messages.pop();
      renderAll();
      save();
      setBusy(false);
      if (!aborted) {
        Sounds.play('finish');
        N.flash('happy', 2500);
      }
    });
    N.api.chat.onError(({ id, message }) => {
      if (id === currentId) fail(message);
    });

    applyProvider();
    renderAll();
  };
})();
