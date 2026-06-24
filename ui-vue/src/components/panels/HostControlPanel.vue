<script setup lang="ts">
/**
 * HostControlPanel
 *
 * Collapsible side panel for the host of a lobby. Mirrors the existing
 * in-lobby host-kick UX from PlayersPanel.vue, but extends it with a
 * "mid-game kick" path that uses the admin-token-gated
 * `hostMidGameKickPlayer` event. The host's regular player socket has no
 * admin token, so on a mid-game kick we lazily spin up a short-lived
 * admin socket via `useHostAdminKick` to perform the elevated action.
 *
 * Visibility: rendered only when the store reports `isHost` — regular
 * players never see this panel.
 */
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../../stores/game';
import { useGameI18n } from '../../composables/useGameI18n';
import { notify } from '../../utils/helpers';
import type { TypedSocket } from '../../composables/useSocket';
import { useHostAdminKick } from '../../composables/useHostAdminKick';

interface Props {
  socket?: TypedSocket;
}
const props = defineProps<Props>();

const store = useGameStore();
const { t, localizeError } = useGameI18n();
const { room, playerId, isHost } = storeToRefs(store);

const PANEL_OPEN_STORAGE_KEY = 'werewolves_host_panel_open';

function readStoredOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PANEL_OPEN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}
function writeStoredOpen(open: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PANEL_OPEN_STORAGE_KEY, open ? 'true' : 'false');
  } catch {
    /* storage unavailable — ignore */
  }
}

const isOpen = ref<boolean>(readStoredOpen());
watch(isOpen, (v) => writeStoredOpen(v));

const players = computed(() => room.value?.players || []);
const phase = computed(() => room.value?.phase || null);
const isLobby = computed(() => phase.value === 'lobby');

const { kickMidGame, dispose } = useHostAdminKick();
onBeforeUnmount(dispose);

function toggle() {
  isOpen.value = !isOpen.value;
}

function playerName(targetId: string): string {
  return players.value.find((p) => p.id === targetId)?.name ?? '';
}

function handleKick(targetId: string) {
  if (!room.value || !playerId.value) return;
  const name = playerName(targetId);
  const message = isLobby.value
    ? t('hostPanel.confirmKick', { name })
    : t('hostPanel.confirmKickMidGame', { name });
  if (typeof window !== 'undefined' && !window.confirm(message)) return;
  if (isLobby.value) {
    kickInLobby(targetId);
  } else {
    void kickMidGameAction(targetId, name);
  }
}

function kickInLobby(targetId: string) {
  if (!props.socket || !room.value || !playerId.value) return;
  const name = playerName(targetId);
  props.socket.emit(
    'kickPlayer',
    { roomCode: room.value.code, playerId: playerId.value, targetId },
    (res) => {
      if (res && 'error' in res && res.error) {
        notify(localizeError(res));
        return;
      }
      notify(t('hostPanel.kickSuccess', { name }));
    }
  );
}

async function kickMidGameAction(targetId: string, name: string) {
  if (!room.value || !playerId.value) return;
  const result = await kickMidGame({
    roomCode: room.value.code,
    playerId: playerId.value,
    targetId,
  });
  switch (result.kind) {
    case 'ok':
      notify(t('hostPanel.kickSuccess', { name }));
      return;
    case 'no_token': {
      const confirm = window.confirm(
        `${t('hostPanel.adminTokenMissing.title')}\n\n${t('hostPanel.adminTokenMissing.body')}\n\n${t('hostPanel.adminTokenMissing.confirm')}`
      );
      if (confirm) {
        const url = new URL(window.location.href);
        url.searchParams.set('admin', '1');
        window.location.href = url.toString();
      }
      return;
    }
    case 'invalid_token':
      notify(t('hostPanel.adminTokenInvalid'));
      return;
    case 'server_error':
    default:
      notify(t('hostPanel.kickFailed'));
  }
}
</script>

<template>
  <aside v-if="isHost" class="host-control-root" :class="{ open: isOpen }">
    <button
      type="button"
      class="host-control-toggle"
      :aria-expanded="isOpen"
      aria-controls="host-control-panel"
      :aria-label="t('hostPanel.toggleLabel')"
      :title="isOpen ? t('hostPanel.collapse') : t('hostPanel.expand')"
      data-testid="host-control-toggle"
      @click="toggle"
    >
      <span class="chev" :class="{ rotated: isOpen }" aria-hidden="true">‹</span>
    </button>

    <section
      v-if="isOpen"
      id="host-control-panel"
      class="host-control-panel panel"
      role="region"
      :aria-label="t('hostPanel.title')"
      data-testid="host-control-panel"
    >
      <h2>{{ t('hostPanel.title') }}</h2>
      <p v-if="players.length === 0" class="empty">
        {{ t('hostPanel.noPlayers') }}
      </p>
      <ul v-else class="host-control-list">
        <li
          v-for="player in players"
          :key="player.id"
          class="host-control-row"
          :class="{ self: player.id === playerId }"
        >
          <span class="name">{{ player.name }}</span>
          <button
            v-if="player.id !== playerId"
            type="button"
            class="kick"
            :data-testid="`host-control-kick-${player.id}`"
            @click="handleKick(player.id)"
          >
            {{ t('hostPanel.kick') }}
          </button>
        </li>
      </ul>
    </section>
  </aside>
</template>

<style scoped>
.host-control-root {
  position: fixed;
  right: 0;
  bottom: 1rem;
  z-index: 50;
  display: flex;
  flex-direction: row-reverse;
  align-items: flex-end;
  gap: 0.5rem;
  pointer-events: none;
}
.host-control-root > * {
  pointer-events: auto;
}

.host-control-toggle {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: #1f2937;
  color: #fff;
  border: 1px solid #374151;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
.host-control-toggle:hover {
  background: #111827;
}
.host-control-toggle .chev {
  display: inline-block;
  transition: transform 200ms ease;
}
.host-control-toggle .chev.rotated {
  transform: rotate(180deg);
}

.host-control-panel {
  width: 320px;
  max-height: 60vh;
  overflow-y: auto;
  background: rgba(17, 24, 39, 0.97);
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 1rem;
  color: #f3f4f6;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  animation: host-slide-in 200ms ease;
}
@keyframes host-slide-in {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.host-control-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.host-control-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: 4px;
  background: rgba(55, 65, 81, 0.4);
}
.host-control-row.self {
  opacity: 0.6;
}
.host-control-row .name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.host-control-row .kick {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  background: transparent;
  border: 1px solid #f87171;
  color: #f87171;
  border-radius: 4px;
  cursor: pointer;
}
.host-control-row .kick:hover {
  background: #f87171;
  color: #fff;
}
.empty {
  font-style: italic;
  opacity: 0.7;
}

@media (max-width: 480px) {
  .host-control-panel {
    width: calc(100vw - 2rem);
  }
}
</style>
