import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';

function ndjsonResponse(chunks: string[], init?: ResponseInit): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, init);
}

describe('useComponentGenerator 스트리밍', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delta 이벤트를 streamingCode에 누적하고 done에서 컴포넌트를 추가한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ndjsonResponse([
        '{"type":"delta","text":"const A"}\n',
        '{"type":"delta","text":" = 1;"}\n{"type":"done","code":"const A = 1;\\nrender(<A />);"}\n',
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useComponentGenerator());
    await act(() => result.current.generate('버튼', undefined, 'google'));

    expect(fetchMock.mock.calls[0][0]).toBe('/api/generate/stream');
    expect(result.current.components).toHaveLength(1);
    expect(result.current.components[0].code).toBe('const A = 1;\nrender(<A />);');
    expect(result.current.streamingCode).toBe('');
    expect(result.current.isLoading).toBe(false);
  });

  it('스트리밍 도중에는 누적된 코드를 streamingCode로 노출한다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode('{"type":"delta","text":"const B"}\n'));
        await gate;
        controller.enqueue(encoder.encode('{"type":"done","code":"const B"}\n'));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));

    const { result } = renderHook(() => useComponentGenerator());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.generate('버튼', undefined, 'google');
    });

    await waitFor(() => expect(result.current.streamingCode).toBe('const B'));
    expect(result.current.isLoading).toBe(true);

    release();
    await act(() => pending);
  });

  it('error 이벤트가 오면 error를 설정하고 컴포넌트는 추가하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(ndjsonResponse(['{"type":"error","error":"잘렸습니다"}\n'])),
    );

    const { result } = renderHook(() => useComponentGenerator());
    await act(() => result.current.generate('버튼', undefined, 'google'));

    expect(result.current.error).toBe('잘렸습니다');
    expect(result.current.components).toHaveLength(0);
    expect(result.current.streamingCode).toBe('');
  });

  it('HTTP 오류 응답이면 JSON의 error 메시지를 설정한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'API key is required' }), { status: 400 }),
      ),
    );

    const { result } = renderHook(() => useComponentGenerator());
    await act(() => result.current.generate('버튼', undefined, 'google'));

    expect(result.current.error).toBe('API key is required');
    expect(result.current.isLoading).toBe(false);
  });
});
