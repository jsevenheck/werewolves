<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../../stores/game';
import { useGameI18n } from '../../composables/useGameI18n';
import { ROLE_DETAILS } from '../../utils/roleDetails';
import LanguageSwitcher from '../settings/LanguageSwitcher.vue';
import type { TypedSocket } from '../../composables/useSocket';

interface Props {
  socket: TypedSocket;
  narratorEnabled: boolean;
  narratorUnlocked: boolean;
  narratorUnlockInProgress: boolean;
  onToggleNarrator: () => void;
  onResetNarrator: () => void;
}

const props = defineProps<Props>();
const store = useGameStore();
const { room, playerName, roleVisible } = storeToRefs(store);
const { t, roleName, roleDescription, seerResultLabel, formatRoomPhase } = useGameI18n();

const self = computed(() => room.value?.self || null);
const detail = computed(() => (self.value?.role ? ROLE_DETAILS[self.value.role] : null));
const seerResult = computed(() => room.value?.seerResult || null);

const phaseText = computed(() => (room.value ? formatRoomPhase(room.value) : ''));
const narratorLabel = computed(() => {
  return props.narratorEnabled ? t('header.narratorOn') : t('header.narratorOff');
});

function toggleRole() {
  store.toggleRole();
}

function leaveRoom() {
  if (store.roomCode && store.playerId) {
    props.socket.emit('leaveRoom', { roomCode: store.roomCode, playerId: store.playerId });
  }
  props.onResetNarrator();
  store.resetState();
  store.clearSession();
}
</script>

<template>
  <section v-if="room" class="panel">
    <div style="display: flex; flex-direction: column; gap: 0.5rem">
      <div
        style="
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          align-items: center;
          justify-content: space-between;
        "
      >
        <div>
          <h1>{{ t('header.room', { code: room.code }) }}</h1>
          <p>{{ t('header.phase', { phase: phaseText }) }}</p>
        </div>
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center">
          <LanguageSwitcher />
          <span class="tag">{{
            t('header.you', { name: playerName || t('common.unknown') })
          }}</span>
          <span v-if="self?.alive" class="tag" style="border-color: #4ade80; color: #4ade80">{{
            t('common.alive')
          }}</span>
          <span v-else class="tag" style="border-color: #ef4444; color: #ef4444">{{
            t('common.dead')
          }}</span>
          <button v-if="self?.role" id="toggle-role" type="button" @click="toggleRole">
            {{ roleVisible ? t('header.hideRole') : t('header.revealRole') }}
          </button>
          <button
            id="toggle-narrator"
            type="button"
            :disabled="narratorUnlockInProgress"
            @click="onToggleNarrator"
          >
            {{ t('header.narrator', { state: narratorLabel }) }}
          </button>
          <button id="leave-room" type="button" @click="leaveRoom">
            {{ t('header.leaveGame') }}
          </button>
        </div>
      </div>
      <div
        v-if="self?.role && roleVisible"
        class="role-card"
        :style="{ borderColor: detail?.color || '#f8fafc', color: detail?.color || '#f8fafc' }"
      >
        <strong>{{ roleName(self.role) }}</strong>
        <p>{{ roleDescription(self.role) }}</p>
        <p v-if="room.loverName">{{ t('common.lover', { name: room.loverName }) }}</p>
        <p v-if="self.role === 'seer' && seerResult">
          {{
            t('header.lastVision', {
              name: seerResult.name,
              result: seerResultLabel(seerResult.result),
            })
          }}
        </p>
      </div>
    </div>
  </section>
</template>
