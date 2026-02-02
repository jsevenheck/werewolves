import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './assets/styles-standalone.css';
import './assets/styles.css';

const app = createApp(App);
app.use(createPinia());
app.provide('werewolvesConfig', {
  wsNamespace: '/g/werewolves',
  standalone: true,
});
app.mount('#app');
