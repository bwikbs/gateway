import kbo from './kboBaseball.js';
import koen from './dictionaryKoEn.js';
import enko from './dictionaryEnKo.js';
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

register(kbo);
register(koen);
register(enko);
register(ko);
register(fallback);
