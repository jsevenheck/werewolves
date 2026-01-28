/**
 * Legacy Vue plugin installer for standalone use.
 *
 * Creates its own Pinia instance and registers the game component globally.
 * Do NOT use this when embedded in the game-hub; the hub provides Pinia.
 */
import { type App } from 'vue';
import { createPinia } from 'pinia';
import WerewolvesGameRoot from './App.vue';
import type { WerewolvesGameConfig } from './types/config';

export function installWerewolvesGame(app: App, config: WerewolvesGameConfig = {}) {
  const pinia = createPinia();
  app.use(pinia);

  app.component('WerewolvesGame', WerewolvesGameRoot);

  app.provide('werewolvesConfig', config);
}
