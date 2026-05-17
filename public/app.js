// Vanilla JS chat client for Gateway.

const $ = (sel) => document.querySelector(sel);
const sessionListEl = $('#session-list');
const messagesEl = $('#messages');
const chatHeaderEl = $('#chat-header');
const newChatBtn = $('#new-chat');
const composer = $('#composer');
const input = $('#input');
const sendBtn = $('#send');

let state = {
  sessions: [],
  currentSessionId: null
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function scrollMessagesToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = body?.error?.message || res.statusText || 'Request failed';
    const err = new Error(msg);
    err.body = body;
    err.status = res.status;
    throw err;
  }
  return body;
}

function renderSessions() {
  sessionListEl.innerHTML = '';
  for (const s of state.sessions) {
    const li = document.createElement('li');
    li.textContent = s.title || 'New chat';
    li.title = s.title || 'New chat';
    li.dataset.id = s.id;
    if (s.id === state.currentSessionId) li.classList.add('active');
    li.addEventListener('click', () => {
      selectSession(s.id);
    });
    sessionListEl.appendChild(li);
  }
}

function renderMessages(messages) {
  messagesEl.innerHTML = '';
  for (const m of messages) {
    appendMessage(m);
  }
  scrollMessagesToBottom();
}

function appendMessage(m) {
  const div = document.createElement('div');
  div.className = `message ${m.role}`;
  div.innerHTML = escapeHtml(m.content);
  messagesEl.appendChild(div);
  scrollMessagesToBottom();
  return div;
}

async function loadSessions() {
  state.sessions = await api('/api/sessions');
  renderSessions();
}

async function selectSession(id) {
  state.currentSessionId = id;
  const s = state.sessions.find((x) => x.id === id);
  chatHeaderEl.textContent = s?.title || 'New chat';
  renderSessions();
  try {
    const msgs = await api(`/api/sessions/${id}/messages`);
    renderMessages(msgs || []);
  } catch (err) {
    console.error(err);
    renderMessages([]);
  }
}

async function createNewSession() {
  const s = await api('/api/sessions', { method: 'POST' });
  state.sessions.unshift(s);
  state.currentSessionId = s.id;
  renderSessions();
  chatHeaderEl.textContent = s.title || 'New chat';
  messagesEl.innerHTML = '';
  input.focus();
}

async function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  // Optimistic user bubble.
  const optimistic = appendMessage({ role: 'user', content: text });
  sendBtn.disabled = true;
  input.disabled = true;

  try {
    const resp = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.currentSessionId,
        message: text
      })
    });

    // Replace optimistic bubble with server-confirmed user message.
    if (optimistic && resp.userMessage) {
      optimistic.innerHTML = escapeHtml(resp.userMessage.content);
    }

    if (resp.assistantMessage) {
      appendMessage(resp.assistantMessage);
    }

    // If this was a new session, update state.
    if (state.currentSessionId !== resp.sessionId) {
      state.currentSessionId = resp.sessionId;
    }

    // Refresh sessions list to update title/order.
    await loadSessions();
    // Mark active.
    renderSessions();
    const cur = state.sessions.find((s) => s.id === state.currentSessionId);
    chatHeaderEl.textContent = cur?.title || 'New chat';
  } catch (err) {
    console.error(err);
    appendMessage({
      role: 'assistant',
      content: `오류: ${err.message || '요청이 실패했습니다.'}`
    });
  } finally {
    sendBtn.disabled = false;
    input.disabled = false;
    input.value = '';
    input.focus();
  }
}

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value;
  if (!text.trim()) return;
  sendMessage(text);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

newChatBtn.addEventListener('click', () => {
  createNewSession().catch((err) => console.error(err));
});

async function init() {
  await loadSessions();
  if (state.sessions.length > 0) {
    await selectSession(state.sessions[0].id);
  } else {
    chatHeaderEl.textContent = 'New chat';
  }
}

init().catch((err) => console.error('init failed', err));
