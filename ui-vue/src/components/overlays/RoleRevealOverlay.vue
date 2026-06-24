<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../../stores/game';
import { ROLE_DETAILS } from '../../utils/roleDetails';
import { useGameI18n } from '../../composables/useGameI18n';

const store = useGameStore();
const { t, roleName, roleDescription } = useGameI18n();
const { room } = storeToRefs(store);

const self = computed(() => {
  if (!room.value || !store.playerId) return null;
  return room.value.players.find((p) => p.id === store.playerId) ?? null;
});

const selfRole = computed(() => room.value?.self?.role ?? null);
const info = computed(() => (selfRole.value ? ROLE_DETAILS[selfRole.value] : null));

function dismiss() {
  store.roleRevealPrompt = false;
}
</script>

<template>
  <div class="role-reveal-overlay" @click.self="dismiss">
    <div class="panel role-reveal-panel">
      <p class="role-reveal-greeting">{{ t('overlays.roleRevealGreeting') }}</p>
      <h2 class="role-reveal-name" :style="{ color: info?.color ?? '#f8fafc' }">
        {{ roleName(selfRole) }}
      </h2>
      <p class="role-reveal-description">{{ roleDescription(selfRole) }}</p>
      <p v-if="self" class="role-reveal-player-name">
        {{ t('common.player', { name: self.name }) }}
      </p>
      <button type="button" class="role-reveal-btn" @click="dismiss">
        {{ t('common.gotIt') }}
      </button>
    </div>
  </div>
</template>

<style>
.role-reveal-overlay {
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

.role-reveal-panel {
  max-width: 420px;
  width: 100%;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 16px;
  padding: 2rem 1.5rem 1.5rem;
  box-shadow: 0 10px 35px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  text-align: center;
}

.role-reveal-greeting {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  color: rgba(148, 163, 184, 0.8);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.role-reveal-name {
  margin: 0 0 1rem;
  font-size: 2.25rem;
  font-weight: 700;
  line-height: 1.1;
}

.role-reveal-description {
  margin: 0 0 1.25rem;
  font-size: 1rem;
  color: rgba(226, 232, 240, 0.85);
  line-height: 1.5;
}

.role-reveal-player-name {
  margin: 0 0 1.25rem;
  font-size: 0.85rem;
  color: rgba(148, 163, 184, 0.6);
}

.role-reveal-btn {
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

.role-reveal-btn:hover {
  background: linear-gradient(135deg, #fb923c, #f97316);
}
</style>
