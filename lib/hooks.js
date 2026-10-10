'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;
const MARKER = 'src=nigiri';

const VERBS = {
  Read: 'Reading',
  Edit: 'Editing',
  MultiEdit: 'Editing',
  Write: 'Writing',
  NotebookEdit: 'Editing notebook',
  Bash: 'Running',
  Grep: 'Searching for',
  Glob: 'Finding',
  WebFetch: 'Fetching',
  WebSearch: 'Searching the web for',
  Task: 'Delegating',
  TodoWrite: 'Planning'
};

function clip(s, n) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function baseName(p) {
  return p ? String(p).split(/[\\/]/).filter(Boolean).pop() || String(p) : '';
}

/** returns { verb, target, detail } for a tool call */
function describeTool(name, input) {
  const i = input && typeof input === 'object' ? input : {};
  const verb = VERBS[name] || (String(name).startsWith('mcp__') ? 'Calling' : `Using ${name}`);
  let target = '';
  let detail = '';
  switch (name) {
    case 'Bash':
      target = clip(i.command, 70);
      detail = String(i.command || '');
      break;
    case 'Read':
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      target = baseName(i.file_path);
      detail = String(i.file_path || '');
      break;
    case 'NotebookEdit':
      target = baseName(i.notebook_path);
      detail = String(i.notebook_path || '');
      break;
    case 'Grep':
    case 'Glob':
      target = clip(i.pattern, 50);
      detail = String(i.pattern || '') + (i.path ? `\nin ${i.path}` : '');
      break;
    case 'WebFetch':
      target = clip(i.url, 60);
      detail = String(i.url || '');
      break;
    case 'WebSearch':
      target = clip(i.query, 60);
      detail = String(i.query || '');
      break;
    case 'Task':
      target = clip(i.description, 60);
      detail = String(i.prompt || i.description || '');
      break;
    default:
      if (String(name).startsWith('mcp__')) {
        target = String(name).split('__').slice(1).join(' · ');
      }
      try {
        detail = JSON.stringify(i, null, 2);
      } catch {}
  }
  return { verb, target, detail: detail.slice(0, 800) };
}

