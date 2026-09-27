# 기여하기 (Contributing)

버그 리포트, 기능 제안, PR 모두 환영한다.

## 개발 환경

- Node.js 20 이상
- 저장소 클론 후:

```bash
npm install
npm run build   # tsc → dist/
npm test        # build + smoke test
npm run check   # 타입 체크만
```

## 변경 워크플로우

1. 이슈로 먼저 논의하면 좋다 (큰 변경일수록).
2. 브랜치를 만들고 작업한다.
3. `npm test`가 통과하는지 확인한다. 동작 변경이면 `test/smoke.mjs`에
   검증 케이스를 추가한다.
4. PR을 열 때 변경 이유와 검증 방법을 적는다. 템플릿이 자동으로 뜬다.

## 코드 규칙

- TypeScript strict 모드 유지.
- ESM(`import ... from "./x.js"`) — `.js` 확장자를 명시한다.
  (`moduleResolution: NodeNext` 규칙)
- 공개 API는 `src/index.ts`에서만 export한다.

## 커밋/PR

- 커밋 메시지는 무엇+왜를 한 줄로. 형식 강제는 없다.
- CI (`shard-and-bundle` 워크플로우)가 push마다 돌며, 이것 자체가
  이 프로젝트의 dogfooding이다.

## 보안 이슈

공개 이슈에 올리지 말고 [SECURITY.md](SECURITY.md)의 절차를 따른다.

