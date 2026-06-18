import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useGameStore } from '../stores/game';
import { createNarrator } from '../utils/narrator';
import type { Narrator } from '../utils/narrator';
import { notify } from '../utils/helpers';
import type { RoomView } from '@shared/types';

const NARRATOR_UNLOCK_COOLDOWN_MS = 1500;

export function useNarrator(assetsBasePath?: string) {
  const store = useGameStore();
  const { t } = useI18n();
  const { room, roomCode } = storeToRefs(store);

  const narrator: Narrator = createNarrator({
    notify: (message) => {
      notify(t(`app.notifications.${message}`));
    },
    assetsBasePath,
  });
  const storageKey = 'werewolves_narrator_enabled';

  const enabled = ref(false);
  const unlocked = ref(false);
  const unlockInProgress = ref(false);
  let unlockToken = 0;
  let lastUnlockAttemptAt = 0;
  let gestureBound = false;
  let gestureHandler: (() => void) | null = null;

  function clearNarratorPreference() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage errors (private mode, etc.)
    }
  }

  // Narrator should default to off for every new room/session.
  clearNarratorPreference();
  narrator.setEnabled(false);
  enabled.value = narrator.isEnabled();
  unlocked.value = narrator.isUnlocked();

  // Watch room changes for narration
  let previousRoom: RoomView | null = null;
  watch(room, (newRoom) => {
    if (newRoom) {
      narrator.handleRoomUpdate(previousRoom, newRoom);
      previousRoom = newRoom;
    }
  });
  // Reset narrator whenever the player switches rooms or leaves.
  watch(roomCode, (next, prev) => {
    if (next === prev) return;
    clearNarratorPreference();
    narrator.setEnabled(false);
    enabled.value = narrator.isEnabled();
    unlocked.value = narrator.isUnlocked();
    unlockInProgress.value = false;
    unlockToken += 1;
    lastUnlockAttemptAt = 0;
    previousRoom = null;
  });

  async function attemptUnlock(force = false) {
    if (unlockInProgress.value) return;
    if (!narrator.isEnabled() || narrator.isUnlocked()) return;
    const now = Date.now();
    if (!force && now - lastUnlockAttemptAt < NARRATOR_UNLOCK_COOLDOWN_MS) return;
    lastUnlockAttemptAt = now;
    unlockInProgress.value = true;
    const currentToken = ++unlockToken;
    try {
      const result = await narrator.unlock();
      if (currentToken !== unlockToken) return;
      if (!result) {
        notify(t('app.notifications.tapAgainEnableAudio'));
        narrator.setEnabled(false);
        enabled.value = narrator.isEnabled();
        unlocked.value = narrator.isUnlocked();
        return;
      }
      narrator.setEnabled(true);
      narrator.announceLatest();
      enabled.value = narrator.isEnabled();
      unlocked.value = narrator.isUnlocked();
    } finally {
      if (currentToken === unlockToken) {
        unlockInProgress.value = false;
      }
    }
  }

  async function toggle() {
    if (narrator.isEnabled()) {
      narrator.setEnabled(false);
      enabled.value = false;
      unlocked.value = narrator.isUnlocked();
      return;
    }

    narrator.setEnabled(true);
    enabled.value = true;
    const snapshot = room.value;
    if (snapshot) {
      narrator.handleRoomUpdate(null, snapshot);
    }
    await attemptUnlock(true);
  }

  function resetNarrator() {
    clearNarratorPreference();
    narrator.setEnabled(false);
    enabled.value = narrator.isEnabled();
    unlocked.value = narrator.isUnlocked();
    unlockInProgress.value = false;
    unlockToken += 1;
    lastUnlockAttemptAt = 0;
  }

  function bindGestureUnlock() {
    if (gestureBound) return;
    gestureBound = true;
    gestureHandler = () => {
      void attemptUnlock(false);
    };
    document.addEventListener('pointerdown', gestureHandler);
  }

  function cleanupNarrator() {
    if (gestureHandler) {
      document.removeEventListener('pointerdown', gestureHandler);
      gestureHandler = null;
      gestureBound = false;
    }
  }

  return {
    enabled,
    unlocked,
    unlockInProgress,
    toggle,
    resetNarrator,
    bindGestureUnlock,
    cleanupNarrator,
  };
}
