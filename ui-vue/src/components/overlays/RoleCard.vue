<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../../stores/game';
import { ROLE_DETAILS } from '../../utils/roleDetails';

const store = useGameStore();
const { room, roleVisible } = storeToRefs(store);

const self = computed(() => room.value?.self || null);
const detail = computed(() => (self.value?.role ? ROLE_DETAILS[self.value.role] : null));
const seerResult = computed(() => room.value?.seerResult || null);
</script>

<template>
  <div
    v-if="self?.role && roleVisible"
    class="role-card"
    :style="{ borderColor: detail?.color || '#f8fafc', color: detail?.color || '#f8fafc' }"
  >
    <strong>{{ detail?.name || self.role }}</strong>
    <p>{{ detail?.description || '' }}</p>
    <p v-if="room?.loverName">Lover: {{ room.loverName }}</p>
    <p v-if="self.role === 'seer' && seerResult">
      Last vision: {{ seerResult.name }} is {{ seerResult.result }}.
    </p>
  </div>
</template>
