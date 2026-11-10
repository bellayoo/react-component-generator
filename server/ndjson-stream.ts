import { stripCodeFences, ensureRenderCall } from './generator';

export interface NdjsonStreamOptions {
  headers?: Record<string, string>;
  /** 클라이언트 연결이 끊겨 스트림이 취소될 때 호출한다. */
  onCancel?: () => void;
}

// 텍스트 델타를 NDJSON(delta → done | error)으로 내보낸다. 최종 코드는 서버에서 정규화한다.
export function ndjsonStream(deltas: AsyncGenerator<string>, options: NdjsonStreamOptions = {}): Response {
  const encoder = new TextEncoder();
  let cancelled = false;

  // 클라이언트가 끊긴 뒤의 enqueue/close는 throw하므로 무시한다.
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, message: object) => {
    if (cancelled) return;
    try {
      controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
    } catch {
      cancelled = true;
    }
  };

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = '';
      try {
        for await (const text of deltas) {
          if (cancelled) break;
          full += text;
          send(controller, { type: 'delta', text });
        }
        send(controller, { type: 'done', code: ensureRenderCall(stripCodeFences(full)) });
      } catch (err) {
        send(controller, { type: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
      } finally {
        try {
          controller.close();
        } catch {
          // 이미 닫힌 스트림
        }
      }
    },
    // 업스트림 중단은 onCancel(AbortController)이 맡는다. 대기 중인 read()는 generator.return()으로 풀리지 않는다.
    cancel() {
      cancelled = true;
      options.onCancel?.();
      void deltas.return(undefined);
    },
  });

  return new Response(body, {
    headers: { ...options.headers, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
  });
}
