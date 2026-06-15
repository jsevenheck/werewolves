<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../../stores/game';
import { ROLE_DETAILS } from '../../utils/roleDetails';
import { useGameI18n } from '../../composables/useGameI18n';

const store = useGameStore();
const { roleName, roleDescription, seerResultLabel, t } = useGameI18n();
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
    <strong>{{ roleName(self.role) }}</strong>
    <p>{{ roleDescription(self.role) }}</p>
    <p v-if="room?.loverName">{{ t('common.lover', { name: room.loverName }) }}</p>
    <p v-if="self.role === 'seer' && seerResult">
      {{
        t('header.lastVision', {
          name: seerResult.name,
          result: seerResultLabel(seerResult.result),
        })
      }}
    </p>
  </div>
</template>
