<script setup lang="ts">
import { computed, watch, nextTick, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '@/stores/game';

const store = useGameStore();
const { room } = storeToRefs(store);
const logsContainer = ref<HTMLElement | null>(null);

const logs = computed(() => room.value?.logs || []);

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

watch(logs, () => {
  nextTick(() => {
    if (logsContainer.value) {
      logsContainer.value.scrollTop = logsContainer.value.scrollHeight;
    }
  });
});
</script>

<template>
  <section v-if="room" id="logs-panel" class="panel">
    <h2>Events</h2>
    <div ref="logsContainer" class="logs">
      <template v-if="logs.length">
        <div v-for="(log, i) in logs" :key="i">{{ formatTime(log.ts) }} - {{ log.text }}</div>
      </template>
      <p v-else>No events yet.</p>
    </div>
  </section>
</template>
