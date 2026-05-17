import en from './dictionaryEn.js';
import ko from './dictionaryKo.js';
import fallback from './fallback.js';

const handlers = new Map();

export function register(h) {
  handlers.set(h.intent, h);
}

export function getHandler(intent) {
  return handlers.get(intent) ?? handlers.get('fallback');
}

export function allHandlers() {
  return handlers.values();
}

register(en);
register(ko);
register(fallback);
