const DEFAULT_UA = 'Gateway-Chatbot/0.1 (+local-dev)';

export class FetchError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'FetchError';
    this.code = code;
  }
}

export async function fetchJson(url, { timeoutMs = 5000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: 'application/json,*/*',
        ...headers
      },
      signal: controller.signal
    });
    let body = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    } else {
      // Drain to avoid leaving sockets dangling.
      try {
        await res.text();
      } catch {
        /* ignore */
      }
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new FetchError(`Request timed out after ${timeoutMs}ms: ${url}`, 'TIMEOUT');
    }
    throw new FetchError(
      `Network error fetching ${url}: ${err && err.message ? err.message : String(err)}`,
      'NETWORK_ERROR'
    );
  } finally {
    clearTimeout(timer);
  }
}
