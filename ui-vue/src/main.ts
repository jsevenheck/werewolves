import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './assets/styles-app.css';
import './assets/styles.css';

const app = createApp(App);
app.use(createPinia());
app.provide('werewolvesConfig', {
  assetsBasePath: '/audio',
});
app.mount('#app');
