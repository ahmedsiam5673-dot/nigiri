'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROVIDERS = ['anthropic', 'openai', 'google', 'ollama', 'lmstudio'];

const DEFAULTS = {
  sound: true,
  volume: 0.6,
  hoverOpen: false,
  autoOpenApprovals: true,
  provider: 'anthropic',
  models: { anthropic: '', openai: '', google: '', ollama: '', lmstudio: '' },
  urls: { ollama: 'http://localhost:11434', lmstudio: 'http://localhost:1234' },
  port: 47821,
  token: ''
};

function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

class Store {
  /** cipher: { available(): boolean, encrypt(str): Buffer, decrypt(buf): string } */
  constructor(dir, cipher) {
    this.dir = dir;
    this.cipher = cipher;
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'settings.json');
    this.keyFile = path.join(dir, 'keys.json');
    const saved = readJson(this.file, {});
    this.data = {
      ...DEFAULTS,
      ...saved,
      models: { ...DEFAULTS.models, ...(saved.models || {}) },
      urls: { ...DEFAULTS.urls, ...(saved.urls || {}) }
    };
    if (!this.data.token) {
      this.data.token = crypto.randomBytes(16).toString('hex');
      this._save();
    }
  }

  _save() {
    writeAtomic(this.file, JSON.stringify(this.data, null, 2));
  }

  /** settings without the hook token */
  get() {
    const { token, ...rest } = this.data;
    return rest;
  }

  set(patch) {
    const p = patch || {};
    const d = this.data;
    if (typeof p.sound === 'boolean') d.sound = p.sound;
    if (typeof p.hoverOpen === 'boolean') d.hoverOpen = p.hoverOpen;
    if (typeof p.autoOpenApprovals === 'boolean') d.autoOpenApprovals = p.autoOpenApprovals;
    if (typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1) d.volume = p.volume;
    if (PROVIDERS.includes(p.provider)) d.provider = p.provider;
    if (typeof p.port === 'number') d.port = p.port;
    if (p.models && typeof p.models === 'object') {
      for (const k of PROVIDERS) if (typeof p.models[k] === 'string') d.models[k] = p.models[k].slice(0, 200);
    }
    if (p.urls && typeof p.urls === 'object') {
      for (const k of ['ollama', 'lmstudio']) {
        if (typeof p.urls[k] === 'string' && /^https?:\/\/[^\s]+$/.test(p.urls[k])) d.urls[k] = p.urls[k].replace(/\/+$/, '');
      }
    }
    this._save();
    return this.get();
  }

  get token() {
    return this.data.token;
  }

  _keys() {
    return readJson(this.keyFile, {});
  }

  keyStatus() {
    const k = this._keys();
    return Object.fromEntries(PROVIDERS.map((p) => [p, !!k[p]]));
  }

  setKey(provider, key) {
    if (!PROVIDERS.includes(provider)) throw new Error('Unknown provider');
    const clean = String(key || '').trim();
    if (!clean) throw new Error('The key is empty');
    if (!this.cipher || !this.cipher.available()) throw new Error('Secure storage is not available on this system, so the key was not saved');
    const k = this._keys();
    k[provider] = this.cipher.encrypt(clean).toString('base64');
    writeAtomic(this.keyFile, JSON.stringify(k));
  }

  getKey(provider) {
    const k = this._keys();
    if (!k[provider] || !this.cipher || !this.cipher.available()) return '';
    try {
      return this.cipher.decrypt(Buffer.from(k[provider], 'base64'));
    } catch {
      return '';
    }
  }

  clearKey(provider) {
    const k = this._keys();
    delete k[provider];
    writeAtomic(this.keyFile, JSON.stringify(k));
  }
}

module.exports = { Store, PROVIDERS };
