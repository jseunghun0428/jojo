# 조조전 분석 작업 공간

분석일: 2026-10-22 (Asia/Seoul)

후속 조사: [조조 한 명의 데이터 읽기 경로](cao-trace.md). 파일의 32바이트 레코드가 내부 72바이트 구조체로 변환되고 장수정보 화면에 표시되는 코드까지 추적했다.

## 사본과 재현

- 원본: `../tool`
- 분석 입력: `input/tool` — 390개 파일, 325,207,011바이트.
- 복사 직후 모든 파일의 SHA-256이 원본과 일치했다. 목록과 해시는 `output/snapshot-manifest.json`에 있다.
- 분석 스크립트는 입력 사본을 읽고 `output`에 결과를 쓴다. 실행 파일이나 DLL을 실행/로드하는 게임 동작 관찰은 수행하지 않았다.

프로젝트 루트에서 재현:

```powershell
node analysis/scripts/inspect.mjs
node analysis/scripts/probe-addresses.mjs
node analysis/scripts/data-layout.mjs
node analysis/scripts/extract-data.mjs
node analysis/scripts/verify-snapshot.mjs
node analysis/scripts/rea.mjs doctor --provider ghidra --json
```

`snapshot.mjs`는 사본이 이미 있으면 덮어쓰지 않고 중단한다.

## 도구

- REA: npm 공식 패키지 `rea-agents@6.7.0`, `tools/rea`에 로컬 설치. 설치 스크립트는 실행하지 않았다.
- Ghidra: 공식 12.1.4 배포본, `tools/ghidra_12.1.4_PUBLIC`.
- Ghidra ZIP SHA-256: `ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db` — GitHub 공식 배포 자산의 digest와 대조했다.
- Java: 기존 IntelliJ의 64비트 JBR/JDK 25.0.4를 사용. `rea.mjs` 실행 프로세스의 환경에만 경로를 지정한다.
- `output/rea-doctor.json`의 Ghidra 범위 검사는 healthy=true다. 이후 실제 REA 함수 분석과 근거 내보내기까지 성공했다.
- Codex 사용자 설정이나 영구 MCP 등록은 변경하지 않았다. `rea-session.mjs`가 임시 stdio MCP 서버를 실행한다.

공식 자료:

- https://github.com/morluto/rea/blob/main/docs/windows-ghidra-p0.md
- https://github.com/NationalSecurityAgency/ghidra/releases/tag/Ghidra_12.1.4_build

## 확인된 파일 정보

`Ekd5.exe`는 x86 PE32 네이티브 실행 파일이다. 이미지 기준 주소는 `0x400000`, 진입점은 `0x4817E0`이며 CLR 디렉터리는 없다.

버전 리소스에는 FileVersion/ProductVersion `1, 0, 6, 6`, ProductName `三國新曹操傳`, Comments `원작 : Star175, Puluo. 한글화 : 레가시.`가 들어 있다. 이는 파일 내부의 자기표기이며 제작 주체나 정품 여부에 대한 인증이 아니다. 일부 VERSIONINFO 문자열의 길이 값이 표준과 달라 바이트 길이로 읽는 복구 경로를 사용했고, 첫 NUL까지를 표시한다. 원본 바이트는 입력 사본과 리소스 오프셋에 남아 있다.

`형상편집기 6.6.exe`는 `MSVBVM60.DLL`을 사용하는 별도의 VB6 도구다. `Scenario/CczSceneEditor2.exe`는 MFC/Visual C++ 런타임을 사용하는 별도 편집기다. 두 편집기를 게임 엔진과 혼동하지 않는다.

전체 PE 섹션/임포트/리소스 정보: `output/Ekd5.exe.pe.json`.

## 데이터와 주소 조사

