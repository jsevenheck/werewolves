# Graph Report - werewolves  (2026-08-09)

## Corpus Check
- 116 files · ~68,784 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 978 nodes · 2076 edges · 40 communities (37 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2999f574`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 30
- Community 31
- Community 36
- Community 38
- Community 39
- Community 43
- Community 48
- Community 53
- Community 55

## God Nodes (most connected - your core abstractions)
1. `@shared/types` - 73 edges
2. `setupSocketHandlers()` - 49 edges
3. `notify()` - 40 edges
4. `TypedSocket` - 31 edges
5. `localizedMessage()` - 28 edges
6. `addLog()` - 26 edges
7. `Room` - 24 edges
8. `schedulePhaseTransition()` - 24 edges
9. `Narrator` - 23 edges
10. `@playwright/test` - 22 edges

## Surprising Connections (you probably didn't know these)
- `useAdminSocket()` --calls--> `io`  [INFERRED]
  ui-vue/src/composables/useAdminSocket.ts → server/src/index.ts
- `useSocket()` --calls--> `io`  [INFERRED]
  ui-vue/src/composables/useSocket.ts → server/src/index.ts
- `makeSocket()` --calls--> `attachAdminToSocket()`  [EXTRACTED]
  __tests__/adminHandlers.test.ts → server/src/utils/adminAuth.ts
- `AdminState` --references--> `RoomView`  [EXTRACTED]
  ui-vue/src/stores/admin.ts → core/src/types.ts
- `GameState` --references--> `RoomView`  [EXTRACTED]
  ui-vue/src/stores/game.ts → core/src/types.ts

## Import Cycles
- None detected.

## Communities (40 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (94): ClientToServerEvents, ErrorResponse, InterServerEvents, ServerToClientEvents, SocketData, @shared/types, AdminObserver, LocalizedMessage (+86 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (41): getRoleName(), mapRolesToPages(), advanceToDay(), AdvanceToDayResult, closeContexts(), completeMayorElection(), configureRoles(), createLobbyWithPlayers() (+33 more)

### Community 2 - "Community 2"
Cohesion: 0.25
Nodes (8): onRoomClosed(), joinAsObserver(), submitVote(), startGame(), submitGuardProtection(), submitHarlotVisit(), submitSeerInspect(), notify()

### Community 3 - "Community 3"
Cohesion: 0.15
Nodes (12): attemptResume(), createName, createRoom(), enterRoom(), joinCode, joinName, joinRoom(), Props (+4 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (41): aliveTargets, aliveWitchTargets, currentWolfVote, durationSeconds, guardTarget, guardTargets, harlotTarget, harlotTargets (+33 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (26): attemptResume(), config, dayResults, {
  enabled: narratorEnabled,
  unlocked: narratorUnlocked,
  unlockInProgress: narratorUnlockInProgress,
  toggle: toggleNarrator,
  resetNarrator,
  bindGestureUnlock,
  cleanupNarrator,
}, hasRoom, hunterPrompt, hunterShotPending, isAdminRoute (+18 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (31): pinia, dependencies, howler, pinia, socket.io-client, vue, vue-i18n, devDependencies (+23 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (24): awaitingActions, dayVoteResolved, discussionActive, discussionEndsAt, discussionSecondsLeft, eligible, filtered, hasVoted (+16 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (37): concurrently, eslint, eslint-config-prettier, @eslint/js, eslint-plugin-prettier, eslint-plugin-vue, devDependencies, concurrently (+29 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (25): DOM.Iterable, env.d.ts, src/**/*.d.ts, src/**/*.ts, src/**/*.vue, compilerOptions, baseUrl, esModuleInterop (+17 more)

### Community 10 - "Community 10"
Cohesion: 0.10
Nodes (34): kickPlayerFromRoom(), setupAdminSocketHandlers(), toRoomSummary(), cancelPendingDisconnect(), app, io, registerNamespace(), resolveStaticDir() (+26 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (34): build, coverage, dist, node_modules, vite.config.ts, compilerOptions, baseUrl, esModuleInterop (+26 more)

### Community 12 - "Community 12"
Cohesion: 0.05
Nodes (42): express, nanoid, author, dependencies, express, howler, nanoid, socket.io (+34 more)

### Community 14 - "Community 14"
Cohesion: 0.12
Nodes (14): eligible, hasVoted, isHost, isRevote, required, { room, playerId }, selectedTarget, self (+6 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (14): allReady, info, isHost, isSelfReady, markReady(), players, readyCount, readyDisabled (+6 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (14): compilerOptions, module, moduleResolution, noEmit, outDir, rootDir, target, types (+6 more)

### Community 17 - "Community 17"
Cohesion: 0.10
Nodes (25): canStart, disconnectedCount, discussionTimerSeconds, emitConfig(), hasDisconnectedPlayers, isSingletonRole(), localDiscussionTimer, localPassiveConfig (+17 more)

### Community 18 - "Community 18"
Cohesion: 0.15
Nodes (11): alivePlayers, isArmor, isHost, loverA, loverB, Props, { room, playerId }, self (+3 more)

### Community 19 - "Community 19"
Cohesion: 0.17
Nodes (9): detail, narratorLabel, phaseText, Props, { room, playerName, roleVisible }, seerResult, self, store (+1 more)

### Community 20 - "Community 20"
Cohesion: 0.09
Nodes (27): extractQueueDeathReasons(), readServerSources(), extractServerMessageKeys(), readServerSources(), options, selectedLocale, { t }, deathReasonKey() (+19 more)

### Community 21 - "Community 21"
Cohesion: 0.20
Nodes (9): isHost, players, Props, restartGame(), { room, playerId }, self, store, { t, localizeMessage, roleName, teamName } (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.22
Nodes (8): ui-vue/index.html, compilerOptions, types, extends, include, ./tsconfig.json, ui-vue/src/**/*.ts, vite/client

### Community 23 - "Community 23"
Cohesion: 0.22
Nodes (8): compilerOptions, types, extends, include, e2e/**/*.ts, node, playwright.config.ts, ./tsconfig.json

### Community 24 - "Community 24"
Cohesion: 0.13
Nodes (14): ui-vue/src/**/*.vue, compilerOptions, types, extends, include, core/src/**/*.ts, global.d.ts, node (+6 more)

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (16): detail, { roleName, roleDescription, seerResultLabel, t }, { room, roleVisible }, seerResult, self, store, info, { room } (+8 more)

### Community 26 - "Community 26"
Cohesion: 0.05
Nodes (23): HowlEvent, MockHowl, baseRoom(), buildRoom(), RoomOverrides, localStorageMock, { mockHowlInstances, mockPlay, mockStop, mockUnload, mockOn, mockOnce, mockOff, mockLoad }, __BUNDLED_AUDIO__ (+15 more)

### Community 27 - "Community 27"
Cohesion: 0.50
Nodes (3): ImportMeta, ImportMetaEnv, *.mp3

### Community 30 - "Community 30"
Cohesion: 0.13
Nodes (13): StoredSession, toggle(), confirmingClose, isHost, logs, logsContainer, Props, { room, playerId } (+5 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (17): OkResponse, handleKick(), isLobby, isOpen, kickInLobby(), { kickMidGame, dispose }, kickMidGameAction(), phase (+9 more)

### Community 38 - "Community 38"
Cohesion: 0.17
Nodes (9): hunterShotEndsAt, now, Props, remainingSeconds, { room, roomCode, playerId }, selectedTarget, store, { t } (+1 more)

### Community 39 - "Community 39"
Cohesion: 0.09
Nodes (21): Props, Props, Props, Props, Props, { room, roomCode, playerId }, selectedTarget, store (+13 more)

### Community 48 - "Community 48"
Cohesion: 0.15
Nodes (12): NightStep, Phase, Team, dismiss(), emit, Props, { room, playerId }, store (+4 more)

### Community 53 - "Community 53"
Cohesion: 0.09
Nodes (27): RoomSummary, backToList(), closeRoom(), connect(), disconnect(), disconnectAndClearToken(), fetchRooms(), handleConnect() (+19 more)

### Community 55 - "Community 55"
Cohesion: 0.44
Nodes (7): RoomView, alertMock, capitalize(), escapeHtml(), formatPhase(), getPlayerName(), pushNotification()

## Knowledge Gaps
- **422 isolated node(s):** `IoStub`, `HowlEvent`, `RoomOverrides`, `{ mockHowlInstances, mockPlay, mockStop, mockUnload, mockOn, mockOnce, mockOff, mockLoad }`, `localStorageMock` (+417 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@shared/types` connect `Community 0` to `Community 1`, `Community 3`, `Community 5`, `Community 10`, `Community 48`, `Community 53`, `Community 55`, `Community 25`, `Community 26`, `Community 30`?**
  _High betweenness centrality (0.245) - this node is a cross-community bridge._
- **Why does `notify()` connect `Community 2` to `Community 3`, `Community 4`, `Community 5`, `Community 7`, `Community 39`, `Community 14`, `Community 15`, `Community 17`, `Community 18`, `Community 53`, `Community 21`, `Community 55`, `Community 26`, `Community 30`, `Community 31`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `IoStub`, `HowlEvent`, `RoomOverrides` to the rest of the system?**
  _422 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06782945736434108 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07902973395931143 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._