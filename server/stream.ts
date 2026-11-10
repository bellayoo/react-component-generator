// 프로바이더 스트리밍 응답(SSE)을 해석하는 순수 함수들.
// 부수효과가 없어 단위 테스트가 가능하다.

export interface StreamEvent {
  text: string;
  truncated: boolean;
  /** 프로바이더가 정상 종료 신호를 보냈다. */
  finished?: boolean;
  /** 프로바이더가 스트림 중 보고한 에러 메시지. */
  error?: string;
}

const EMPTY_EVENT: StreamEvent = { text: '', truncated: false };

/** 청크 단위로 SSE 텍스트를 받아 완결된 `data:` 줄의 페이로드를 반환한다. */
export function createSseParser(): (chunk: string) => string[] {
  let buffer = '';

  return (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    return lines
      .map((line) => line.replace(/\r$/, ''))
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());
  };
}

/**
 * SSE 응답 본문을 읽어 텍스트 델타를 순서대로 내보낸다.
 * 잘림·프로바이더 에러·종료 신호 없는 중단·빈 응답은 에러로 던진다.
 * 소비자가 중간에 멈추면 업스트림 읽기를 취소한다.
 */
export async function* streamText(
  body: ReadableStream<Uint8Array>,
  parseEvent: (payload: string) => StreamEvent,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parseSse = createSseParser();
  let finished = false;
  let hasText = false;

  try {
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;

      for (const payload of parseSse(decoder.decode(value, { stream: true }))) {
        const event = parseEvent(payload);
        if (event.error) throw new Error(event.error);
        if (event.text) {
          hasText = true;
          yield event.text;
        }
        if (event.truncated) {
          throw new Error('생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.');
        }
        if (event.finished) finished = true;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (!finished) throw new Error('응답이 중간에 끊겼습니다. 다시 시도해주세요.');
  if (!hasText) throw new Error('빈 응답이 반환되었습니다. 다시 시도해주세요.');
}

function safeParse(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export function parseAnthropicEvent(payload: string): StreamEvent {
  const data = safeParse(payload) as {
    type?: string;
    delta?: { type?: string; text?: string; stop_reason?: string };
    error?: { message?: string };
  } | null;

  if (data?.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
    return { text: data.delta.text ?? '', truncated: false };
  }
  if (data?.type === 'message_delta' && data.delta?.stop_reason === 'max_tokens') {
    return { text: '', truncated: true };
  }
  if (data?.type === 'message_stop') {
    return { text: '', truncated: false, finished: true };
  }
  if (data?.type === 'error') {
    return { text: '', truncated: false, error: data.error?.message ?? 'Claude API error' };
  }
  return EMPTY_EVENT;
}

export function parseGoogleEvent(payload: string): StreamEvent {
  const data = safeParse(payload) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  } | null;

  const candidate = data?.candidates?.[0];
  if (!candidate) return EMPTY_EVENT;

  const reason = candidate.finishReason;

  return {
    text: candidate.content?.parts?.map((part) => part.text ?? '').join('') ?? '',
    truncated: reason === 'MAX_TOKENS',
    ...(reason === 'STOP' && { finished: true }),
    ...(reason && reason !== 'STOP' && reason !== 'MAX_TOKENS' && {
      error: `응답 생성이 중단되었습니다 (${reason}).`,
    }),
  };
}