- `DATA.E5` 문자열: 파일 오프셋 `0x8A560`, PE 매핑 주소 `0x48BB60`.
- `.code` 안에서 이 주소의 리틀엔디언 바이트가 11곳 발견됐다. 이것은 원시 참조 후보이며 디스어셈블러의 코드 참조 확인과 구분한다.
- `Data.e5`, `Hexzmap.e5`, `E5/Dt.e5`, `E5/Hitarea.e5`, `E5/Effarea.e5`는 `Ls12`와 공백으로 시작하는 같은 16바이트 헤더를 가진다. `Data.e5`의 컨테이너 구조는 아래의 실제 로더 코드로 확인했다. 다른 파일의 전체 내용은 아직 추출하지 않았다.
- `imsg.e5`: 450,000바이트를 200바이트씩 나누면 2,250개의 NUL 종료 텍스트 슬롯이 정렬된다. CP949로 한국어 책략 설명, 전투명, 인물전 등을 읽을 수 있다. 일부 슬롯은 첫 NUL 이후에도 비제로 바이트가 있으므로 재작성 시 원시 바이트를 보존해야 한다.
- `Star.e5`: 앞부분 25바이트 간격으로 이름이 있는 항목 151개가 정렬되고, 인덱스 151/오프셋 `0xEBF`에는 `절취선`이 있다. 뒤쪽은 0/공백 채움이다. 파일 전체를 25바이트 레코드로 단정하지 않는다.
- `System.ini`의 `SCount=96`은 파일에 존재하는 전체 항목 수와 같지 않다. 인덱스 96/`0x960`부터도 `수류탄` 등의 이름이 있다. 런타임 사용 범위와 정확한 필드 의미는 미확인이다.

정적 데이터 분석 결과와 필드 후보: `output/data-layout.json`.

## REA로 검증한 Data.e5 추출

`DATA.E5` 문자열을 참조하는 코드 위치 11곳이 Ghidra의 xrefs 결과와 일치한다. 대표 로더 `FUN_0041b51e`는 파일을 열고 `FUN_0041fc89`로 항목을 읽는다.

`FUN_0041fc89`의 어셈블리를 기준으로 구조를 확인했다.

- 항목 테이블 시작: 파일 `0x110`.
- 항목 크기: 12바이트, 빅엔디언 32비트 값 3개(저장 크기, 출력 크기, 데이터 오프셋).
- 첫 데이터 오프셋: `0x18C`.
- 항목 수: `(0x18C - 0x114) / 12 = 10`.
- 테이블 뒤 4바이트는 이 파일에서 0이다.
- 10개 모두 저장 크기와 출력 크기가 같아 직접 읽기 분기로 처리된다. 이 파일의 항목은 압축 해제 없이 추출할 수 있다.
- 항목이 연속으로 배치되며 마지막 항목의 끝이 파일 크기 61,379바이트와 정확히 일치한다.

`output/extracted/Data/entry-00.bin`부터 `entry-09.bin`까지 추출했다. 개별 크기·오프셋·SHA-256은 `output/data-container.json`에 있다. `extract-data.mjs`는 이 파일의 비압축 항목만 지원하며 압축 항목을 만나면 중단한다.

아이템 레코드 간격은 `FUN_004837c2`의 어셈블리 `IMUL ECX, ECX, 0x19` 및 기준 주소 `0x4A1140`으로 확인했다. 이 함수의 의사 코드는 레지스터 결과를 생략하여 빈 함수처럼 보이므로 반드시 JSON의 어셈블리를 함께 읽어야 한다.

초기화 함수 `FUN_004010b0`는 `Data.e5` 항목 1의 2,600바이트를 `0x4A1140`에 읽고, `Star.e5`를 `0x4A1B68`에 읽는다. 두 주소 차이는 `104 × 25`다. Star 로더 `FUN_00451313`은 `0xED8=3800=152×25`바이트를 읽어 마지막 구분 항목까지 포함한다. 초기화 반복문은 ID 0..254를 순회한다.

따라서 이 정적 로딩 경로에서 다음 배치를 확인했다.

- ID 0..103: Data 항목 1의 104개 레코드.
- ID 104..254: Star 앞부분의 이름 있는 151개 레코드.
- ID 255 위치: Star의 `절취선` 구분 항목.

255개 항목에는 공란/예약 이름도 포함되므로 255개 모두가 실제 사용 가능한 장비라는 의미는 아니다. 정리한 목록은 `output/item-names.tsv`, 원시 25바이트 및 출처 오프셋을 포함한 목록은 `output/items.json`에 있다. 예: ID 0 `단검`, ID 104 `방어공란12`, ID 200 `수류탄`.

## 근거와 분석의 한계

완전한 REA Evidence 묶음: `output/rea/evidence-bundle.json`. 재사용 가능한 관측 스냅샷: `output/rea/ekd5.snapshot.json`. 개별 함수 JSON과 의사 코드는 같은 폴더에 있다. Evidence ID와 함수 주소는 `output/data-container.json`에도 연결했다.

