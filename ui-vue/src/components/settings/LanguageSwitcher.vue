<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { getCurrentLocale, setLocale } from '../../i18n';
import type { SupportedLocale } from '../../i18n/types';

const { t } = useI18n();

const options: { code: SupportedLocale; labelKey: string }[] = [
  { code: 'en', labelKey: 'language.english' },
  { code: 'de', labelKey: 'language.german' },
];

const selectedLocale = computed({
  get: () => getCurrentLocale(),
  set: (locale: SupportedLocale) => setLocale(locale),
});
</script>

<template>
  <label class="language-switcher">
    <span class="language-switcher-label">{{ t('language.label') }}</span>
    <select v-model="selectedLocale" class="language-switcher-select" name="locale">
      <option v-for="option in options" :key="option.code" :value="option.code">
        {{ t(option.labelKey) }}
      </option>
    </select>
  </label>
</template>

<style scoped>
.language-switcher {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.language-switcher-label {
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.8);
}

.language-switcher-select {
  min-width: 7rem;
}
</style>
