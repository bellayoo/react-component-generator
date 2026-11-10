# AGENTS.md

## Operational Commands

- 패키지 매니저는 `bun` 고정 (`bun.lock` 존재). npm/yarn/pnpm 사용 금지.
- 설치: `bun install`
- 개발 (API 서버 :3002 + Vite :5173 동시): `bun run dev`
- API 서버만: `bun run server`
- 테스트 전체: `bun run test` (vitest run, 대상은 `src/**/*.test.{ts,tsx}`와 `server/**/*.test.ts`)
- 단일 테스트: `bunx vitest run <파일경로>`
- 린트: `bun run lint`
- 빌드 + 타입체크: `bun run build` (`tsc -b && vite build`)
- `bun test`는 사용하지 않는다. 테스트 러너는 vitest이며 jsdom 설정이 `vite.config.ts`에 있다.

## Golden Rules

### Immutable

- API 키 값을 클라이언트 응답에 포함하지 마라. `/api/config`는 키 존재 여부(boolean)만 반환한다 (`server/index.ts:147-157`).
- API 키를 로그, 에러 메시지에 출력하지 마라. Gemini 호출은 키가 URL 쿼리에 들어가므로(`server/index.ts:99`) URL이나 요청 객체를 에러에 포함하면 키가 노출된다. 현재 throw 메시지는 상태 코드만 담는다 (`server/index.ts:85, 112`).
- `.env`는 커밋하지 마라 (`.gitignore`, `.worktreeinclude`에 등록됨).
- 민감 파일(`.env*`, `*credential*`, `*secret*`, `*.pem`, `*.key`, `id_rsa*`, `.npmrc`, `.netrc`, `~/.ssh`, `~/.aws`)은 읽기·수정·출력 모두 금지다. `.claude/settings.json`의 `permissions.deny`가 Read/Edit와 일부 Bash 명령(`cat`, `grep` 등)을 차단한다. 우회하지 말고, 값이 필요하면 사용자에게 요청하라. 차단 목록을 바꿀 때는 이 문서와 함께 갱신하라.

### Do's & Don'ts

- 생성 코드는 react-live `noInline` 모드로 실행된다 (`src/components/LivePreview.tsx:11`). 이 모드는 `render(<X />)` 호출이 없으면 아무것도 그리지 않는다. 생성 코드 처리 로직을 바꿀 때 `render` 호출 보장을 유지하라 (`server/generator.ts:12-23`).
- 같은 위험을 두 곳에서 막고 있다. 한쪽만 제거하지 마라.
  - `render` 호출: 시스템 프롬프트(`server/index.ts:12`)와 `ensureRenderCall`(`server/index.ts:188`).
  - 코드펜스 제거: 시스템 프롬프트(`server/index.ts:16`)와 `stripCodeFences`(`server/index.ts:188`).
- 시스템 프롬프트의 "import 금지", "TypeScript 문법 금지" 규칙(`server/index.ts:11, 20`)은 react-live 런타임 제약 때문이다. 완화하지 마라.
- 서버 포트 3002는 `server/index.ts:139`와 `vite.config.ts` 프록시 두 곳에 있다. 변경 시 함께 수정하라.
- 새 프로바이더·모델 호출은 `Provider` 타입(`src/types/index.ts:1`, `server/index.ts:57` 두 곳에 각각 정의)을 함께 갱신하라.

## Project Context

- 프롬프트로 React 컴포넌트를 생성하고 react-live로 미리보기하는 도구.
- Stack: React 19, TypeScript, Vite, react-live, Bun(API 프록시), vitest, Testing Library.

## Standards & References

- 설치·실행·기능 설명은 `README.md` 참고.
- 커밋 메시지: `타입: 요약` 한국어 (feat / fix / refactor / chore), 요약 50자 안팎, 마침표 없음.
- 푸시는 사용자가 요청할 때만 한다.
- 서버 영역 상세 규칙: `server/AGENTS.md`
- Maintenance Policy: 이 문서의 규칙과 코드 사이에 괴리가 생기면 즉시 업데이트를 제안하라. 라인 근거가 어긋나면 갱신한다.
