import { useI18n } from 'vue-i18n';
import type { LocalizedMessage, NightStep, Phase, Role, RoomView, Team } from '@shared/types';
import type { ErrorResponse } from '@shared/events';

function isWerewolfResult(result: string | null | undefined) {
  return result === 'Werewolf';
}

function deathReasonKey(reason: string): string | null {
  switch (reason) {
    case 'died of heartbreak':
      return 'server.deathReasons.heartbreak';
    case 'eaten by Werewolves':
      return 'server.deathReasons.eatenByWerewolves';
    case 'caught visiting the victim':
      return 'server.deathReasons.caughtVisiting';
    case 'poisoned by Witch':
      return 'server.deathReasons.poisonedByWitch';
    case 'executed by vote':
      return 'server.deathReasons.executedByVote';
    case 'shot by Hunter':
      return 'server.deathReasons.shotByHunter';
    default:
      return null;
  }
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
    return localizeMessage(response.message, response.error);
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
