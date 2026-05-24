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
    const mode = typeof req.query.mode === 'string' ? req.query.mode : null;
    res.json(listSessions(db, mode));
  });

  router.post('/sessions', (req, res) => {
    const mode = typeof req.body.mode === 'string' ? req.body.mode : 'general';
    const session = createSession(db, mode);
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

      let mode = typeof body.mode === 'string' ? body.mode : null;
      let sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
      let session = sessionId ? getSession(db, sessionId) : null;
      if (!session) {
        session = createSession(db, mode || 'general');
        sessionId = session.id;
      }

      const userMessage = addMessage(db, {
        sessionId,
        role: 'user',
        content: message,
        meta: null
      });

      let intent, payload;
      if (mode && ['koen', 'enko', 'ko'].includes(mode)) {
        intent = `dictionary.${mode}`;
        payload = { text: message, word: message.trim() };
      } else {
        const classified = classify(message);
        intent = classified.intent;
        payload = classified.payload;
      }
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
