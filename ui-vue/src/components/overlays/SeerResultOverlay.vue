<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useGameStore } from '../../stores/game';
import { useGameI18n } from '../../composables/useGameI18n';
import type { TypedSocket } from '../../composables/useSocket';

interface Props {
  socket: TypedSocket;
  result: { name: string; result: string };
}

const props = defineProps<Props>();
const emit = defineEmits<{ dismiss: [] }>();

const { t, seerResultLabel } = useGameI18n();
const store = useGameStore();
const { room, playerId } = storeToRefs(store);

const isWerewolf = props.result.result === 'Werewolf';

function dismiss() {
  if (!room.value || !playerId.value) return;
  props.socket.emit('seerContinue', { roomCode: room.value.code, playerId: playerId.value });
  emit('dismiss');
}
</script>

<template>
  <div class="seer-result-overlay" @click.self="dismiss">
    <div class="panel seer-result-panel">
      <p class="seer-result-greeting">{{ t('overlays.seerGreeting') }}</p>
      <h2 class="seer-result-name">{{ result.name }}</h2>
      <p
        class="seer-result-alignment"
        :class="isWerewolf ? 'seer-result-wolf' : 'seer-result-safe'"
      >
        {{ seerResultLabel(result.result) }}
      </p>
      <button type="button" class="seer-result-btn" @click="dismiss">
        {{ t('common.gotIt') }}
      </button>
    </div>
  </div>
</template>

<style>
.seer-result-overlay {
  position: fixed;
  inset: 0;
  background: rgba(3, 7, 18, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  z-index: 100;
  font-family: 'Space Grotesk', 'Avenir Next', 'Segoe UI', sans-serif;
  color: #f8fafc;
}

.seer-result-panel {
  max-width: 380px;
  width: 100%;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 16px;
  padding: 2rem 1.5rem 1.5rem;
  box-shadow: 0 10px 35px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  text-align: center;
}

.seer-result-greeting {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  color: rgba(148, 163, 184, 0.8);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.seer-result-name {
  margin: 0 0 0.75rem;
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.1;
}

.seer-result-alignment {
  margin: 0 0 1.5rem;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.seer-result-wolf {
  color: #ef4444;
}

.seer-result-safe {
  color: #4ade80;
}

.seer-result-btn {
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  padding: 0.65rem 1.5rem;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #f97316, #ea580c);
  color: #fff;
  width: 100%;
}

.seer-result-btn:hover {
  background: linear-gradient(135deg, #fb923c, #f97316);
}
</style>
