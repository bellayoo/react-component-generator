import { describe, it, expect } from 'vitest';
import { validatePromptLength, MAX_PROMPT_LENGTH } from './validatePrompt';

describe('validatePromptLength', () => {
  it('최대 길이는 500자다', () => {
    expect(MAX_PROMPT_LENGTH).toBe(500);
  });

  it('500자 이하면 유효하다', () => {
    expect(validatePromptLength('a'.repeat(500))).toEqual({ valid: true, length: 500 });
  });

  it('501자부터는 유효하지 않다', () => {
    expect(validatePromptLength('a'.repeat(501))).toEqual({ valid: false, length: 501 });
  });

  it('앞뒤 공백은 길이에 포함하지 않는다', () => {
    expect(validatePromptLength(`  ${'a'.repeat(500)}  `)).toEqual({ valid: true, length: 500 });
  });
});
