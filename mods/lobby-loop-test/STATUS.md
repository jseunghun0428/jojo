# 작업 일시 중단 기록

사용자 요청으로 2026-10-22 작업을 중단했다. 사용자가 재개를 요청하기 전에는 추가 분석·수정·앱 실행을 진행하지 않는다.

## 확정된 테스트 범위

- 기존 신조조전 엔진을 개조한다.
- 스토리를 제거하고 출진 대기실 → 전투 → 출진 대기실 → 다음 전투로 이어지게 한다.
- 테스트 아군은 ‘기존 시나리오에서 영입되는 무장 전원’이다. 이름 있는 적장 전체를 뜻하지 않는다.
- 현재 사용자는 앱을 띄울 수 없다. 파일 분석·수정본 준비를 먼저 하고 실제 게임/편집기 실행 검증은 나중에 한다.

## 완료한 준비

- 원본 tool과 보존용 analysis/input/tool을 유지하고, mods/lobby-loop-test/game에 별도 작업본 390개 파일을 복사했다.
- 복사 직후 원본 해시와 전부 일치했다. 기준은 baseline-manifest.json에 있다.
- 작업본 Scenario/CczSceneEditor2.ini의 ExePath만 이 작업본 경로로 바꿨다.
- 실제 EEX 시나리오 패치는 아직 작성하지 않았다. 대기실/전투 루프가 완성되거나 플레이 검증된 상태가 아니다.
- 앱 실행을 시도한 적은 있으나 이 작업본 편집기 프로세스는 이후 확인에서 실행 중인 것이 없었다. 이후에는 UI 입력을 하지 않았다.

## 조사 중 확보한 단서

- Rs에는 R_00..R_58.eex 59개, S_00..S_57.eex 58개가 있다.
- EEX 헤더는 EEX\0, 버전 바이트 01 02다. 엔진 0x40FE3D는 오프셋6부터 u16 type/u16 length 메타데이터 블록을 읽고 type0에서 헤더 처리를 끝낸다. 뒤에 u32 section/scene 오프셋 테이블을 사용한다.
- 편집기의 공개 참조 소스: https://github.com/Puluomiyuhun/ccz-SceneEditor . 내려받은 참조 파일은 analysis/tools/reference-ccz-editor에 있다.
- cczEditor2View.h의 code_instruct[124][13]과 code_test[], View.cpp의 CreateFileTree/EditData, Doc.cpp의 writer가 실제 읽기/쓰기 형식의 근거다. 별도 Instructions.json은 실제 reader와 차이가 있어 사용하지 않는다.
- 참조 소스 기준 데이터는 scene의 u16 section count 및 각 section의 u16 byte length + command stream 구조다. 전체 117개 파일 파서/serializer 및 무손실 roundtrip은 아직 완료하지 않았다.
- typed parameter 5는 NUL 종료 문자열, 0x35는 개수+u16 목록, 4는 i32, 나머지는 u16이라는 소스 근거를 얻었다. 파일 전체와 대조가 필요하다.
- 영입 opcode 0x3B 후보는 정규 ID0..25 및 ID52가 관측됐다. 52는 R_05의 이름 입력 신무장 이벤트로 보인다. 현재는 파서 검증 전 후보이며 최종 로스터로 확정하지 않았다.
- 기존 영입 명령의 마지막 값은 조조2, 관우3, 나머지 대부분0으로 다르므로 임의 통일하지 않는다. 원본 명령의 전체 파라미터를 보존할 계획이다.
- 엔진 로더 0x417EEA는 현재 시나리오 번호의 짝/홀로 R/S 파일을 선택한다. 0x41811F는 이벤트 처리 결과4일 때 시나리오 번호를 증가시키고 다음 파일을 읽는다. 각 명령과의 직접 연결은 추가 확인이 필요하다.

## 재개 지점

1. 참조 소스로 EEX 파서/serializer를 완성하고 117개 전부 바이트 동일 roundtrip 검증.
2. 구조적으로 파싱한 0x3B 명령으로 영입 전원 목록과 파라미터 확정.
3. 기존 R/S에서 출진 메뉴, 전투 초기화/배치, 승패·전투 종료와 다음 대기실 전환을 분리.
4. game 작업본에 스토리 없는 최소 루프를 생성하고 구조 검증.
5. 사용자가 앱을 띄울 수 있을 때 새 게임 시작·전원 목록·편성·승리 후 대기실·다음 전투를 실제 검증.

REA 중간 결과: analysis/output/rea-loop. 종료 시 paused-evidence.json과 paused.snapshot.json으로 관측을 보존하도록 내보내고 세션을 닫았다. 이는 코드 관측 캐시이며 게임 세이브가 아니다.
