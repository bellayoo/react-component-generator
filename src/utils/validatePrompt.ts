export const MAX_PROMPT_LENGTH = 500;

/** 프롬프트 길이를 검증한다. 제출 시 trim하므로 길이도 trim 기준으로 센다. */
export function validatePromptLength(prompt: string): { valid: boolean; length: number } {
  const length = prompt.trim().length;
  return { valid: length <= MAX_PROMPT_LENGTH, length };
}
