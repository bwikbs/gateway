const MESSAGE = [
  '죄송합니다, 아직 지원되지 않는 질의입니다.',
  '',
  '영어 또는 한국어 단어를 입력해 주세요.',
  '  예: hello, serendipity, 사과, 행복'
].join('\n');

export default {
  name: 'fallback',
  intent: 'fallback',
  async handle(payload /*, ctx */) {
    return {
      content: MESSAGE,
      meta: { intent: 'fallback', text: payload?.text ?? '' }
    };
  }
};
