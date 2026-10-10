'use strict';

const DEFAULT_BASES = {
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta'
};

const SYSTEM_PROMPT =
  'You are Nigiri, a friendly, concise assistant that lives in a small glass island on the desktop. Keep answers short and clear unless asked for detail.';

async function errorFromResponse(res) {
  let text = '';
  try {
    text = await res.text();
  } catch {}
  let msg = text.slice(0, 300);
  try {
    const j = JSON.parse(text);
    msg = (j.error && (j.error.message || j.error)) || j.message || msg;
    if (typeof msg !== 'string') msg = JSON.stringify(msg).slice(0, 300);
  } catch {}
  return new Error(`${res.status} ${msg || res.statusText}`.trim());
}

/** yields the payload of each "data:" line of a server-sent-events body */
async function* sseData(body) {
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of body) {
    buf += typeof chunk === 'string' ? chunk : dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      if (line.startsWith('data:')) {
        const d = line.slice(5).trim();
        if (d && d !== '[DONE]') yield d;
      }
    }
  }
  const tail = buf.trim();
  if (tail.startsWith('data:')) {
    const d = tail.slice(5).trim();
    if (d && d !== '[DONE]') yield d;
  }
}

async function* ndjson(body) {
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of body) {
    buf += typeof chunk === 'string' ? chunk : dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) yield line;
    }
  }
  if (buf.trim()) yield buf.trim();
}

function trimUrl(u) {
  return String(u || '').replace(/\/+$/, '');
}

/**
 * Streams the assistant reply as text pieces.
 * opts: { provider, model, messages:[{role,content}], key, baseUrl, signal, fetchImpl }
 */
async function* streamChat(opts) {
  const { provider, model, messages, key, signal } = opts;
  const f = opts.fetchImpl || fetch;
  if (!model) throw new Error('Pick a model first');

  if (provider === 'anthropic') {
    const base = trimUrl(opts.baseUrl || DEFAULT_BASES.anthropic);
    const res = await f(`${base}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 4096, stream: true, system: SYSTEM_PROMPT, messages }),
      signal
    });
    if (!res.ok) throw await errorFromResponse(res);
    for await (const data of sseData(res.body)) {
      const j = JSON.parse(data);
      if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta') yield j.delta.text;
      else if (j.type === 'error') throw new Error((j.error && j.error.message) || 'Stream error');
    }
    return;
  }

  if (provider === 'openai' || provider === 'lmstudio') {
    const base = provider === 'openai' ? trimUrl(opts.baseUrl || DEFAULT_BASES.openai) : trimUrl(opts.baseUrl) + '/v1';
    const headers = { 'content-type': 'application/json' };
    if (key) headers.authorization = `Bearer ${key}`;
    const res = await f(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages] }),
      signal
    });
    if (!res.ok) throw await errorFromResponse(res);
    for await (const data of sseData(res.body)) {
      const j = JSON.parse(data);
      const t = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
      if (t) yield t;
    }
    return;
  }

  if (provider === 'google') {
    const base = trimUrl(opts.baseUrl || DEFAULT_BASES.google);
    const m = String(model).replace(/^models\//, '');
    const res = await f(`${base}/models/${encodeURIComponent(m)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: messages.map((x) => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: x.content }] }))
      }),
      signal
    });
    if (!res.ok) throw await errorFromResponse(res);
    for await (const data of sseData(res.body)) {
      const j = JSON.parse(data);
      const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
      for (const p of parts) if (p.text) yield p.text;
    }
    return;
  }

  if (provider === 'ollama') {
    const base = trimUrl(opts.baseUrl);
    const res = await f(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages] }),
      signal
    });
    if (!res.ok) throw await errorFromResponse(res);
    for await (const line of ndjson(res.body)) {
      const j = JSON.parse(line);
      if (j.error) throw new Error(j.error);
      if (j.message && j.message.content) yield j.message.content;
    }
    return;
  }

  throw new Error('Unknown provider');
}

const NOT_CHAT = /(embed|whisper|tts|dall-e|moderation|transcribe|realtime|audio|image|davinci|babbage)/i;

async function listModels(opts) {
  const { provider, key, signal } = opts;
  const f = opts.fetchImpl || fetch;
  let ids = [];

  if (provider === 'anthropic') {
    const base = trimUrl(opts.baseUrl || DEFAULT_BASES.anthropic);
    const res = await f(`${base}/models?limit=100`, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, signal });
    if (!res.ok) throw await errorFromResponse(res);
    ids = ((await res.json()).data || []).map((m) => m.id);
  } else if (provider === 'openai') {
    const base = trimUrl(opts.baseUrl || DEFAULT_BASES.openai);
    const res = await f(`${base}/models`, { headers: { authorization: `Bearer ${key}` }, signal });
    if (!res.ok) throw await errorFromResponse(res);
    ids = ((await res.json()).data || []).map((m) => m.id).filter((id) => !NOT_CHAT.test(id));
  } else if (provider === 'google') {
    const base = trimUrl(opts.baseUrl || DEFAULT_BASES.google);
    const res = await f(`${base}/models?pageSize=100`, { headers: { 'x-goog-api-key': key }, signal });
    if (!res.ok) throw await errorFromResponse(res);
    ids = ((await res.json()).models || [])
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => String(m.name).replace(/^models\//, ''))
      .filter((id) => !NOT_CHAT.test(id));
  } else if (provider === 'ollama') {
    const res = await f(`${trimUrl(opts.baseUrl)}/api/tags`, { signal });
    if (!res.ok) throw await errorFromResponse(res);
    ids = ((await res.json()).models || []).map((m) => m.name);
  } else if (provider === 'lmstudio') {
    const res = await f(`${trimUrl(opts.baseUrl)}/v1/models`, { signal });
    if (!res.ok) throw await errorFromResponse(res);
    ids = ((await res.json()).data || []).map((m) => m.id);
  } else {
    throw new Error('Unknown provider');
  }
  return [...new Set(ids)].sort();
}

module.exports = { streamChat, listModels, SYSTEM_PROMPT };
