<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '@/stores/game';
import { pushNotification, notify } from '@/utils/helpers';
import type { TypedSocket } from '@/composables/useSocket';
import type { StoredSession } from '@shared/types';

interface Props {
  socket: TypedSocket;
}

const props = defineProps<Props>();
const store = useGameStore();

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
    notify('Saved session expired. Please rejoin the room.');
    store.clearSession();
    return;
  }
  props.socket.emit('resumePlayer', saved, (res) => {
    if (res && 'error' in res && res.error) {
      notify(res.error);
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
        pushNotification(payload.error);
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
        pushNotification(payload.error);
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
  <section class="panel">
    <h1>Werewolves</h1>
    <p>Host or join a moderator-free social deduction match.</p>
    <form id="create-form" @submit.prevent="createRoom">
      <label>
        <span>Your name</span>
        <input v-model="createName" name="name" required maxlength="20" placeholder="e.g. Alex" />
      </label>
      <button type="submit">Create Lobby</button>
    </form>
  </section>
  <section class="panel">
    <h2>Join a Lobby</h2>
    <form id="join-form" @submit.prevent="joinRoom">
      <label>
        <span>Your name</span>
        <input v-model="joinName" name="name" required maxlength="20" />
      </label>
      <label>
        <span>Room code</span>
        <input
          v-model="joinCode"
          name="code"
          required
          maxlength="4"
          placeholder="ABCD"
          style="text-transform: uppercase"
        />
      </label>
      <button type="submit">Join Game</button>
    </form>
    <div
      v-if="savedSession?.resumeToken"
      style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem"
    >
      <button id="resume-btn" @click="resumeSession">
        Resume {{ savedSession.roomCode }} as {{ savedSession.name }}
      </button>
    </div>
  </section>
</template>
