<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '@/stores/game';
import { escapeHtml, formatPhase } from '@/utils/helpers';
import type { TypedSocket } from '@/composables/useSocket';

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
const { room, playerId, playerName, roleVisible } = storeToRefs(store);

const ROLE_DETAILS: Record<string, { name: string; description: string; color: string }> = {
  werewolf: { name: 'Werewolf', description: 'Coordinate at night to eat one villager.', color: '#ef4444' },
  seer: { name: 'Seer', description: 'Inspect a player each night to learn if they are a Werewolf.', color: '#22d3ee' },
  hunter: { name: 'Hunter', description: 'When you die, immediately shoot someone else.', color: '#f97316' },
  witch: { name: 'Witch', description: 'Single-use heal & poison potions. You may use both in the same night.', color: '#a855f7' },
  armor: { name: 'Armor', description: 'Before the first night, link two Lovers forever.', color: '#38bdf8' },
  joker: { name: 'Joker', description: 'Get voted out during the day to win instantly.', color: '#facc15' },
  guard: { name: 'Guard', description: 'Each night protect one player from all attacks.', color: '#10b981' },
  harlot: { name: 'Harlot', description: 'Visit a player each night. If wolves attack them, you die too.', color: '#ec4899' },
  villager: { name: 'Villager', description: 'Use your wits during the day. No special powers.', color: '#cbd5f5' }
};

const self = computed(() => room.value?.self || null);
const detail = computed(() => self.value?.role ? ROLE_DETAILS[self.value.role] : null);
const hostPlayer = computed(() => room.value?.players.find((p) => p.id === room.value?.hostId) || null);
const seerResult = computed(() => room.value?.seerResult || null);

const phaseText = computed(() => room.value ? formatPhase(room.value) : '');
const narratorLabel = computed(() => {
  if (props.narratorEnabled) {
    return props.narratorUnlocked ? 'On' : 'Tap to enable audio';
  }
  return 'Off';
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
    <div style="display:flex;flex-direction:column;gap:.5rem;">
      <div style="display:flex;flex-wrap:wrap;gap:1rem;align-items:center;justify-content:space-between;">
        <div>
          <h1>Room {{ room.code }}</h1>
          <p>Phase: {{ phaseText }}</p>
        </div>
        <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;">
          <span class="tag">You: {{ playerName || 'Unknown' }}</span>
          <span v-if="self?.alive" class="tag" style="border-color:#4ade80;color:#4ade80;">Alive</span>
          <span v-else class="tag" style="border-color:#ef4444;color:#ef4444;">Dead</span>
          <button v-if="self?.role" id="toggle-role" type="button" @click="toggleRole">
            {{ roleVisible ? 'Hide Role' : 'Reveal Role' }}
          </button>
          <button
            id="toggle-narrator"
            type="button"
            :disabled="narratorUnlockInProgress"
            @click="onToggleNarrator"
          >
            Narrator: {{ narratorLabel }}
          </button>
          <button id="leave-room" type="button" @click="leaveRoom">Leave Game</button>
        </div>
      </div>
      <div
        v-if="self?.role && roleVisible"
        class="role-card"
        :style="{ borderColor: detail?.color || '#f8fafc', color: detail?.color || '#f8fafc' }"
      >
        <strong>{{ detail?.name || self.role }}</strong>
        <p>{{ detail?.description || '' }}</p>
        <p v-if="room.loverName">Lover: {{ room.loverName }}</p>
        <p v-if="self.role === 'seer' && seerResult">
          Last vision: {{ seerResult.name }} is {{ seerResult.result }}.
        </p>
      </div>
    </div>
  </section>
</template>
