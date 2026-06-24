<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../stores/game';
import { useGameI18n } from '../composables/useGameI18n';
import { notify } from '../utils/helpers';
import LanguageSwitcher from './settings/LanguageSwitcher.vue';
import type { TypedSocket } from '../composables/useSocket';
import type { StoredSession } from '@shared/types';
import { MAX_PLAYER_NAME_LENGTH } from '@shared/constants';

interface Props {
  socket: TypedSocket;
}

const props = defineProps<Props>();
const store = useGameStore();
const { t, localizeError } = useGameI18n();

const createName = ref('');
const joinName = ref('');
const joinCode = ref('');

const { storedSession: savedSession } = storeToRefs(store);

function enterRoom(params: {
  roomCode: string;
  playerId: string;
  name: string;
  resumeToken: string;
}) {
  store.setPlayer(params.playerId, params.name, params.resumeToken);
  store.roomCode = params.roomCode;
  props.socket.emit('requestState', { roomCode: params.roomCode, playerId: params.playerId });
}

function attemptResume(saved: StoredSession) {
  if (!saved.resumeToken) {
    notify(t('app.notifications.savedSessionExpired'));
    store.clearSession();
    return;
  }
  props.socket.emit('resumePlayer', saved, (res) => {
    if (res && 'error' in res && res.error) {
      notify(localizeError(res));
      store.clearSession();
    } else {
      store.setPlayer(saved.playerId, saved.name, saved.resumeToken);
      store.roomCode = saved.roomCode;
      props.socket.emit('requestState', { roomCode: saved.roomCode, playerId: saved.playerId });
    }
  });
}

function createRoom() {
  const name = createName.value.trim();
  if (!name) return;
  props.socket.emit('createRoom', { name }, (payload) => {
    if (!payload || 'error' in payload) {
      if (payload?.error) {
        notify(localizeError(payload));
      }
      return;
    }
    if (!payload.roomCode || !payload.playerId || !payload.resumeToken) return;
    enterRoom({
      roomCode: payload.roomCode,
      playerId: payload.playerId,
      name,
      resumeToken: payload.resumeToken,
    });
  });
}

function joinRoom() {
  const name = joinName.value.trim();
  const code = joinCode.value.trim().toUpperCase();
  if (!name || code.length !== 4) return;
  props.socket.emit('joinRoom', { name, code }, (payload) => {
    if (!payload || 'error' in payload) {
      if (payload?.error) {
        notify(localizeError(payload));
      }
      return;
    }
    if (!payload.roomCode || !payload.playerId || !payload.resumeToken) return;
    enterRoom({
      roomCode: payload.roomCode,
      playerId: payload.playerId,
      name,
      resumeToken: payload.resumeToken,
    });
  });
}

function resumeSession() {
  if (savedSession.value) {
    attemptResume(savedSession.value);
  }
}
</script>

<template>
  <div class="landing-root">
    <div class="landing-lang"><LanguageSwitcher /></div>
    <section class="panel">
      <h1>{{ t('landing.title') }}</h1>
      <p>{{ t('landing.subtitle') }}</p>
      <form id="create-form" @submit.prevent="createRoom">
        <label>
          <span>{{ t('landing.yourName') }}</span>
          <input
            v-model="createName"
            name="name"
            required
            :maxlength="MAX_PLAYER_NAME_LENGTH"
            :placeholder="t('landing.namePlaceholder')"
          />
        </label>
        <button type="submit">{{ t('landing.createLobby') }}</button>
      </form>
    </section>
    <section class="panel">
      <h2>{{ t('landing.joinTitle') }}</h2>
      <form id="join-form" @submit.prevent="joinRoom">
        <label>
          <span>{{ t('landing.yourName') }}</span>
          <input v-model="joinName" name="name" required :maxlength="MAX_PLAYER_NAME_LENGTH" />
        </label>
        <label>
          <span>{{ t('landing.roomCode') }}</span>
          <input
            v-model="joinCode"
            name="code"
            required
            maxlength="4"
            placeholder="ABCD"
            style="text-transform: uppercase"
          />
        </label>
        <button type="submit">{{ t('landing.joinGame') }}</button>
      </form>
      <div
        v-if="savedSession?.resumeToken"
        style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem"
      >
        <button id="resume-btn" @click="resumeSession">
          {{
            t('landing.resumeSession', { roomCode: savedSession.roomCode, name: savedSession.name })
          }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing-root {
  position: relative;
}
.landing-lang {
  position: absolute;
  top: 0;
  right: 0;
}
@media (max-width: 480px) {
  .landing-lang {
    position: static;
    margin-bottom: 0.5rem;
  }
}
</style>
