# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/lang/ko/).

## [Unreleased]

## [0.1.0] - 2026-09-27

### Added

- `src/` TypeScript 코어: `shardOf` / `itemsForShard` (결정론적 샤드 배정),
  `runShard` / `runShardToFile` (샤드 워커),
  `bundleParts` / `bundleFromDir` (병합 + 커버리지 검증)
- `action-bundle` CLI: `work`, `bundle` 서브커맨드
- 재사용 워크플로우 `.github/workflows/bundle.yml`
  (`push`, `workflow_dispatch`, `workflow_call` 트리거)
- 실측: 8샤드×200 item run 23초, 16샤드×500 item run 25초 성공
  (runs 36289249598, 36289296353)
- 다국어 README (한국어/English/简体中文), 사용 가이드, 기여/보안 문서
- 원본 Python 참조 구현 (`tools/`, 로컬 프로토타입용)

[Unreleased]: https://github.com/flyingsquirrel0419/Action-bundle/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/flyingsquirrel0419/Action-bundle/releases/tag/v0.1.0

