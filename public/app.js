// Vanilla JS chat client for Gateway.

const $ = (sel) => document.querySelector(sel);
const sessionListEl = $('#session-list');
const messagesEl = $('#messages');
const chatHeaderEl = $('#chat-header');
const newChatBtn = $('#new-chat');
const composer = $('#composer');
const input = $('#input');
const sendBtn = $('#send');
const toggleSidebarBtn = $('#toggle-sidebar-btn');
const sidebarEl = $('.sidebar');
const sidebarOverlayEl = $('#sidebar-overlay');

let state = {
  sessions: [],
  currentSessionId: null,
  activeTab: 'koen'
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
    li.dataset.id = s.id;
    if (s.id === state.currentSessionId) li.classList.add('active');
    
    li.addEventListener('click', (e) => {
      if (e.target.closest('.delete-session-btn')) return;
      selectSession(s.id);
    });

    const span = document.createElement('span');
    span.className = 'session-title';
    span.textContent = s.title || 'New chat';
    span.title = s.title || 'New chat';
    li.appendChild(span);

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-session-btn';
    delBtn.title = '대화 삭제';
    delBtn.innerHTML = '✕';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('이 대화를 삭제하시겠습니까?')) {
        try {
          await api(`/api/sessions/${s.id}`, { method: 'DELETE' });
          if (state.currentSessionId === s.id) {
            state.currentSessionId = null;
            chatHeaderEl.textContent = 'New chat';
            messagesEl.innerHTML = '';
          }
          await loadSessions();
        } catch (err) {
          alert('삭제 실패: ' + err.message);
        }
      }
    });
    li.appendChild(delBtn);

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
  const url = state.activeTab === 'history' ? '/api/sessions' : `/api/sessions?mode=${state.activeTab}`;
  state.sessions = await api(url);
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
  const mode = state.activeTab === 'history' ? 'general' : state.activeTab;
  const s = await api('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ mode })
  });
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

  let modeToSend = state.activeTab;
  if (state.activeTab === 'history') {
    const curSession = state.sessions.find(s => s.id === state.currentSessionId);
    modeToSend = curSession ? curSession.mode : 'general';
  }

  try {
    const resp = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.currentSessionId,
        message: text,
        mode: modeToSend
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

function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const tab = btn.dataset.tab;
      state.activeTab = tab;
      
      if (tab === 'history') {
        newChatBtn.style.display = 'none';
      } else {
        newChatBtn.style.display = 'block';
        let tabName = '';
        if (tab === 'koen') tabName = '한영사전';
        else if (tab === 'enko') tabName = '영한사전';
        else if (tab === 'ko') tabName = '국어사전';
        newChatBtn.textContent = `+ 새 ${tabName} 검색`;
      }
      
      await loadSessions();
      
      if (state.sessions.length > 0) {
        await selectSession(state.sessions[0].id);
      } else {
        state.currentSessionId = null;
        chatHeaderEl.textContent = 'New chat';
        messagesEl.innerHTML = '';
      }
    });
  });
}

function setupSidebar() {
  const stored = localStorage.getItem('sidebar-collapsed');
  let isCollapsed = stored === 'true';
  if (stored === null && window.innerWidth <= 768) {
    isCollapsed = true;
  }
  if (isCollapsed) {
    sidebarEl.classList.add('collapsed');
  }

  function updateOverlay(collapsed) {
    if (window.innerWidth <= 768 && !collapsed) {
      sidebarOverlayEl.classList.add('active');
    } else {
      sidebarOverlayEl.classList.remove('active');
    }
  }

  updateOverlay(isCollapsed);

  toggleSidebarBtn.addEventListener('click', () => {
    const collapsed = sidebarEl.classList.toggle('collapsed');
    localStorage.setItem('sidebar-collapsed', collapsed);
    updateOverlay(collapsed);
  });

  sidebarOverlayEl.addEventListener('click', () => {
    sidebarEl.classList.add('collapsed');
    localStorage.setItem('sidebar-collapsed', 'true');
    updateOverlay(true);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      sidebarOverlayEl.classList.remove('active');
    } else {
      const collapsed = sidebarEl.classList.contains('collapsed');
      updateOverlay(collapsed);
    }
  });
}

async function init() {
  setupSidebar();
  setupTabs();
  newChatBtn.textContent = '+ 새 한영사전 검색';
  
  await loadSessions();
  if (state.sessions.length > 0) {
    await selectSession(state.sessions[0].id);
  } else {
    chatHeaderEl.textContent = 'New chat';
  }
}

init().catch((err) => console.error('init failed', err));
