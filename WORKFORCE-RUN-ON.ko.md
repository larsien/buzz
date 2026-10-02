# workforce-run-on: 기존 에이전트 Start 시 "Run on" 선택

브랜치 `workforce-run-on`, 기준 커밋 Buzz `5e5634a` (Desktop 0.5.23).

## 무엇을, 왜 바꿨나

- **이전 동작:** 이미 있는 에이전트 정의(persona)에서 **Start**를 누르면 첫 인스턴스가 항상 로컬(`backend: {type:"local"}`)로 만들어졌다.
  `buzz-backend-*` provider가 설치돼 있어도 마찬가지였다. provider로 실행하는 경로는 "Create agent" 대화상자의 Advanced → **Run on** 하나뿐이었다.
- **변경 후:** provider가 하나라도 발견되면 Start를 눌렀을 때 작은 확인 대화상자("Start <이름>")가 열린다.
  - 기존 `WhereToRunSection`, `canSubmitWhereToRun`, `resolveBackendIntent`를 그대로 재사용한다.
  - 기본값은 **This computer**다.
  - Start를 확정하면 선택한 `BackendIntent`가 기존 `buildInstanceInputForDefinition`으로 전달된다. 그래서 첫 인스턴스부터 provider-backed(`backend:{type:"provider",id,config}`)로 생성된다.
  - 로컬로 먼저 만든 뒤 변환하는 단계는 없다.
- **provider가 없으면:** 대화상자 없이 즉시 로컬로 시작한다. 이전과 같은 동작이며 테스트로 고정했다.
  - 발견 쿼리가 아직 끝나지 않았으면 `refetch`로 결과를 확인한 뒤 결정한다. 그래서 너무 이른 클릭이 선택기를 건너뛰는 일은 없다.
  - 발견에 실패하면 "provider 없음"으로 처리한다.
- Workforce 전용 코드, 문자열, id는 없다. upstream에 그대로 제안할 수 있는 형태로 유지했다.
- Stop/Delete 동작과 provider 종료 안내 문구는 바꾸지 않았다.

## 진입점

| 진입점 | 처리 | 이유 |
|---|---|---|
| Agents 화면 persona 카드의 Start 배지 (`AgentsView` → `useManagedAgentActions.handleStartPersona`) | **변경** | 대표적인 "persona 시작" 동작 |
| persona 프로필 패널의 **Start agent** (`UserProfilePanel.handleInstantiateAgent`) | **변경** | 같은 동작. 카탈로그에서 "Add agent"를 누르면 이 프로필 패널이 열리므로, 카탈로그 경로도 여기서 함께 적용된다 |
| Community catalog "Add agent" (`usePersonaActions.handleSetActive`) | 그대로 | 정의를 활성화하거나 복사만 할 뿐 인스턴스를 만들지 않는다. 시작은 위의 프로필 Start에서 한다 |
| 채널 멤버 사이드바 (`useMembersSidebarActions.ts`) | 그대로 | 이미 있는 인스턴스를 start/stop/respawn한다. persona에서 새로 만드는 동작이 아니다 |
| 채널 "Add bot" (`AddChannelBotDialog`, `channelAgents.ts`) | 그대로 | 여러 개를 일괄 생성하면서 채널에 붙이는 다른 흐름이고, `backend:local`이 하드코딩돼 있다. 같은 선택기를 넣으려면 다중 선택 UX를 설계해야 해서 이번 범위 밖으로 뒀다 |
| 팀 → 채널 추가 (`AddTeamToChannelDialog`) | 그대로 | 위와 같은 일괄 생성 흐름 |
| 온보딩 welcome guide (`welcomeGuide.ts`) | 그대로 | 앱이 자동으로 첫 에이전트를 만드는 경로이고, 사용자가 누르는 Start가 아니다 |
| 에이전트 관리 요청 (`useAgentManagement.ts`) | 그대로 | 이미 create 대화상자의 `backendIntent`를 받는다 |
| 프로필 패널의 persona 생성/복제 저장 (`submitProfilePersonaDialog`) | 그대로 | 편집 모드 대화상자로 "생성 + 즉시 시작"을 한다. 새 정의 생성은 Agents의 create 대화상자가 이미 Run on을 제공한다 |

## 수정한 파일

- `desktop/src/features/agents/ui/StartPersonaRunOnDialog.tsx` (신규): `useStartPersonaRunOn` 게이트 훅과 확인 대화상자
- `desktop/src/features/agents/ui/useManagedAgentActions.ts`: `handleStartPersona(persona, backendIntent?)`가 intent를 매핑 함수로 넘긴다
- `desktop/src/features/agents/ui/AgentsView.tsx`: 카드 Start를 게이트에 연결하고 대화상자를 렌더한다
- `desktop/src/features/profile/ui/UserProfilePanel.tsx`: 프로필 Start를 게이트에 연결하고 대화상자를 렌더한다
- `desktop/src/features/agents/ui/startPersonaRunOn.test.mjs` (신규): 실제 `AgentsView`를 JSDOM에 마운트하고 `create_managed_agent` IPC 입력을 검증한다
- `desktop/tests/e2e/start-persona-run-on.spec.ts` (신규) 및 `desktop/playwright.config.ts`: smoke 프로젝트에 등록했다
- `desktop/src/features/agents/AGENTS.md`의 테스트 목록에 위 테스트를 추가하려 했지만, 보호 파일이라 이번 커밋에는 넣지 않았다

## 테스트 다시 돌리기

```bash
pnpm install --frozen-lockfile            # 저장소 루트에서 실행
cd desktop
# React act 지원을 위해 NODE_ENV=development를 명령 단위로 지정한다
NODE_ENV=development node --import ./test-loader.mjs --experimental-strip-types \
  --test src/features/agents/ui/startPersonaRunOn.test.mjs
NODE_ENV=development pnpm test            # 데스크톱 단위 테스트 전체
pnpm typecheck                            # tsc --noEmit
pnpm check                                # biome + px-text + pubkey-truncation
pnpm check:file-sizes
pnpm build:e2e && npx playwright test --project=smoke \
  tests/e2e/start-persona-run-on.spec.ts tests/e2e/where-to-run-config.spec.ts
```

이 PC의 Playwright는 고정 버전 브라우저(chromium 1223)가 설치돼 있지 않다. 그래서 커밋하지 않은 임시 config에서 `launchOptions.executablePath`를 설치된 headless shell 1243으로 지정해 실행했다.

## upstream 업데이트 시 유지 비용

- **작음.** 신규 파일 1개와 기존 파일 3개를 조금 고쳤다. 기존 파일 변경은 합쳐서 약 +70/-20줄이다.
- **충돌 가능 지점:**
  - `UserProfilePanel.tsx`의 `createManagedAgentForPersona`와 `handleInstantiateAgent` 근처. 자주 바뀌는 큰 파일이며, 파일 크기 상한은 1200줄이고 현재 1025줄이다.
  - `AgentsView.tsx`의 `onStartPersona` prop.
  - `handleStartPersona` 시그니처.
- **API 의존:**
  - `WhereToRunSection`, `whereToRunIntent.ts`, `buildInstanceInputForDefinition(persona, runtime, upload, backendIntent)`의 네 번째 인자, `useBackendProvidersQuery`.
  - upstream이 이 이름이나 시그니처를 바꾸면 신규 파일과 두 호출부를 함께 고쳐야 한다.
- **upstream이 같은 기능을 넣으면** 이 패치는 버리면 된다. 그때 테스트 두 개는 회귀 검증용으로 옮겨 쓸 수 있다.
