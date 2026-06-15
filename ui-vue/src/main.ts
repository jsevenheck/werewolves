import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { i18n, initializeLocale } from './i18n';
import type { WerewolvesGameConfig } from './types/config';
import './assets/styles-app.css';
import './assets/styles.css';

const werewolvesConfig: Partial<WerewolvesGameConfig> = {
  assetsBasePath: '/audio',
};

initializeLocale(werewolvesConfig.defaultLocale);

const app = createApp(App);
app.use(createPinia());
app.use(i18n);
app.provide('werewolvesConfig', werewolvesConfig);
app.mount('#app');
