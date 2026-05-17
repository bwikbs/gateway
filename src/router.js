import express from 'express';
import {
  createSession,
  listSessions,
  getSession,
  deleteSession,
  getMessages,
  addMessage
} from './db.js';
import { classify } from './intent.js';
import { getHandler } from './handlers/index.js';
import { fetchJson } from './util/http.js';

const MAX_MESSAGE_LEN = 4000;

function errorBody(code, message) {
  return { error: { code, message } };
}

export function makeRouter(db) {
  const router = express.Router();

  const ctx = {
    db,
    fetchJson,
    log: (...args) => console.log('[handler]', ...args)
  };

  router.get('/sessions', (req, res) => {
    res.json(listSessions(db));
  });

  router.post('/sessions', (req, res) => {
    const session = createSession(db);
    res.status(201).json(session);
  });

  router.get('/sessions/:id/messages', (req, res) => {
    const id = req.params.id;
    const session = getSession(db, id);
    if (!session) {
      return res.status(404).json(errorBody('NOT_FOUND', 'Session not found'));
    }
    res.json(getMessages(db, id));
  });

  router.delete('/sessions/:id', (req, res) => {
    const ok = deleteSession(db, req.params.id);
    if (!ok) {
      return res.status(404).json(errorBody('NOT_FOUND', 'Session not found'));
    }
    res.status(204).end();
  });

  router.post('/chat', async (req, res, next) => {
    try {
      const body = req.body || {};
      const message = typeof body.message === 'string' ? body.message : '';
      const trimmed = message.trim();

      if (!trimmed) {
        return res
          .status(400)
          .json(errorBody('EMPTY_MESSAGE', 'Message must be a non-empty string'));
      }
      if (message.length > MAX_MESSAGE_LEN) {
        return res
          .status(400)
          .json(errorBody('TOO_LONG', `Message exceeds ${MAX_MESSAGE_LEN} characters`));
      }

      let sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
      let session = sessionId ? getSession(db, sessionId) : null;
      if (!session) {
        session = createSession(db);
        sessionId = session.id;
      }

      const userMessage = addMessage(db, {
        sessionId,
        role: 'user',
        content: message,
        meta: null
      });

      const { intent, payload } = classify(message);
      const handler = getHandler(intent);
      let result;
      try {
        result = await handler.handle(payload, ctx);
      } catch (err) {
        console.error('Handler error:', err);
        result = {
          content: '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
          meta: { error: true, code: 'HANDLER_ERROR', intent }
        };
      }

      const assistantMessage = addMessage(db, {
        sessionId,
        role: 'assistant',
        content: result.content,
        meta: { intent, ...(result.meta || {}) }
      });

      res.json({ sessionId, userMessage, assistantMessage });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
