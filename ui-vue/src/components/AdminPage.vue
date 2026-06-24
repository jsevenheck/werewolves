<script setup lang="ts">
/**
 * Global Admin Console page.
 *
 * Lifecycle:
 *   1. Mount: if no token in localStorage, render the token prompt.
 *      Otherwise connect a fresh socket via `useAdminSocket`.
 *   2. On connect: emit `adminListRooms`, populate the room list, and
 *      immediately render the list view.
 *   3. Click a room → "detail" view (full player list, kick button per
 *      player, "Join as Observer" button).
 *   4. Click "Join as Observer" → emit `adminJoinRoom`. The server pushes
 *      a `roomUpdate` via `buildAdminRoomView`, which we render as the
 *      observer view (sanitized: no `self`, no roles, no role-specific
 *      fields).
 *   5. From observer view: "Leave observer view" → `adminLeaveRoom`,
 *      back to list. From detail view: "Back to room list" → list.
 *
 * Sanitization notes:
 *   - The server's `buildAdminRoomView` strips `self`, all `player.role`,
 *     `mayorId`, `seerResult`, `witchState`, `wolfVotes`, `wolfPeers`,
 *     `wolfIds`, `guardedTarget`, `harlotVisitedTarget`, `loverName`,
 *     `loversKnown`, `awaitingHunterShot` (kept as boolean pending flag
 *     only), `awaitingMayorSelection` (same), and `hunterShotEndsAt`.
 *   - This component never displays those fields, only the safe subset:
 *     `players[].{id,name,alive,connected,isHost}`,
 *     `players[].ready` (only in roleReveal),
 *     `phase`, `phaseStep`, `dayCount`, `hostId`, `code`,
 *     `minPlayers`, `phaseTransition`, `lastNightDeaths`,
 *     `lastDayDeaths`, `lastDayMessage(I18n)`, `winner`,
 *     `hunterShotPending`, `mayorSelectionPending`, `voteState.*`,
 *     `logs[]`.
 *
 * Token storage: `localStorage` key `werewolves_admin_token`. We never
 * send the token anywhere except the Socket.IO handshake.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useAdminStore } from '../stores/admin';
import { useGameI18n } from '../composables/useGameI18n';
import { useAdminSocket, type AdminSocket } from '../composables/useAdminSocket';
import LanguageSwitcher from './settings/LanguageSwitcher.vue';
import { notify } from '../utils/helpers';
import type { Phase, RoomSummary, RoomView } from '@shared/types';

type View = 'list' | 'detail' | 'observer';

const store = useAdminStore();
const { t, localizeError, localizeMessage, nightStepName, teamName } = useGameI18n();
const {
  token: _token,
  connected,
  rooms,
  roomsLoading,
  roomsError,
  selectedRoomCode,
  observingRoomCode,
  observerView,
} = storeToRefs(store);

const view = ref<View>('list');
const tokenInput = ref('');
const tokenError = ref<string | null>(null);

let socket: AdminSocket | null = null;

const selectedRoom = computed<RoomSummary | null>(() => {
  const code = selectedRoomCode.value;
  if (!code) return null;
  return rooms.value.find((room) => room.code === code) || null;
});

const observingRoom = computed<RoomView | null>(() => observerView.value);

function phaseLabel(phase: string | null | undefined): string {
  if (!phase) return t('common.unknown');
  // Phase values match Phase union; vue-i18n falls back to the raw value if
  // the key is missing, but our keys are exhaustive.
  return t(`admin.phase.${phase}` as `admin.phase.${Phase}`, phase);
}

function describeRoom(room: RoomSummary): string {
  return `${room.connectedPlayerCount}/${room.playerCount}`;
}

function handleConnect() {
  store.setConnected(true);
  fetchRooms();
}

function handleDisconnect() {
  store.setConnected(false);
  store.endObserving();
  if (view.value === 'observer') {
    view.value = 'list';
  }
}

function handleRoomUpdate(view: RoomView) {
  // Either we just joined (first push after adminJoinRoom) or we are
  // already observing. In both cases, store.updateObserverView is safe.
  if (!observingRoomCode.value) {
    // Late update before adminJoinRoom responded — ignore.
    return;
  }
  store.updateObserverView(view);
}

function handleConnectError() {
  // Server-side admin token mismatch shows up here. We surface it in the
  // UI rather than an alert: drop the rejected token so the user is
  // returned to the token prompt.
  notify(t('admin.tokenInvalid'));
  store.setConnected(false);
  store.clearToken();
  view.value = 'list';
  tokenInput.value = '';
  tokenError.value = t('admin.tokenInvalid');
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

function fetchRooms() {
  if (!socket) return;
  store.setRoomsLoading(true);
  store.setRoomsError(null);
  socket.emit('adminListRooms', {}, (response) => {
    store.setRoomsLoading(false);
    if (response && 'error' in response && response.error) {
      store.setRoomsError(localizeError(response));
      return;
    }
    if (response && 'rooms' in response) {
      store.setRooms(response.rooms);
    }
  });
}

function connect() {
  tokenError.value = null;
  const candidate = tokenInput.value.trim();
  if (!candidate) {
    tokenError.value = t('admin.tokenPrompt');
    return;
  }
  store.setToken(candidate);
  openSocket();
}

function openSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  const next = useAdminSocket({
    url: '/g/werewolves',
    adminToken: store.token,
  });
  next.on('connect', handleConnect);
  next.on('disconnect', handleDisconnect);
  next.on('roomUpdate', handleRoomUpdate);
  next.on('roomClosed', handleRoomClosed);
  next.on('connect_error', handleConnectError);
  socket = next;
}

function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  store.setConnected(false);
}

function disconnectAndClearToken() {
  disconnect();
  store.clearToken();
  view.value = 'list';
  tokenInput.value = '';
  tokenError.value = null;
}

function openDetail(roomCode: string) {
  store.selectRoom(roomCode);
  view.value = 'detail';
}

function backToList() {
  store.selectRoom(null);
  view.value = 'list';
}

function joinAsObserver(roomCode: string) {
  if (!socket) return;
  socket.emit('adminJoinRoom', { roomCode }, (response) => {
    if (response && 'error' in response && response.error) {
      notify(localizeError(response));
      return;
    }
    // The server immediately pushes the current `roomUpdate` after
    // registering us as an observer. Until that arrives we render a
    // placeholder observer view with just the code.
    store.beginObserving(roomCode, {
      code: roomCode,
      phase: 'lobby',
      phaseStep: null,
      dayCount: 0,
      players: [],
      hostId: null,
      minPlayers: 0,
      roleConfig: {
        werewolf: 0,
        seer: 0,
        hunter: 0,
        witch: 0,
        armor: 0,
        joker: 0,
        guard: 0,
        harlot: 0,
      },
      passiveRoleConfig: { mayor: false },
      mayorId: null,
      awaitingMayorSelection: false,
      mayorSelectionPending: false,
      loversKnown: false,
      loversAssigned: false,
      loverName: null,
      witchState: { healAvailable: null, poisonAvailable: null },
      wolfVotes: null,
      wolfVoteState: null,
      wolfTarget: null,
      wolfPeers: [],
      wolfIds: [],
      guardedTarget: null,
      lastGuardedTarget: null,
      harlotVisitedTarget: null,
      nextNightStep: null,
      phaseTransition: null,
      seerResult: null,
      voteState: {
        revoteFromTie: null,
        submitted: 0,
        required: 0,
        yourVote: undefined,
      },
      lastNightDeaths: [],
      lastDayDeaths: [],
      lastDayMessage: null,
      lastDayMessageI18n: null,
      awaitingHunterShot: false,
      hunterShotPending: false,
      hunterShotEndsAt: null,
      dayVoteResolved: false,
      winner: null,
      logs: [],
      self: null,
    });
    view.value = 'observer';
  });
}

function leaveObserver() {
  if (!socket || !observingRoomCode.value) {
    backToList();
    return;
  }
  const roomCode = observingRoomCode.value;
  socket.emit('adminLeaveRoom', { roomCode }, (response) => {
    if (response && 'error' in response && response.error) {
      notify(localizeError(response));
    }
    store.endObserving();
    view.value = 'list';
  });
}

function kickPlayer(targetId: string, targetName: string) {
  if (!socket || !selectedRoom.value) return;
  const roomCode = selectedRoom.value.code;
  if (!window.confirm(t('admin.kickConfirm', { name: targetName }))) return;
  socket.emit('adminKickPlayer', { roomCode, targetId }, (response) => {
    if (response && 'error' in response && response.error) {
      notify(localizeError(response));
      return;
    }
    // Refresh the list so the room reflects the new player count. The
    // `selectedRoom` computed re-derives from `rooms`, so the detail view
    // updates automatically once the new list arrives.
    fetchRooms();
  });
}

function humanizeLastDayMessage(view: RoomView): string {
  return localizeMessage(view.lastDayMessageI18n, view.lastDayMessage || '');
}

function handleRoomClosed() {
  store.endObserving();
  if (view.value === 'observer' || view.value === 'detail') {
    view.value = 'list';
  }
  fetchRooms();
}

function closeRoom(roomCode: string) {
  if (!socket) return;
  if (!window.confirm(t('admin.closeRoomConfirm'))) return;
  socket.emit('adminCloseRoom', { roomCode }, (response) => {
    if (response && 'error' in response && response.error) {
      notify(localizeError(response));
      return;
    }
    notify(t('admin.closeRoomSuccess', { code: roomCode }));
    store.endObserving();
    store.selectRoom(null);
    view.value = 'list';
    fetchRooms();
  });
}

onMounted(() => {
  if (store.hasToken) {
    openSocket();
  }
});

onBeforeUnmount(() => {
  if (socket) {
    socket.off('connect', handleConnect);
    socket.off('disconnect', handleDisconnect);
    socket.off('roomUpdate', handleRoomUpdate);
    socket.off('roomClosed', handleRoomClosed);
    socket.off('connect_error', handleConnectError);
    socket.disconnect();
    socket = null;
  }
});
</script>

<template>
  <div class="werewolves-root app admin-root">
    <!-- 1. Token prompt -->
    <section v-if="!store.hasToken" class="panel" data-testid="admin-token-prompt">
      <h1>{{ t('admin.title') }}</h1>
      <p>{{ t('admin.tokenPrompt') }}</p>
      <form @submit.prevent="connect">
        <label>
          <span>{{ t('admin.tokenLabel') }}</span>
          <input
            v-model="tokenInput"
            type="password"
            name="adminToken"
            autocomplete="off"
            data-testid="admin-token-input"
          />
        </label>
        <button type="submit" data-testid="admin-token-submit">
          {{ t('admin.tokenSubmit') }}
        </button>
      </form>
    </section>

    <!-- 2. Connected, no room open: room list.
         Rendered only when the socket is actually connected — otherwise
         the token prompt must stay on screen (e.g. after a wrong token
         submit the server rejects the socket and the user should see
         the prompt again, not an empty list). -->
    <template v-else-if="view === 'list' && connected">
      <section class="panel admin-list-panel" data-testid="admin-room-list">
        <header style="display: flex; justify-content: space-between; align-items: center">
          <h1>{{ t('admin.title') }}</h1>
          <div style="display: flex; align-items: center; gap: 0.5rem">
            <LanguageSwitcher />
            <button type="button" data-testid="admin-refresh" @click="fetchRooms">
              {{ t('admin.refresh') }}
            </button>
            <button type="button" data-testid="admin-change-token" @click="disconnectAndClearToken">
              {{ t('admin.changeToken') }}
            </button>
          </div>
        </header>
        <h2>{{ t('admin.listTitle') }}</h2>
        <p v-if="!connected">{{ t('admin.tokenInvalid') }}</p>
        <p v-if="roomsError">{{ roomsError }}</p>
        <p v-else-if="roomsLoading">…</p>
        <p v-else-if="rooms.length === 0" data-testid="admin-no-rooms">
          {{ t('admin.noRooms') }}
        </p>
        <table v-else class="admin-table">
          <thead>
            <tr>
              <th>{{ t('admin.codeHeader') }}</th>
              <th>{{ t('admin.playersHeader') }}</th>
              <th>{{ t('admin.phaseHeader') }}</th>
              <th>{{ t('admin.dayCountHeader') }}</th>
              <th>{{ t('admin.hostHeader') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="room in rooms" :key="room.code" :data-testid="`admin-room-row-${room.code}`">
              <td>
                <strong>{{ room.code }}</strong>
              </td>
              <td>{{ describeRoom(room) }}</td>
              <td>{{ phaseLabel(room.phase) }}</td>
              <td>{{ room.dayCount }}</td>
              <td>{{ room.hostName || '—' }}</td>
              <td>
                <button
                  type="button"
                  :data-testid="`admin-open-${room.code}`"
                  @click="openDetail(room.code)"
                >
                  {{ t('admin.detailTitle', { code: room.code }) }}
                </button>
                <button
                  type="button"
                  :data-testid="`admin-observe-${room.code}`"
                  @click="joinAsObserver(room.code)"
                >
                  {{ t('admin.joinAsObserver') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>

    <!-- 3. Detail view for one room -->
    <template v-else-if="view === 'detail' && selectedRoom">
      <section class="panel" data-testid="admin-room-detail">
        <header style="display: flex; justify-content: space-between; align-items: center">
          <h1>{{ t('admin.detailTitle', { code: selectedRoom.code }) }}</h1>
          <button type="button" data-testid="admin-back" @click="backToList">
            {{ t('admin.backToList') }}
          </button>
        </header>
        <dl class="admin-meta">
          <div>
            <dt>{{ t('admin.phaseHeader') }}</dt>
            <dd>{{ phaseLabel(selectedRoom.phase) }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.hostHeader') }}</dt>
            <dd>{{ selectedRoom.hostName || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.playersHeader') }}</dt>
            <dd>{{ describeRoom(selectedRoom) }}</dd>
          </div>
        </dl>
        <h2>{{ t('admin.playersHeader') }}</h2>
        <ul class="admin-players">
          <li
            v-for="player in selectedRoom?.players || []"
            :key="player.id"
            :data-testid="`admin-player-${player.id}`"
          >
            <span class="player-name">
              <strong>{{ player.name }}</strong>
              <span v-if="player.isHost" class="player-meta"> ({{ t('common.host') }})</span>
              <span v-if="!player.alive" class="player-meta"> ({{ t('common.dead') }})</span>
              <span v-if="!player.connected" class="player-meta">
                ({{ t('common.disconnected') }})</span
              >
            </span>
            <button
              type="button"
              class="kick-btn"
              :data-testid="`admin-kick-${player.id}`"
              :aria-label="t('admin.kickAriaLabel', { name: player.name })"
              @click="kickPlayer(player.id, player.name)"
            >
              {{ t('admin.kick') }}
            </button>
          </li>
        </ul>
        <div style="margin-top: 1rem">
          <button
            type="button"
            class="admin-close-room"
            data-testid="admin-close-room"
            @click="closeRoom(selectedRoom.code)"
          >
            {{ t('admin.closeRoom') }}
          </button>
        </div>
      </section>
    </template>

    <!-- 4. Live observer view of a single room -->
    <template v-else-if="view === 'observer' && observingRoom">
      <section class="panel" data-testid="admin-observer-view">
        <header style="display: flex; justify-content: space-between; align-items: center">
          <h1>{{ t('admin.observerViewTitle', { code: observingRoom.code }) }}</h1>
          <button type="button" data-testid="admin-back" @click="leaveObserver">
            {{ t('admin.leaveRoom') }}
          </button>
        </header>
        <dl class="admin-meta">
          <div>
            <dt>{{ t('admin.phaseHeader') }}</dt>
            <dd>
              {{ phaseLabel(observingRoom.phase) }}
              <span v-if="observingRoom.phase === 'night' && observingRoom.phaseStep">
                ({{ nightStepName(observingRoom.phaseStep) }})
              </span>
            </dd>
          </div>
          <div>
            <dt>{{ t('admin.dayCountHeader') }}</dt>
            <dd>{{ observingRoom.dayCount }}</dd>
          </div>
          <div v-if="observingRoom.winner">
            <dt>{{ t('gameOver.winner') }}</dt>
            <dd>{{ teamName(observingRoom.winner.team) }}</dd>
          </div>
        </dl>
        <p class="observer-hint">
          <em>{{ t('admin.observerHint') }}</em>
        </p>
        <p v-if="observingRoom.lastDayMessage" class="last-day-message">
          {{ humanizeLastDayMessage(observingRoom) }}
        </p>
        <ul class="admin-players">
          <li
            v-for="player in observingRoom.players"
            :key="player.id"
            :data-testid="`observer-player-${player.id}`"
          >
            <span class="player-name">
              <strong>{{ player.name }}</strong>
              <span v-if="player.isHost" class="player-meta"> ({{ t('common.host') }})</span>
              <span v-if="!player.alive" class="player-meta"> ({{ t('common.dead') }})</span>
              <span v-if="!player.connected" class="player-meta">
                ({{ t('common.disconnected') }})</span
              >
            </span>
          </li>
        </ul>
      </section>
    </template>

    <!-- 5. Fallback: nothing selected (e.g. server dropped our observation). -->
    <section v-else class="panel">
      <p>{{ t('admin.actionFailed') }}</p>
      <button type="button" @click="backToList">{{ t('admin.backToList') }}</button>
    </section>
  </div>
</template>

<style scoped>
.admin-root {
  padding: 1.5rem 1rem 3rem;
}

/* Header: title + actions get room to breathe, separated from the body. */
.admin-root header {
  gap: 1rem 1.25rem;
  flex-wrap: wrap;
  padding-bottom: 1.25rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
}
.admin-root header h1 {
  margin: 0;
  font-size: 1.55rem;
  letter-spacing: -0.01em;
}
.admin-root h2 {
  margin: 1.75rem 0 0.85rem;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.85);
}

