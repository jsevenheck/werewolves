import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '@/stores/game';
import { createNarrator } from '@/utils/narrator';
import type { Narrator } from '@/utils/narrator';
import { notify } from '@/utils/helpers';
import type { RoomView } from '@shared/types';

const NARRATOR_UNLOCK_COOLDOWN_MS = 1500;

export function useNarrator() {
  const store = useGameStore();
  const { room } = storeToRefs(store);

  const narrator: Narrator = createNarrator({ notify });

  const enabled = ref(false);
  const unlocked = ref(false);
  const unlockInProgress = ref(false);
  let unlockToken = 0;
  let lastUnlockAttemptAt = 0;
  let gestureBound = false;

  // Initialize from storage
  narrator.initFromStorage();
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
        notify('Tap again to enable audio.');
        enabled.value = narrator.isEnabled();
        unlocked.value = narrator.isUnlocked();
        return;
      }
      narrator.setEnabled(true);
      narrator.announceLatest();
      enabled.value = narrator.isEnabled();
      unlocked.value = narrator.isUnlocked();
    } finally {
      if (currentToken !== unlockToken) return;
      unlockInProgress.value = false;
    }
  }

  async function toggle() {
    if (narrator.isEnabled() && narrator.isUnlocked()) {
      narrator.setEnabled(false);
      enabled.value = false;
      unlocked.value = narrator.isUnlocked();
      return;
    }

    if (!narrator.isEnabled()) {
      narrator.setEnabled(true);
      enabled.value = true;
    }

    await attemptUnlock(true);
  }

  function resetNarrator() {
    unlockInProgress.value = false;
    unlockToken += 1;
    lastUnlockAttemptAt = 0;
  }

  function bindGestureUnlock() {
    if (gestureBound) return;
    gestureBound = true;
    document.addEventListener('pointerdown', () => {
      void attemptUnlock(false);
    });
  }

  return {
    enabled,
    unlocked,
    unlockInProgress,
    toggle,
    resetNarrator,
    bindGestureUnlock
  };
}
