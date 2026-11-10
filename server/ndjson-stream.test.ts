import { describe, it, expect, vi } from 'vitest';
import { ndjsonStream } from './ndjson-stream';

async function* fromArray(items: string[]): AsyncGenerator<string> {
  for (const item of items) yield item;
}

async function* failing(items: string[], message: string): AsyncGenerator<string> {
  for (const item of items) yield item;
  throw new Error(message);
}

async function readMessages(res: Response): Promise<unknown[]> {
  const text = await res.text();
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('ndjsonStream', () => {
  it('델타를 delta 메시지로, 끝에 done 메시지를 내보낸다', async () => {
    const res = ndjsonStream(fromArray(['const A', ' = 1;']));
    expect(await readMessages(res)).toEqual([
      { type: 'delta', text: 'const A' },
      { type: 'delta', text: ' = 1;' },
      { type: 'done', code: 'const A = 1;' },
    ]);
  });

  it('done의 코드는 코드펜스 제거와 render 호출 주입을 거친다', async () => {
    const res = ndjsonStream(fromArray(['```jsx\n', 'const Card = () => null;\n', '```']));
    const messages = (await readMessages(res)) as Array<{ type: string; code?: string }>;
    const done = messages.at(-1);
    expect(done?.type).toBe('done');
    expect(done?.code).toBe('const Card = () => null;\n\nrender(<Card />);');
  });

  it('생성 중 에러가 나면 error 메시지로 끝내고 done은 보내지 않는다', async () => {
    const res = ndjsonStream(failing(['a'], '잘렸습니다'));
    expect(await readMessages(res)).toEqual([
      { type: 'delta', text: 'a' },
      { type: 'error', error: '잘렸습니다' },
    ]);
  });

  it('NDJSON Content-Type과 전달받은 헤더를 응답에 붙인다', () => {
    const res = ndjsonStream(fromArray(['x']), { headers: { 'X-Test': '1' } });
    expect(res.headers.get('Content-Type')).toBe('application/x-ndjson');
    expect(res.headers.get('X-Test')).toBe('1');
  });

  it('클라이언트가 응답을 취소하면 onCancel을 한 번 호출한다', async () => {
    const onCancel = vi.fn();
    const silent = (async function* () {
      await new Promise(() => {});
      yield 'never';
    })();
    const res = ndjsonStream(silent, { onCancel });

    await res.body!.cancel();

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
