import { describe, it, expect, vi } from 'vitest';
import { createSseParser, parseAnthropicEvent, parseGoogleEvent, streamText } from './stream';

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const text of iter) out.push(text);
  return out;
}

describe('streamText', () => {
  it('SSE 본문에서 텍스트 델타를 순서대로 내보낸다', async () => {
    const body = sseBody([
      'data: {"candidates":[{"content":{"parts":[{"text":"a"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"b"}]},"finishReason":"STOP"}]}\n\n',
    ]);
    expect(await collect(streamText(body, parseGoogleEvent))).toEqual(['a', 'b']);
  });

  it('소비자가 조기 종료하면 업스트림 읽기를 취소한다', async () => {
    const cancel = vi.fn();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"a"}]}}]}\n\n'),
        );
      },
      cancel,
    });

    const iter = streamText(body, parseGoogleEvent);
    await iter.next();
    await iter.return(undefined);
    await Promise.resolve();

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('업스트림이 조용해도 signal이 abort되면 즉시 업스트림 읽기를 취소한다', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const controller = new AbortController();

    const iter = streamText(body, parseGoogleEvent, controller.signal);
    const pending = iter.next().catch(() => {});
    await Promise.resolve();

    controller.abort();
    await pending;

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('종료 신호 없이 스트림이 끝나면 중단 에러를 던진다', async () => {
    const body = sseBody(['data: {"candidates":[{"content":{"parts":[{"text":"a"}]}}]}\n\n']);
    await expect(collect(streamText(body, parseGoogleEvent))).rejects.toThrow('중간에 끊겼습니다');
  });

  it('이벤트가 error를 담고 있으면 그 메시지로 에러를 던진다', async () => {
    const body = sseBody([
      'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n',
    ]);
    await expect(collect(streamText(body, parseAnthropicEvent))).rejects.toThrow('Overloaded');
  });

  it('텍스트가 하나도 없이 끝나면 빈 응답 에러를 던진다', async () => {
    const body = sseBody(['data: {"type":"message_stop"}\n\n']);
    await expect(collect(streamText(body, parseAnthropicEvent))).rejects.toThrow('빈 응답');
  });

  it('truncated 이벤트가 오면 잘림 에러를 던진다', async () => {
    const body = sseBody([
      'data: {"candidates":[{"content":{"parts":[{"text":"a"}]},"finishReason":"MAX_TOKENS"}]}\n\n',
    ]);
    await expect(collect(streamText(body, parseGoogleEvent))).rejects.toThrow('너무 길어 잘렸습니다');
  });
});

describe('createSseParser', () => {
  it('완결된 data 줄의 페이로드를 반환한다', () => {
    const parse = createSseParser();
    expect(parse('event: x\ndata: {"a":1}\n\n')).toEqual(['{"a":1}']);
  });

  it('청크 경계에 걸친 줄은 다음 청크와 합쳐 처리한다', () => {
    const parse = createSseParser();
    expect(parse('data: {"a"')).toEqual([]);
    expect(parse(':1}\n\ndata: {"b":2}\n')).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('CRLF 줄바꿈도 처리한다', () => {
    const parse = createSseParser();
    expect(parse('data: hi\r\n\r\n')).toEqual(['hi']);
  });
});

describe('parseAnthropicEvent', () => {
  it('text_delta에서 텍스트를 추출한다', () => {
    const payload = JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'const A' },
    });
    expect(parseAnthropicEvent(payload)).toEqual({ text: 'const A', truncated: false });
  });

  it('stop_reason이 max_tokens이면 truncated를 표시한다', () => {
    const payload = JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } });
    expect(parseAnthropicEvent(payload)).toEqual({ text: '', truncated: true });
  });

  it('message_stop이면 finished를 표시한다', () => {
    expect(parseAnthropicEvent('{"type":"message_stop"}')).toEqual({
      text: '',
      truncated: false,
      finished: true,
    });
  });

  it('error 이벤트에서 메시지를 추출한다', () => {
    const payload = JSON.stringify({
      type: 'error',
      error: { type: 'overloaded_error', message: 'Overloaded' },
    });
    expect(parseAnthropicEvent(payload).error).toBe('Overloaded');
  });

  it('관련 없는 이벤트나 깨진 JSON은 빈 결과를 반환한다', () => {
    expect(parseAnthropicEvent('{"type":"ping"}')).toEqual({ text: '', truncated: false });
    expect(parseAnthropicEvent('not json')).toEqual({ text: '', truncated: false });
  });
});

describe('parseGoogleEvent', () => {
  it('candidates의 parts 텍스트를 이어붙여 반환한다', () => {
    const payload = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'foo' }, { text: 'bar' }] } }],
    });
    expect(parseGoogleEvent(payload)).toEqual({ text: 'foobar', truncated: false });
  });

  it('finishReason이 MAX_TOKENS이면 truncated를 표시한다', () => {
    const payload = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'MAX_TOKENS' }],
    });
    expect(parseGoogleEvent(payload)).toEqual({ text: 'x', truncated: true });
  });

  it('finishReason이 STOP이면 finished를 표시한다', () => {
    const payload = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'STOP' }],
    });
    expect(parseGoogleEvent(payload)).toEqual({ text: 'x', truncated: false, finished: true });
  });

  it('SAFETY 같은 비정상 finishReason은 error를 표시한다', () => {
    const payload = JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] });
    expect(parseGoogleEvent(payload).error).toContain('SAFETY');
  });

  it('깨진 JSON은 빈 결과를 반환한다', () => {
    expect(parseGoogleEvent('nope')).toEqual({ text: '', truncated: false });
  });
});
