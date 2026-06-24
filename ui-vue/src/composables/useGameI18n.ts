import { useI18n } from 'vue-i18n';
import type { LocalizedMessage, NightStep, Phase, Role, RoomView, Team } from '@shared/types';
import type { ErrorResponse } from '@shared/events';

const DEATH_REASON_KEYS: Record<string, string> = {
  'died of heartbreak': 'server.deathReasons.heartbreak',
  'eaten by Werewolves': 'server.deathReasons.eatenByWerewolves',
  'caught visiting the victim': 'server.deathReasons.caughtVisiting',
  'poisoned by Witch': 'server.deathReasons.poisonedByWitch',
  'executed by vote': 'server.deathReasons.executedByVote',
  'shot by Hunter': 'server.deathReasons.shotByHunter',
};

/**
 * Map a raw server-side death reason string to its i18n key.
 *
 * Exported so the server/client death-reason contract can be asserted by a
 * parity test (see `__tests__/deathReasonContract.test.ts`). Every reason
 * passed to `queueDeath(room, id, reason)` on the server MUST have a mapping
 * here, otherwise the client silently falls back to the raw English string.
 */
export function deathReasonKey(reason: string): string | null {
  return DEATH_REASON_KEYS[reason] ?? null;
}

/**
 * The set of death-reason strings the server is allowed to emit via
 * `queueDeath`. Kept in sync with `DEATH_REASON_KEYS` and asserted by the
 * `deathReasonContract` test. Exported for that test only.
 */
export const SERVER_DEATH_REASONS = Object.keys(DEATH_REASON_KEYS);

function isWerewolfResult(result: string | null | undefined) {
  return result === 'Werewolf';
}

export function useGameI18n() {
  const { t, te } = useI18n();

  function roleName(role: Role | string | null | undefined): string {
    if (!role) return t('common.unknown');
    return t(`roles.${role}.name`, role);
  }

  function roleDescription(role: Role | string | null | undefined): string {
    if (!role) return '';
    return t(`roles.${role}.description`, '');
  }

  function passiveRoleName(role: string | null | undefined): string {
    if (!role) return t('common.unknown');
    return t(`passiveRoles.${role}`, role);
  }

  function teamName(team: Team | string | null | undefined): string {
    if (!team) return t('common.unknown');
    return t(`teams.${team}`, team);
  }

  function phaseName(phase: Phase | string | null | undefined): string {
    if (!phase) return t('common.unknown');
    return t(`phases.${phase}`, phase);
  }

  function nightStepName(step: NightStep | string | null | undefined): string {
    if (!step) return t('nightSteps.night');
    return t(`nightSteps.${step}`, step);
  }

  function seerResultLabel(result: string | null | undefined): string {
    if (!result) return t('common.unknown');
    return isWerewolfResult(result) ? t('seerResults.werewolf') : t('seerResults.notWerewolf');
  }

  function localizeMessage(message: LocalizedMessage | null | undefined, fallback = ''): string {
    if (!message) return fallback;
    if (!te(message.key)) return fallback || message.key;
    const params = { ...(message.params ?? {}) };
    if (typeof params.role === 'string') {
      params.role = roleName(params.role);
    }
    if (typeof params.reason === 'string') {
      const key = deathReasonKey(params.reason);
      params.reason = key && te(key) ? t(key) : params.reason;
    }
    return t(message.key, params);
  }

  function localizeError(response: ErrorResponse): string {
    return localizeMessage(response.message, t('server.errors.unknown'));
  }

  function formatRoomPhase(room: RoomView): string {
    if (room.winner) return phaseName('ended');
    if (room.phase === 'night' && room.phaseStep) {
      return `${phaseName(room.phase)} (${nightStepName(room.phaseStep)})`;
    }
    return phaseName(room.phase);
  }

  return {
    t,
    localizeMessage,
    localizeError,
    roleName,
    roleDescription,
    passiveRoleName,
    teamName,
    phaseName,
    nightStepName,
    seerResultLabel,
    formatRoomPhase,
  };
}
