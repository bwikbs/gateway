const MESSAGE = [
  '죄송합니다, 아직 지원되지 않는 질의입니다.',
  '',
  '다음과 같이 입력해 보세요:',
  '  • 영어/국어 사전: hello, serendipity, 사과, 행복',
  '  • KBO 야구 결과: "오늘 야구", "어제 야구", "야구 결과"'
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