class HookCore extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.approvals = new Map();
    this.seq = 0;
    this.purgeTimer = setInterval(() => this._purge(), 10 * 60 * 1000);
    if (this.purgeTimer.unref) this.purgeTimer.unref();
  }

  close() {
    clearInterval(this.purgeTimer);
    for (const id of [...this.approvals.keys()]) this.decide(id, 'terminal');
  }

  snapshot() {
    const sessions = [...this.sessions.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ id, agent, project, state, lastAction, startedAt, updatedAt }) => ({ id, agent, project, state, lastAction, startedAt, updatedAt }));
    const approvals = [...this.approvals.values()].map((a) => a.public);
    return { sessions, approvals };
  }

  _change() {
    this.emit('change', this.snapshot());
  }

  _session(evt, agent) {
    const sid = String(evt.session_id || 'unknown');
    const key = `${agent}:${sid}`;
    let s = this.sessions.get(key);
    if (!s) {
      s = {
        id: key,
        agent: agent === 'claude' ? 'Claude Code' : agent === 'demo' ? 'Demo agent' : agent,
        project: baseName(evt.cwd) || 'session',
        state: 'idle',
        lastAction: 'Session started',
        startedAt: Date.now(),
        updatedAt: Date.now()
      };
      this.sessions.set(key, s);
    }
    if (evt.cwd) s.project = baseName(evt.cwd) || s.project;
    s.updatedAt = Date.now();
    return s;
  }

  _purge() {
    const cutoff = Date.now() - 8 * 60 * 60 * 1000;
    let changed = false;
    for (const [k, s] of this.sessions) {
      if (s.updatedAt < cutoff) {
        this.sessions.delete(k);
        changed = true;
      }
    }
    if (changed) this._change();
  }

  /**
   * Handles one hook event. Resolves with the JSON body to send back to the agent.
   * For PermissionRequest the promise stays pending until decide() is called;
   * promise.approvalId is set so callers can cancel it if the agent hangs up.
   */
  handle(evt, opts = {}) {
    const agent = opts.agent || 'claude';
    const name = String((evt && evt.hook_event_name) || '');
    const s = this._session(evt || {}, agent);

    switch (name) {
      case 'SessionStart':
        s.state = 'idle';
        s.lastAction = 'Session started';
        break;
      case 'UserPromptSubmit':
        s.state = 'working';
        s.lastAction = evt.prompt ? `Thinking about “${clip(evt.prompt, 60)}”` : 'Thinking…';
        break;
      case 'PreToolUse': {
        const d = describeTool(evt.tool_name, evt.tool_input);
        s.state = 'working';
        s.lastAction = `${d.verb} ${d.target}`.trim();
        break;
      }
      case 'PostToolUse':
        if (s.state !== 'waiting') s.state = 'working';
        break;
      case 'Notification':
        s.lastAction = clip(evt.message || 'Needs your attention', 80);
        break;
      case 'Stop':
        s.state = 'done';
        s.lastAction = 'Finished';
        this._change();
        this.emit('finish', { ...s });
        return Promise.resolve({});
      case 'SessionEnd':
        this.sessions.delete(s.id);
        this._change();
        return Promise.resolve({});
      case 'PermissionRequest':
        return this._permission(evt, s);
      default:
        break;
    }
    this._change();
    return Promise.resolve({});
  }

  _permission(evt, s) {
    const d = describeTool(evt.tool_name, evt.tool_input);
    const id = `a${++this.seq}`;
    const pub = {
      id,
      sessionId: s.id,
      project: s.project,
      agent: s.agent,
      tool: String(evt.tool_name || 'Tool'),
      summary: `${d.verb} ${d.target}`.trim(),
      detail: d.detail,
      createdAt: Date.now()
    };
    s.state = 'waiting';
    s.lastAction = `Waiting for you: ${pub.summary}`;
    const promise = new Promise((resolve) => {
      const timer = setTimeout(() => this.decide(id, 'terminal'), APPROVAL_TIMEOUT_MS);
      this.approvals.set(id, { public: pub, resolve, timer, sessionId: s.id });
    });
    promise.approvalId = id;
    this._change();
    this.emit('approval', pub);
    return promise;
  }

  /** decision: 'allow' | 'deny' | 'terminal' (hand back to the agent's own prompt) */
  decide(id, decision) {
    const a = this.approvals.get(id);
    if (!a) return false;
    clearTimeout(a.timer);
    this.approvals.delete(id);
    const s = this.sessions.get(a.sessionId);
    if (s) {
      s.state = 'working';
      s.updatedAt = Date.now();
      s.lastAction = decision === 'allow' ? 'Allowed, continuing' : decision === 'deny' ? 'Denied' : 'Asked in terminal';
    }
    let body = {};
    if (decision === 'allow') {
      body = { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } };
    } else if (decision === 'deny') {
      body = { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'Denied from Nigiri' } } };
    }
    a.resolve(body);
    this._change();
    this.emit('decided', { id, decision });
    return true;
  }
}

/* ---------------- local HTTP server ---------------- */

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function startServer(core, { port, token }) {
  const server = http.createServer((req, res) => {
    const fail = (code, msg) => {
      res.writeHead(code, { 'Content-Type': 'text/plain' });
      res.end(msg);
    };
    let url;
    try {
      url = new URL(req.url, 'http://127.0.0.1');
    } catch {
      return fail(400, 'bad url');
    }
    if (req.method !== 'POST' || url.pathname !== '/hook') return fail(404, 'not found');
    if (req.headers.origin) return fail(403, 'forbidden'); // browsers always send Origin; real hooks never do
    if (!safeEqual(url.searchParams.get('t') || '', token)) return fail(403, 'forbidden');

    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 2 * 1024 * 1024) {
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      let evt;
      try {
        evt = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        return fail(400, 'bad json');
      }
      const promise = core.handle(evt, { agent: url.searchParams.get('agent') || 'claude' });
      res.on('close', () => {
        // the agent hung up (for example the user answered in the terminal)
        if (!res.writableFinished && promise.approvalId) core.decide(promise.approvalId, 'terminal');
      });
      promise.then((body) => {
        if (res.destroyed) return;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body || {}));
      });
    });
  });

  return new Promise((resolve, reject) => {
    let p = port;
    const tryListen = () => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && p < port + 10) {
          p++;
          tryListen();
        } else reject(err);
      });
      server.listen(p, '127.0.0.1', () => {
        server.removeAllListeners('error');
        resolve({ server, port: p });
      });
    };
    tryListen();
  });
}

