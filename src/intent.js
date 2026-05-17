// Intent classifier. Each handler contributes its own patterns;
// new handlers can be added without touching this file.
//
// A pattern is an object: { test(text) -> payload object | null }.
// Returning a truthy payload means the pattern matched; the payload
// is forwarded (along with the raw text) to handler.handle().

import { allHandlers } from './handlers/index.js';

export function classify(text) {
  const raw = String(text || '');
  for (const handler of allHandlers()) {
    if (!Array.isArray(handler.patterns)) continue;
    for (const pattern of handler.patterns) {
      const result = pattern.test(raw);
      if (result) {
        // Default text=raw, but allow patterns to override any field (incl. text).
        return { intent: handler.intent, payload: { text: raw, ...result } };
      }
    }
  }
  return { intent: 'fallback', payload: { text: raw } };
}