- DATA 문자열 xrefs: `ev_a5f695ae16dc37bc985c7358a81dec4a5fe873db9c5e7c83bc8ab74328cfb665`.
- 항목 읽기 함수: `ev_261fa38b774487b8d99ebf5b8d4da6a53c39dccd96713744c6333b4a531d0be6`.
- 초기 아이템 로딩: `ev_ca1461546f6d3c36b103a40abb0db195255f912d717c4757ee90455cbc00c81f`.
- 25바이트 접근: `ev_b5bbd800568893ceb7397d7f24da48ee7d2e77eb8d7ac738a6f4fab3c7e48039`.
- Star 3800바이트 읽기: `ev_6e1092ece422a7e0d101c669ebdfce9274e4fef85c4960da61d36428824a39e9`.

의사 코드의 형식/인자 추론에는 오차가 있다. 예를 들어 항목 수 계산의 BSWAP 및 SUB 명령이 어셈블리에는 있지만 의사 코드에서 누락되므로 바이트·어셈블리를 함께 검토했다. 현재 결과는 정적 분석이며 게임 실행을 관찰한 결과가 아니다.

책략 정보 UI 함수 `0x46FA82`도 조사했다. `MgHit` 값 3을 UI에 표시할 때 `0x22=34`로 변환하지만 System.ini 주석은 33이라고 설명한다. 이것은 UI 코드와 주석 사이의 차이이며 실제 전투 명중률이 34라는 결론은 아니다. 실제 계산 함수는 별도 검증이 필요하다.

최초 제한된 셸에서는 Ghidra 분석이 약 25초 만에 끝났어도 루프백 연결 단계에서 330초 시간 초과가 발생했다. 같은 기본 분석 설정을 제한된 셸 밖에서 실행한 재시도는 약 33초에 xrefs를 반환했고 이후 함수 분석도 성공했다. 타임아웃 실패 기록은 `output/rea/data-string-xrefs.json`에 보존했다. 최종 세션은 Evidence/스냅샷을 내보낸 뒤 `close_binary` 성공을 확인하고 종료했다.

## System.ini의 책략 테이블

CP949 디코딩본은 `output/System.ini.utf8.txt`에 있다. 설정이 지정한 파일 오프셋을 PE 섹션으로 매핑하면 주석에 적힌 주소와 일치한다. 아래 이름의 게임상 의미는 설정 주석의 설명이며 코드/실행 검증 전까지는 가설로 취급한다. 각 144바이트를 읽은 값, 히스토그램, 원시 참조 후보는 `output/address-probes.json`에 있다.

- `MgMF`: `0xA2CE0` → `0x4D14E0`, 모방/범위 확장 관련 플래그.
- `MgID`: `0xA2D70` → `0x4D1570`, 효과 종류.
- `MgAIYN1`: `0xA2E00` → `0x4D1600`, 전장 AI 책략 분류.
- `MgAIYN2`: `0xA2E90` → `0x4D1690`, 연무장 AI 책략 분류.
- `MgHit`: `0xA2F20` → `0x4D1720`, 명중 상한/특수 값.
- `Mg8`: `0xA2FB0` → `0x4D17B0`, 학습 관련 플래그.
- `MgHurt`: `0xA3040` → `0x4D1840`, 피해 파라미터/특수 값.
- `MgHurtYN`: `0xA30D0` → `0x4D18D0`, 피해 처리 분류.
- `MgMeff`: `0xA3160` → `0x4D1960`, 효과 영상 번호。
- `MgMcall`: `0xA31F0` → `0x4D19F0`, 소환/연출 번호。

병종 상성 후보 `UserXK=A3280`은 `0x4D1A80`으로 매핑된다. 행/열 크기와 계산식은 검증 전이다.

## 이번 조사 질문

1. 입력 사본 보존과 무결성: 복사/검증 완료. 분석 종료 후 원본/사본 390개 파일을 다시 검사하여 모두 최초 해시와 일치했다(`output/integrity-check.json`).
2. 실행 파일 구조·버전·의존성: 정적 조사 완료.
3. 데이터 헤더·문자열·테이블 후보: 1차 조사 완료, 의미는 일부 미확인.
4. REA/Ghidra 실제 함수 분석: 데이터 로더·항목 읽기·Star 로딩·아이템 접근 함수 조사와 10개 항목 추출 완료.
5. 전투 계산식과 AI 전체 복원: 이번 1차 조사의 완료 기준에 포함하지 않는다. 검증된 데이터 로더를 출발점으로 후속 조사한다.
