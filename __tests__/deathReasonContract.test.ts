/**
 * Death-reason contract between server and client i18n.
 *
 * The server emits death reasons as raw English strings via
 * `queueDeath(room, playerId, reason)` (see deathManager / nightManager /
 * voteManager / socketHandlers hunter shot). The client maps each reason to
 * an i18n key via `deathReasonKey()` in `useGameI18n.ts`.
 *
 * This test guards against silent regressions: if a new role introduces a new
 * death reason on the server, this test fails until `deathReasonKey` (and the
 * `server.deathReasons.*` catalogs) are updated.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { deathReasonKey } from '../ui-vue/src/composables/useGameI18n';
import { de } from '../ui-vue/src/i18n/messages/de';
import { en } from '../ui-vue/src/i18n/messages/en';

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' ? flattenKeys(child, nextPrefix) : [nextPrefix];
  });
}

function readServerSources(): string[] {
  const serverRoot = path.join(process.cwd(), 'server', 'src');
  const files: string[] = [];
  function collect(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(fullPath);
    }
  }
  collect(serverRoot);
  return files.map((file) => fs.readFileSync(file, 'utf8'));
}

/**
 * Extract every literal reason string passed to `queueDeath(...)`.
 * Matches `queueDeath(room, <id>, '<reason>')` and `queueDeath(room, <id>, "<reason>")`.
 */
function extractQueueDeathReasons(): string[] {
  const pattern = /queueDeath\([^)]*,\s*['"]([^'"]+)['"]\s*\)/g;
  return Array.from(
    new Set(
      readServerSources().flatMap((source) =>
        Array.from(source.matchAll(pattern), (match) => match[1])
      )
    )
  ).sort();
}

describe('death-reason contract', () => {
  test('every server queueDeath reason has a deathReasonKey mapping', () => {
    const reasons = extractQueueDeathReasons();
    expect(reasons).not.toHaveLength(0);
    const unmapped = reasons.filter((reason) => deathReasonKey(reason) === null);
    expect(unmapped).toEqual([]);
  });

  test('every deathReasonKey target exists in EN and DE catalogs', () => {
    const englishKeys = new Set(flattenKeys(en));
    const germanKeys = new Set(flattenKeys(de));
    const reasons = extractQueueDeathReasons();
    const missing = reasons
      .map((reason) => deathReasonKey(reason))
      .filter((key): key is string => key !== null)
      .filter((key) => !englishKeys.has(key) || !germanKeys.has(key));
    expect(missing).toEqual([]);
  });
});
