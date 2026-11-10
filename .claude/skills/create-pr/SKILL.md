---
name: create-pr
description: 현재 브랜치의 변경사항을 분석해 GitHub Pull Request를 생성한다. 프로젝트에 따라 references/의 한국어 또는 영문 템플릿을 골라 본문을 작성한다. "PR 만들어줘", "PR 생성", "풀 리퀘스트 올려줘", "create a PR", "open a pull request" 같은 요청에 활성화한다. 커밋 작성, 코드 리뷰 반영에는 쓰지 않는다.
context: fork
---

# Create PR

현재 브랜치와 기본 브랜치의 차이를 분석해 PR을 생성한다. 이 스킬은 서브 에이전트(fork)에서 실행되므로 사용자에게 되묻지 않고 끝까지 진행한다. 진행할 수 없는 상황이면 이유만 보고하고 멈춘다.

## 절차

### 1. 사전 확인
- `git rev-parse --is-inside-work-tree`로 저장소 여부를 확인한다. 아니면 중단하고 알린다.
- `gh auth status`로 GitHub CLI 로그인을 확인한다. 안 되어 있으면 중단하고 `gh auth login`이 필요하다고 알린다.
- 기본 브랜치를 `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`로 구한다 (실패 시 `main`).
- 현재 브랜치가 기본 브랜치면 중단하고 "기능 브랜치에서 실행해야 한다"고 알린다. 브랜치를 임의로 만들지 않는다.
- `git status --short`에 커밋되지 않은 변경이 있으면 PR 생성은 계속하되, 최종 보고에 "커밋되지 않은 변경은 PR에 포함되지 않았다"고 명시한다. 대신 커밋하지 않는다.
- 이미 같은 브랜치의 열린 PR이 있으면(`gh pr view --json url,state`) 새로 만들지 않고 그 URL을 알린다.

### 2. 변경사항 분석
- `git log <기본브랜치>..HEAD --oneline`으로 PR에 담길 커밋을 확인한다.
- `git diff <기본브랜치>...HEAD`로 실제 변경 내용을 읽는다. 커밋 메시지나 파일명만 보고 판단하지 않는다.
- 커밋이 없으면 "PR로 올릴 변경이 없습니다"라고 알리고 끝낸다.

### 3. 템플릿 선택
`package.json`의 `name`을 확인한다.

- `name`이 `react-component-generator`이면 `references/pr-template.ko.md` (한국어)
- 그 외, `package.json`이 없는 경우 포함 `references/pr-template.en.md` (영어)

선택한 템플릿 하나만 읽는다. 제목과 본문 전체를 그 언어로 쓴다.

### 4. 제목과 본문 작성
- 템플릿의 섹션 구조와 순서를 그대로 따른다. 섹션을 임의로 추가하거나 빼지 않는다. 해당 사항이 없는 섹션은 `해당 없음` / `N/A`로 둔다.
- 제목은 70자 이내, 마침표 없음. 커밋이 1개면 그 메시지를, 여러 개면 전체를 아우르는 한 줄을 쓴다. 한국어 템플릿은 `타입: 요약` 형식(feat / fix / refactor / chore)을 따른다.
- 본문은 diff에서 확인한 사실만 쓴다. 실행하지 않은 테스트를 통과했다고 쓰지 않는다. 테스트 항목은 실제로 돌린 명령과 결과만 체크한다.
- 비밀 값(API 키, 토큰)이 diff에 보이면 PR을 만들지 않고 중단해 알린다.

### 5. 푸시와 PR 생성
1. 원격에 브랜치가 없거나 로컬이 앞서 있으면 `git push -u origin <현재브랜치>`를 실행한다. force 푸시는 쓰지 않는다.
2. 본문을 임시 파일에 쓰고 `gh pr create --base <기본브랜치> --title "<제목>" --body-file <파일>`을 실행한다. 저장소 안에 임시 파일을 남기지 않는다.
3. 끝나면 PR URL을 보고한다.

## 보고 형식
- PR URL, 사용한 템플릿 언어, 제목
- 포함된 커밋 수
- 커밋되지 않은 변경이 있었다면 그 사실

## 하지 않는 것
- 기본 브랜치에 직접 푸시하지 않는다.
- `--force`, `--no-verify`를 쓰지 않는다.
- 커밋을 새로 만들거나 기존 커밋을 수정하지 않는다.
- 템플릿을 두 언어 섞어 쓰지 않는다.
