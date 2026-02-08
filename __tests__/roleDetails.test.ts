import { ROLE_DETAILS, PASSIVE_ROLE_DETAILS, getRoleName } from '../ui-vue/src/utils/roleDetails';

describe('roleDetails', () => {
  test('exposes details for all playable roles', () => {
    expect(ROLE_DETAILS.werewolf.name).toBe('Werewolf');
    expect(ROLE_DETAILS.villager.name).toBe('Villager');
    expect(ROLE_DETAILS.harlot.description).toContain('successfully kill');
  });

  test('exposes passive role names', () => {
    expect(PASSIVE_ROLE_DETAILS.mayor.name).toBe('Mayor');
  });

  test('getRoleName resolves known roles and falls back safely', () => {
    expect(getRoleName('seer')).toBe('Seer');
    expect(getRoleName('customRole')).toBe('customRole');
    expect(getRoleName(undefined)).toBe('Unknown');
  });
});
