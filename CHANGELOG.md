# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/lang/ko/).

## [Unreleased]

### Changed

- 워크플로우 출력(잡/스텝 이름, 입력 설명, Step Summary)을 영어로 통일

### Added

- `work_intensity` 입력: item당 sha256 반복 횟수로 워크로드 무게 조절
  (tools/work.py `--work-intensity`, workflow input `work_intensity`)
- 벤치마크 실측 (20 000 items × intensity 10 000):
  1샤드 100.0s / 127s 벽시계, 4샤드 25.9s / 87s, 16샤드 6.6s / 68s
  (runs 36290116153, 36290117427, 36290118749)

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
