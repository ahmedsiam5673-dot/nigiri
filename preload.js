'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel, cb) => {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('nigiri', {
  settings: { get: () => call('settings:get'), set: (p) => call('settings:set', p) },
  keys: {
    status: () => call('keys:status'),
    set: (provider, key) => call('keys:set', provider, key),
    clear: (provider) => call('keys:clear', provider)
  },
  models: { list: (provider) => call('models:list', provider) },
  chat: {
    send: (req) => call('chat:send', req),
    abort: (id) => call('chat:abort', id),
    onChunk: (cb) => on('chat:chunk', cb),
    onDone: (cb) => on('chat:done', cb),
    onError: (cb) => on('chat:error', cb)
  },
  agents: {
    snapshot: () => call('agents:snapshot'),
    onUpdate: (cb) => on('agents:update', cb),
    decide: (id, decision) => call('agents:decide', id, decision),
    onFinish: (cb) => on('agents:finish', cb)
  },
  hooks: {
    status: () => call('hooks:status'),
    install: () => call('hooks:install'),
    uninstall: () => call('hooks:uninstall')
  },
  island: {
    setInteractive: (v) => ipcRenderer.send('island:interactive', !!v),
    onToggle: (cb) => on('island:toggle', cb),
    onBlur: (cb) => on('island:blur', cb),
    onCursor: (cb) => on('island:cursor', cb),
    onOpenTab: (cb) => on('island:tab', cb)
  },
  app: {
    info: () => call('app:info'),
    copy: (text) => call('app:copy', String(text)),
    setLogin: (v) => call('app:login', !!v),
    quit: () => ipcRenderer.send('app:quit'),
    demo: () => call('demo:start')
  }
});
