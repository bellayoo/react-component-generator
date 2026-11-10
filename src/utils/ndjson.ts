/** 청크 단위로 NDJSON 텍스트를 받아 완결된 줄을 JSON 객체로 파싱해 반환한다. */
export function createNdjsonParser(): (chunk: string) => unknown[] {
  let buffer = '';

  return (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    return lines.filter((line) => line.trim()).map((line) => JSON.parse(line));
  };
}
