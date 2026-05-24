# Gateway

A minimal ChatGPT-style chatbot gateway with rule-based intent routing.

## Stack
- Node.js (>=18) + Express
- better-sqlite3 for persistence
- Vanilla JS frontend (no build step)

## Run
```bash
npm install
npm start
# Server: http://localhost:3003
```

Set `PORT` to override.

## Features
- Sessions and messages persisted in SQLite (`data/gateway.db`).
- Rule-based intent classifier.
- Built-in handlers:
  - English dictionary (dictionaryapi.dev): `hello 뜻`, `define serendipity`, `/en ephemeral`
  - Korean dictionary (ko.wiktionary + ko.wikipedia fallback): `사과 뜻`, `행복의 의미`, `/ko 인공지능`
  - Fallback message for unsupported queries.

## API
- `GET    /api/sessions`
- `POST   /api/sessions`
- `GET    /api/sessions/:id/messages`
- `DELETE /api/sessions/:id`
- `POST   /api/chat`  body `{ sessionId?, message }`
