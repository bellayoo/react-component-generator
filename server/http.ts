export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 에러 메시지의 503/429 포함 여부로 HTTP 상태를 정한다. 호출 함수의 throw 메시지에 상태 코드를 넣어야 한다.
export function errorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : 'Unknown error';

  if (message.includes('503')) {
    return Response.json(
      { error: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.' },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  if (message.includes('429')) {
    return Response.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429, headers: CORS_HEADERS }
    );
  }

  return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS });
}
