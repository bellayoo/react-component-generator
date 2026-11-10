import { describe, it, expect } from 'vitest';
import { errorResponse } from './http';

describe('errorResponse', () => {
  it('메시지에 503이 있으면 503과 과부하 안내를 반환한다', async () => {
    const res = errorResponse(new Error('Gemini API error: 503'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.',
    });
  });

  it('메시지에 429가 있으면 429와 요청 과다 안내를 반환한다', async () => {
    const res = errorResponse(new Error('Claude API error: 429'));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
  });

  it('그 외 에러는 500과 원본 메시지를 반환한다', async () => {
    const res = errorResponse(new Error('생성된 코드가 너무 길어 잘렸습니다.'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: '생성된 코드가 너무 길어 잘렸습니다.' });
  });

  it('Error가 아닌 값은 Unknown error로 처리한다', async () => {
    const res = errorResponse('boom');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Unknown error' });
  });

  it('모든 응답에 CORS 헤더를 붙인다', () => {
    expect(errorResponse(new Error('x')).headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