/* Meta rows (phase / host / players / day) as an aligned definition grid. */
.admin-meta {
  display: grid;
  gap: 0.55rem;
  margin: 0;
}
.admin-meta div {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}
.admin-meta dt {
  flex: 0 0 7rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.8);
}
.admin-meta dd {
  margin: 0;
  font-weight: 600;
}

/* Room list table. */
.admin-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.75rem;
}
.admin-table th {
  text-align: left;
  padding: 0.5rem 0.85rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.8);
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
}
.admin-table td {
  padding: 0.85rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  vertical-align: middle;
}
.admin-table tbody tr {
  transition: background 0.15s ease;
}
.admin-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.035);
}
.admin-table th:last-child,
.admin-table td:last-child {
  text-align: right;
  white-space: nowrap;
}

/* Player lists (detail + observer) as spaced cards. */
.admin-players {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.admin-players li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.95rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(148, 163, 184, 0.18);
}
.admin-players .player-meta {
  color: rgba(148, 163, 184, 0.85);
  font-weight: 400;
}

/* Red kick button matching the lobby host control. */
.admin-root .kick-btn {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.3rem 0.75rem;
  border-radius: 8px;
  background: transparent;
  border: 1px solid #f87171;
  color: #f87171;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.admin-root .kick-btn:hover {
  background: #f87171;
  color: #0b1120;
}

.observer-hint {
  color: rgba(148, 163, 184, 0.85);
}
.last-day-message {
  padding: 0.75rem 0.95rem;
  border-radius: 10px;
  background: rgba(248, 197, 144, 0.08);
  border: 1px solid rgba(248, 197, 144, 0.25);
}

.admin-table td button + button {
  margin-left: 0.5rem;
}
.admin-close-room {
  background: transparent;
  border: 1px solid #ef4444;
  color: #ef4444;
  padding: 0.4rem 0.75rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.admin-close-room:hover {
  background: #ef4444;
  color: #fff;
}
</style>
