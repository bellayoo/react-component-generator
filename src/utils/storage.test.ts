import { describe, it, expect } from 'vitest';
import { parseStoredComponents, addToHistory, MAX_HISTORY } from './storage';

const stored = {
  id: 'a',
  prompt: 'p',
  code: 'c',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('parseStoredComponents', () => {
  it('createdAt 문자열을 Date로 복원한다', () => {
    const [component] = parseStoredComponents([stored]);
    expect(component.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('배열이 아니면 빈 배열을 반환한다', () => {
    expect(parseStoredComponents({ not: 'array' })).toEqual([]);
  });

  it('필드가 빠진 항목은 걸러낸다', () => {
    const result = parseStoredComponents([stored, { id: 'b', prompt: 'p' }, null]);
    expect(result.map((c) => c.id)).toEqual(['a']);
  });

  it('createdAt이 유효한 날짜가 아닌 항목은 걸러낸다', () => {
    expect(parseStoredComponents([{ ...stored, createdAt: 'nope' }])).toEqual([]);
  });
});

describe('addToHistory', () => {
  it('새 프롬프트를 맨 앞에 추가한다', () => {
    expect(addToHistory(['old'], 'new')).toEqual(['new', 'old']);
  });

  it('이미 있는 프롬프트는 중복 없이 맨 앞으로 옮긴다', () => {
    expect(addToHistory(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });

  it(`최대 ${MAX_HISTORY}개까지만 유지한다`, () => {
    const full = Array.from({ length: MAX_HISTORY }, (_, i) => `p${i}`);
    const result = addToHistory(full, 'new');
    expect(result).toHaveLength(MAX_HISTORY);
    expect(result[0]).toBe('new');
    expect(result).not.toContain(`p${MAX_HISTORY - 1}`);
  });
});
