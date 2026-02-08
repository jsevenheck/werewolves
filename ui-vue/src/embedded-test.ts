import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { GameComponent } from './index';
import './assets/styles-standalone.css';
import './assets/styles.css';

const params = new URLSearchParams(window.location.search);
const sessionId = params.get('sessionId') || 'embedded-session';
const playerId = params.get('playerId') || 'embedded-player';
const playerName = params.get('playerName') || 'Embedded Player';
const joinToken = params.get('joinToken') || 'embedded-token';
const autoFixOnRetry = params.get('autoFixOnRetry') === '1';
const initialSocketPath = params.get('socketPath') || '/socket.io';

const socketPath = ref(initialSocketPath);
const mountKey = ref(0);

if (autoFixOnRetry && initialSocketPath !== '/socket.io') {
  window.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (target.textContent?.trim() !== 'Retry') return;
      if (socketPath.value === '/socket.io') return;

      // Let App.vue run its internal retry handler first, then remount with valid socket path.
      window.setTimeout(() => {
        socketPath.value = '/socket.io';
        mountKey.value += 1;
      }, 0);
    },
    true
  );
}

const app = createApp({
  render() {
    return h(GameComponent, {
      key: mountKey.value,
      standalone: false,
      wsNamespace: '/g/werewolves',
      socketPath: socketPath.value,
      socketUrl: '',
      sessionId,
      playerId,
      playerName,
      joinToken,
      assetsBasePath: '/audio',
    });
  },
});

app.use(createPinia());
app.mount('#app');
