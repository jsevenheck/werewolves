/**
 * Standalone web entry point.
 *
 * This is a THIN wrapper that:
 * 1. Creates a Vue app instance
 * 2. Installs Pinia (required before using GameComponent)
 * 3. Renders the GameComponent from ui-vue with standalone props
 *
 * In embedded mode (game-hub), the hub app creates the Vue app and installs
 * Pinia. The ui-vue module NEVER installs Pinia itself to avoid duplicate
 * store instances.
 */
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { GameComponent } from '../../ui-vue/src/index';
import '../../ui-vue/src/assets/styles-standalone.css';
import '../../ui-vue/src/assets/styles.css';

// Parse URL params for session/token (useful for testing embedded-like flow)
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('sessionId') || '';
const joinToken = urlParams.get('joinToken') || '';

// In standalone mode, we connect to /g/werewolves namespace
// The server URL is inferred from the current origin
const wsNamespace = '/g/werewolves';

const app = createApp({
  render() {
    return h(GameComponent, {
      // Standalone mode props
      standalone: true,
      // Socket connection config
      socketUrl: '', // Empty = same origin
      socketPath: '/socket.io',
      wsNamespace,
      // Hub integration props (can be passed via URL for testing)
      sessionId,
      joinToken,
      // Use bundled narrator audio by default.
      // For runtime custom overrides, pass `assetsBasePath: '/audio'`.
    });
  },
});

// Install Pinia BEFORE mounting (required for GameComponent's stores)
const pinia = createPinia();
app.use(pinia);

app.mount('#app');

console.log('[standalone-web] Mounted GameComponent');
console.log('[standalone-web] Namespace:', wsNamespace);
if (sessionId) console.log('[standalone-web] SessionId:', sessionId);
if (joinToken) console.log('[standalone-web] JoinToken:', joinToken);
