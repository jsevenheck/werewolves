# Graph Report - werewolves (2026-06-15)

## Corpus Check

- 93 files · ~47,183 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary

- 583 nodes · 1104 edges · 44 communities (39 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness

- Built from commit: `509b1313`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)

- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]

## God Nodes (most connected - your core abstractions)

1. `setupSocketHandlers()` - 38 edges
2. `Room` - 21 edges
3. `Narrator` - 20 edges
4. `resolveDeaths()` - 19 edges
5. `schedulePhaseTransition()` - 19 edges
6. `addLog()` - 19 edges
7. `createLobbyWithPlayers()` - 18 edges
8. `broadcastRoom()` - 18 edges
9. `closeContexts()` - 16 edges
10. `scripts` - 15 edges

## Surprising Connections (you probably didn't know these)

- `useSocket()` --calls--> `io` [INFERRED]
  ui-vue/src/composables/useSocket.ts → server/src/index.ts
- `GameState` --references--> `RoomView` [EXTRACTED]
  ui-vue/src/stores/game.ts → core/src/types.ts
- `GameState` --references--> `StoredSession` [EXTRACTED]
  ui-vue/src/stores/game.ts → core/src/types.ts
- `ClientToServerEvents` --references--> `PassiveRoleConfig` [EXTRACTED]
  core/src/events.ts → core/src/types.ts
- `ClientToServerEvents` --references--> `RoleConfig` [EXTRACTED]
  core/src/events.ts → core/src/types.ts

## Import Cycles

- None detected.

## Communities (44 total, 5 thin omitted)

### Community 0 - "Community 0"

Cohesion: 0.10
Nodes (55): PLAYER_ID, RESUME_TOKEN, ROOM_CODE, detachSocketFromRoom(), ensureActingHost(), pendingDisconnects, setupSocketHandlers(), updateHostIfNeeded() (+47 more)

### Community 1 - "Community 1"

Cohesion: 0.08
Nodes (40): getRoleName(), mapRolesToPages(), advanceToDay(), AdvanceToDayResult, closeContexts(), completeMayorElection(), configureRoles(), createLobbyWithPlayers() (+32 more)

### Community 2 - "Community 2"

Cohesion: 0.06
Nodes (27): BUNDLED_AUDIO, getBundledAudioUrl(), useNarrator(), HowlEvent, MockHowl, RoomView, StoredSession, GameState (+19 more)

### Community 3 - "Community 3"

Cohesion: 0.08
Nodes (30): DEFAULT_PASSIVE_ROLE_CONFIG, DEFAULT_ROLE_CONFIG, ROLE_INFO, RoleInfo, assignRoles(), normalizeRoleConfig(), validateCounts(), LoverPair (+22 more)

### Community 4 - "Community 4"

Cohesion: 0.05
Nodes (30): aliveTargets, aliveWitchTargets, currentWolfVote, durationSeconds, guardTargets, harlotTargets, healedText, isGuard (+22 more)

### Community 5 - "Community 5"

Cohesion: 0.07
Nodes (23): attemptResume(), dayResults, hasRoom, hunterPrompt, hunterShotPending, isHost, mayorName, mayorPrompt (+15 more)

### Community 6 - "Community 6"

Cohesion: 0.10
Nodes (20): dependencies, howler, pinia, socket.io-client, vue, devDependencies, @types/howler, typescript (+12 more)

### Community 7 - "Community 7"

Cohesion: 0.11
Nodes (14): awaitingActions, dayVoteResolved, eligible, filtered, hasVoted, isHost, isRevote, lastDayDeaths (+6 more)

### Community 8 - "Community 8"

Cohesion: 0.11
Nodes (19): devDependencies, concurrently, eslint, eslint-config-prettier, @eslint/js, eslint-plugin-prettier, eslint-plugin-vue, @playwright/test (+11 more)

### Community 9 - "Community 9"

Cohesion: 0.11
Nodes (17): compilerOptions, baseUrl, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module (+9 more)

### Community 10 - "Community 10"

Cohesion: 0.12
Nodes (11): TypedSocket, useSocket(), ErrorResponse, InterServerEvents, OkResponse, SocketData, app, io (+3 more)

### Community 11 - "Community 11"

Cohesion: 0.12
Nodes (16): compilerOptions, baseUrl, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmit (+8 more)

### Community 12 - "Community 12"

Cohesion: 0.13
Nodes (15): scripts, build, build:client, build:server, dev, dev:client, dev:server, format (+7 more)

### Community 13 - "Community 13"

Cohesion: 0.14
Nodes (13): author, description, directories, doc, engines, node, keywords, license (+5 more)

### Community 14 - "Community 14"

Cohesion: 0.17
Nodes (8): eligible, hasVoted, isHost, isRevote, required, showVoteProgress, submitted, yourVote

### Community 15 - "Community 15"

Cohesion: 0.17
Nodes (9): allReady, info, isHost, isSelfReady, readyCount, readyDisabled, self, selfRole (+1 more)

### Community 16 - "Community 16"

Cohesion: 0.18
Nodes (10): compilerOptions, module, moduleResolution, noEmit, outDir, rootDir, target, types (+2 more)

### Community 17 - "Community 17"

Cohesion: 0.28
Nodes (6): emitConfig(), needsAdjust, onPassiveRoleChange(), onRoleChange(), playersCount, villagerSlots

### Community 18 - "Community 18"

Cohesion: 0.25
Nodes (5): alivePlayers, isArmor, isHost, loverA, loverB

### Community 19 - "Community 19"

Cohesion: 0.29
Nodes (4): detail, narratorLabel, phaseText, seerResult

### Community 20 - "Community 20"

Cohesion: 0.33
Nodes (6): dependencies, express, howler, nanoid, socket.io, socket.io-client

### Community 21 - "Community 21"

Cohesion: 0.40
Nodes (3): isHost, players, winner

### Community 22 - "Community 22"

Cohesion: 0.40
Nodes (4): compilerOptions, types, extends, include

### Community 23 - "Community 23"

Cohesion: 0.40
Nodes (4): compilerOptions, types, extends, include

### Community 24 - "Community 24"

Cohesion: 0.40
Nodes (4): compilerOptions, types, extends, include

### Community 26 - "Community 26"

Cohesion: 0.67
Nodes (3): overrides, diff, esbuild

## Knowledge Gaps

- **256 isolated node(s):** `IoStub`, `HowlEvent`, `RoomOverrides`, `{ mockHowlInstances, mockPlay, mockStop, mockUnload, mockOn, mockOnce, mockOff, mockLoad }`, `localStorageMock` (+251 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `RoomView` connect `Community 2` to `Community 0`, `Community 10`, `Community 3`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `IoStub`, `HowlEvent`, `RoomOverrides` to the rest of the system?**
  _256 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09903026741110785 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08317307692307692 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05737704918032787 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.07878787878787878 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
