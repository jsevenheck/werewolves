import { type App } from 'vue';
import { createPinia } from 'pinia';
import WerewolvesGameRoot from './App.vue';
import type { WerewolvesGameConfig } from './types/config';
import './assets/styles.css';

export function installWerewolvesGame(app: App, config: WerewolvesGameConfig = {}) {
  const pinia = createPinia();
  app.use(pinia);

  app.component('WerewolvesGame', WerewolvesGameRoot);

  app.provide('werewolvesConfig', config);
}

export { WerewolvesGameRoot };
export type { WerewolvesGameConfig };
export type { RoomView, Player, Role } from '@shared/types';
export type { ClientToServerEvents, ServerToClientEvents } from '@shared/events';
