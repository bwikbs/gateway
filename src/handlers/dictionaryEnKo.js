const MAX_ENTRIES = 3;
const MAX_POS_GROUPS = 2;
const MAX_MEANS_PER_POS = 5;
const NOT_FOUND_MSG = (word) => `해당 영어 단어를 찾을 수 없습니다: ${word}`;
const NETWORK_MSG = '사전 서버 응답이 없습니다. 잠시 후 다시 시도해 주세요.';

const STOPWORDS = new Set([
  'define', 'definition', 'meaning', 'mean', 'means',
  'what', 'is', 'are', 'the', 'a', 'an', 'of', 'to',
  'do', 'does', 'you', 'me', 'my', 'please', 'tell',
  'know', 'about', 'dictionary',
  'en', 'ko'
]);

const patterns = [
  {
    test: (t) => {
      const tokens = t.match(/[a-zA-Z][a-zA-Z\-']{1,30}/g) || [];
      for (const tok of tokens) {
        if (!STOPWORDS.has(tok.toLowerCase())) {
          return { word: tok };
        }
      }
      return null;
    }
  }
];

function cleanHtml(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function formatPhonetics(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  const parts = [];
  for (const p of list) {
    if (!p || !p.symbolValue) continue;
    const type = p.symbolType ? p.symbolType : '';
    const val = `/${p.symbolValue}/`;
    parts.push(type ? `${type} ${val}` : val);
  }
  return parts.join('  ');
}

function formatSynonyms(expSynonym) {
  if (typeof expSynonym !== 'string' || !expSynonym.trim()) return '';
  const items = expSynonym
    .split('|')
    .map((s) => cleanHtml(s.split('^')[0]))
    .filter(Boolean);
  return items.join(', ');
}

function formatMeansCollector(meansCollector) {
  if (!Array.isArray(meansCollector) || meansCollector.length === 0) return '';
  const groups = meansCollector.slice(0, MAX_POS_GROUPS);
  const sections = [];
  for (const group of groups) {
    const pos = group.partOfSpeech || '';
    const lines = pos ? [`[${pos}]`] : ['[]'];
    const means = Array.isArray(group.means) ? group.means.slice(0, MAX_MEANS_PER_POS) : [];
    means.forEach((m, idx) => {
      const rawOrder = m.order;
      const order = (rawOrder == null || rawOrder === '' || rawOrder === 0) ? idx + 1 : rawOrder;
      const val = cleanHtml(m.value || '');
      lines.push(`${order}. ${val}`);
      const ori = cleanHtml(m.exampleOri || '');
      const trans = cleanHtml(m.exampleTrans || '');
      if (ori) lines.push(`   예: "${ori}"`);
      if (trans) lines.push(`        → ${trans}`);
    });
    sections.push(lines.join('\n'));
  }
  return sections.join('\n\n');
}

function formatEntry(item) {
  const headword = cleanHtml(item.expEntry || '');
  const phon = formatPhonetics(item.searchPhoneticSymbolList);
  const header = phon ? `${headword}  ${phon}` : headword;
  const meanings = formatMeansCollector(item.meansCollector);
  const syn = formatSynonyms(item.expSynonym);
  const source = item.sourceDictnameKO ? `— 출처: ${item.sourceDictnameKO}` : '';

  const parts = [header];
  if (meanings) parts.push(meanings);
  if (syn) parts.push(`동의어: ${syn}`);
  if (source) parts.push(source);
  return parts.filter(Boolean).join('\n\n');
}

function formatResponse(items) {
  const entries = items.slice(0, MAX_ENTRIES).map(formatEntry);
  return entries.join('\n\n─────\n\n');
}

export default {
  name: 'dictionaryEnKo',
  intent: 'dictionary.enko',
  patterns,
  async handle(payload, ctx) {
    const word = String(payload?.word || '').trim();
    if (!word) {
      return {
        content: NOT_FOUND_MSG(word),
        meta: { word, source: 'naver.enko', found: false }
      };
    }
    const url = `https://en.dict.naver.com/api3/enko/search?query=${encodeURIComponent(word)}&range=word`;
    try {
      const res = await ctx.fetchJson(url, {
        timeoutMs: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Referer: 'https://en.dict.naver.com/'
        }
      });
      const items =
        res?.body?.searchResultMap?.searchResultListMap?.WORD?.items;
      if (!res.ok || !Array.isArray(items) || items.length === 0) {
        return {
          content: NOT_FOUND_MSG(word),
          meta: { word, source: 'naver.enko', found: false }
        };
      }
      const content = formatResponse(items);
      return {
        content,
        meta: { word, source: 'naver.enko', found: true, entryCount: Math.min(items.length, MAX_ENTRIES) }
      };
    } catch (err) {
      ctx.log?.('dictionaryEnKo fetch error', err?.code, err?.message);
      return {
        content: NETWORK_MSG,
        meta: { word, error: true, code: err?.code || 'NETWORK_ERROR' }
      };
    }
  }
};
