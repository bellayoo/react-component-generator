# server/AGENTS.md

## Module Context

Bun으로 실행되는 AI API 프록시 (`Bun.serve`, 포트 3002). Vite 개발 서버가 `/api`를 이 서버로 프록시한다.

## Tech Stack & Constraints

- 런타임은 Bun이지만 테스트는 vitest(jsdom 환경 설정 공유)로 돌아간다. 따라서 테스트 대상 모듈에서 `Bun.*` 글로벌을 쓰면 테스트가 깨진다.
- 외부 SDK 없이 `fetch`로 Anthropic/Gemini REST를 직접 호출한다. 새 프로바이더도 같은 방식을 따른다.
- 환경 변수: `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`. 클라이언트가 보낸 `apiKey`가 `.env` 값보다 우선한다 (`index.ts:64-66`).

## Implementation Patterns

- 부수효과가 없는 로직은 `generator.ts`, `fallback.ts`에 순수 함수로 분리하고 `*.test.ts`를 옆에 둔다. `Bun.serve`가 있는 `index.ts`에는 로직을 넣지 않는다 (`generator.ts:1-2`).
- Gemini 모델 폴백 순서는 `GOOGLE_MODELS` 배열 순서다 (`index.ts:5`). 모델 교체는 이 배열만 수정한다.
- 에러 → HTTP 상태 변환은 에러 메시지 문자열의 `503`, `429` 포함 여부로 판단한다 (`index.ts:194, 201`). 새 호출 함수의 throw 메시지에 상태 코드를 포함해야 같은 매핑이 동작한다.
- 모든 Response에 `CORS_HEADERS`를 붙인다 (`index.ts:51`).

## Testing Strategy

- 실행: `bunx vitest run server`
- 새 순수 함수는 `generator.test.ts`, `fallback.test.ts`와 같은 위치·이름 규칙으로 테스트를 추가한다.
- `index.ts`(라우팅, 외부 API 호출)는 테스트가 없다. 수정하면 `bun run dev`로 `/api/generate` 수동 확인이 필요하다.

## Local Golden Rules

- 폴백(`withModelFallback`)과 `MAX_TOKENS` 잘림 검사는 Google 경로에만 있다 (`index.ts:123, 135`). Anthropic 경로(`index.ts:68-96`)는 단일 모델에 잘림 검사가 없다. 한 경로를 고칠 때 다른 경로에 같은 처리가 필요한지 확인하라.
- `withModelFallback`은 마지막 에러만 던진다 (`fallback.ts:12-19`). 모든 모델 실패 시 앞선 에러의 상태 코드는 사라지므로 503/429 매핑은 마지막 모델 기준이다.
- 키 없는 요청은 400으로 거절한다 (`index.ts:169-174`). 프로바이더 호출 전에 키와 `prompt` 검증을 유지하라.
