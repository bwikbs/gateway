const TEAMS = [
  '두산', '베어스',
  'LG', '트윈스',
  'KIA', '타이거즈',
  '키움', '히어로즈',
  'NC', '다이노스',
  '한화', '이글스',
  '삼성', '라이온즈',
  '롯데', '자이언츠',
  'SSG', '랜더스',
  'KT', '위즈'
];
const TEAM_REGEX = new RegExp(TEAMS.join('|'));
const BASEBALL_KEYWORDS = /(야구|프로야구|KBO)/i;
const DICTIONARY_SIGNALS = /(뜻|의미|정의|meaning|define|definition)/i;
const NETWORK_MSG = '경기 정보를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.';

const patterns = [
  {
    test: (t) => {
      if (DICTIONARY_SIGNALS.test(t)) return null;
      if (BASEBALL_KEYWORDS.test(t) || TEAM_REGEX.test(t)) return {};
      return null;
    }
  }
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function resolveDate(text, now = new Date()) {
  if (/내일/.test(text)) return { date: ymd(addDays(now, 1)), label: '내일' };
  if (/(그저께|그제)/.test(text)) return { date: ymd(addDays(now, -2)), label: '그저께' };
  if (/어제/.test(text)) return { date: ymd(addDays(now, -1)), label: '어제' };

  let m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { date: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, label: null };

  m = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (m) return { date: `${now.getFullYear()}-${pad(m[1])}-${pad(m[2])}`, label: null };

  m = text.match(/(\d{1,2})\/(\d{1,2})/);
  if (m) return { date: `${now.getFullYear()}-${pad(m[1])}-${pad(m[2])}`, label: null };

  return { date: ymd(now), label: '오늘' };
}

function formatTime(iso) {
  const m = iso && iso.match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '';
}

function formatGameLine(g) {
  const time = formatTime(g.gameDateTime);
  const away = g.awayTeamName || g.awayTeamCode || '?';
  const home = g.homeTeamName || g.homeTeamCode || '?';
  const status = g.statusCode;
  const info = g.statusInfo || '';

  if (status === 'BEFORE') {
    return `${time}  ${away} vs ${home}  (${info || '경기전'})`;
  }
  if (status === 'CANCEL') {
    return `${time}  ${away} vs ${home}  (취소)`;
  }
  // RESULT / LIVE / PROGRESS — show score
  const a = g.awayTeamScore ?? 0;
  const h = g.homeTeamScore ?? 0;
  let mark = '';
  if (status === 'RESULT') {
    if (g.winner === 'AWAY') mark = `   승: ${away}`;
    else if (g.winner === 'HOME') mark = `   승: ${home}`;
    else mark = '   무승부';
  }
  const tag = info ? `(${info})` : '';
  return `${away} ${a} — ${h} ${home}  ${tag}${mark}`.trim();
}

function formatResponse({ date, label, games }) {
  const dateHeader = label ? `KBO ${date} (${label})` : `KBO ${date}`;
  if (games.length === 0) {
    return `${dateHeader}\n\n해당 날짜에 KBO 경기가 없습니다.\n\n— 출처: 네이버 스포츠`;
  }
  const allBefore = games.every((g) => g.statusCode === 'BEFORE');
  const heading = allBefore ? `⚾ 경기 일정 (${games.length}경기)` : `⚾ 경기 결과 (${games.length}경기)`;
  const lines = games.map(formatGameLine);
  return `${dateHeader}\n\n${heading}\n\n${lines.join('\n')}\n\n— 출처: 네이버 스포츠`;
}

export default {
  name: 'kboBaseball',
  intent: 'baseball.kbo',
  patterns,
  async handle(payload, ctx) {
    const text = String(payload?.text || '');
    const { date, label } = resolveDate(text);
    const url =
      'https://api-gw.sports.naver.com/schedule/games' +
      '?fields=basic,baseballHome,baseballAway' +
      '&upperCategoryId=kbaseball' +
      `&fromDate=${date}&toDate=${date}&size=30`;
    try {
      const res = await ctx.fetchJson(url, {
        timeoutMs: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Referer: 'https://m.sports.naver.com/'
        }
      });
      const list = res?.body?.result?.games;
      if (!res.ok || !Array.isArray(list)) {
        return {
          content: NETWORK_MSG,
          meta: { date, source: 'naver.sports', error: true }
        };
      }
      const games = list.filter((g) => g.categoryId === 'kbo');
      const content = formatResponse({ date, label, games });
      return {
        content,
        meta: { date, label, source: 'naver.sports', count: games.length }
      };
    } catch (err) {
      ctx.log?.('kboBaseball fetch error', err?.code, err?.message);
      return {
        content: NETWORK_MSG,
        meta: { date, error: true, code: err?.code || 'NETWORK_ERROR' }
      };
    }
  }
};