/* ---------------- Claude Code settings.json installer ---------------- */

const EVENTS = [
  ['SessionStart', false],
  ['UserPromptSubmit', false],
  ['PreToolUse', true],
  ['PostToolUse', true],
  ['PermissionRequest', true],
  ['Notification', false],
  ['Stop', false],
  ['SessionEnd', false]
];

function hookCommand(port, token) {
  // -f: never print an error page into the agent; "|| exit 0": stay silent when Nigiri is not running
  return `curl.exe -sf --connect-timeout 1 -X POST -H "Content-Type: application/json" --data-binary @- "http://127.0.0.1:${port}/hook?${MARKER}&agent=claude&t=${token}" || exit 0`;
}

function isOurs(h) {
  return h && typeof h.command === 'string' && h.command.includes(MARKER);
}

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return {};
  try {
    const j = JSON.parse(text);
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('not an object');
    return j;
  } catch {
    throw new Error('Claude Code settings.json is not valid JSON. Fix it first, then try again. Nothing was changed.');
  }
}

function writeSettings(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.nigiri-tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

function stripOurs(settings) {
  const hooks = settings.hooks;
  if (!hooks || typeof hooks !== 'object') return;
  for (const ev of Object.keys(hooks)) {
    if (!Array.isArray(hooks[ev])) continue;
    hooks[ev] = hooks[ev]
      .map((group) => {
        if (!group || !Array.isArray(group.hooks)) return group;
        return { ...group, hooks: group.hooks.filter((h) => !isOurs(h)) };
      })
      .filter((group) => !group || !Array.isArray(group.hooks) || group.hooks.length > 0);
    if (hooks[ev].length === 0) delete hooks[ev];
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
}

function installHooks({ file, port, token }) {
  const settings = readSettings(file);
  if (fs.existsSync(file)) {
    const backup = file + '.nigiri-backup';
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
  }
  stripOurs(settings);
  settings.hooks = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {};
  const cmd = hookCommand(port, token);
  for (const [ev, tool] of EVENTS) {
    const entry = { hooks: [{ type: 'command', command: cmd, timeout: ev === 'PermissionRequest' ? 600 : 10 }] };
    if (tool) entry.matcher = '*';
    if (!Array.isArray(settings.hooks[ev])) settings.hooks[ev] = [];
    settings.hooks[ev].push(entry);
  }
  writeSettings(file, settings);
}

function uninstallHooks({ file }) {
  if (!fs.existsSync(file)) return;
  const settings = readSettings(file);
  stripOurs(settings);
  writeSettings(file, settings);
}

function hookStatus({ file, port, token }) {
  let settings;
  try {
    settings = readSettings(file);
  } catch (e) {
    return { state: 'error', message: e.message, file };
  }
  const present = EVENTS.filter(([ev]) => {
    const groups = settings.hooks && settings.hooks[ev];
    return Array.isArray(groups) && groups.some((g) => g && Array.isArray(g.hooks) && g.hooks.some(isOurs));
  }).length;
  if (present === 0) return { state: 'missing', file };
  let current = false;
  const want = hookCommand(port, token);
  const groups = (settings.hooks && settings.hooks.PermissionRequest) || [];
  current = groups.some((g) => g && Array.isArray(g.hooks) && g.hooks.some((h) => h.command === want));
  if (present < EVENTS.length) return { state: 'partial', file };
  return { state: current ? 'installed' : 'outdated', file };
}

module.exports = { HookCore, startServer, installHooks, uninstallHooks, hookStatus, hookCommand, describeTool, EVENTS };
