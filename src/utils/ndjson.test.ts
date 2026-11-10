import { describe, it, expect } from 'vitest';
import { createNdjsonParser } from './ndjson';

describe('createNdjsonParser', () => {
  it('완결된 줄을 JSON 객체로 파싱한다', () => {
    const parse = createNdjsonParser();
    expect(parse('{"type":"delta","text":"a"}\n{"type":"done"}\n')).toEqual([
      { type: 'delta', text: 'a' },
      { type: 'done' },
    ]);
  });

  it('청크 경계에 걸친 줄은 다음 청크와 합쳐 처리한다', () => {
    const parse = createNdjsonParser();
    expect(parse('{"type":"del')).toEqual([]);
    expect(parse('ta","text":"a"}\n')).toEqual([{ type: 'delta', text: 'a' }]);
  });

  it('빈 줄은 무시한다', () => {
    const parse = createNdjsonParser();
    expect(parse('\n{"a":1}\n\n')).toEqual([{ a: 1 }]);
  });
});
