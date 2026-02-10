import path from 'path';
import { resolveStandaloneStaticDir } from '../standalone-server/src/staticDir';

function createExistsSync(existingPaths: string[]) {
  const known = new Set(existingPaths);
  return (targetPath: string) => known.has(targetPath);
}

describe('resolveStandaloneStaticDir', () => {
  const rootDir = path.join('C:', 'repo', 'werewolves');
  const builtClientDir = path.join(rootDir, 'dist', 'client');
  const standaloneWebDist = path.join(rootDir, 'standalone-web', 'dist');
  const devClientDir = path.join(rootDir, 'ui-vue');

  test('prefers standalone-web/dist for start:standalone when both builds exist', () => {
    const result = resolveStandaloneStaticDir({
      rootDir,
      lifecycleEvent: 'start:standalone',
      existsSync: createExistsSync([builtClientDir, standaloneWebDist]),
    });

    expect(result.preferStandaloneWebDist).toBe(true);
    expect(result.staticDir).toBe(standaloneWebDist);
  });

  test('prefers dist/client for non-standalone lifecycle when both builds exist', () => {
    const result = resolveStandaloneStaticDir({
      rootDir,
      lifecycleEvent: 'start',
      existsSync: createExistsSync([builtClientDir, standaloneWebDist]),
    });

    expect(result.preferStandaloneWebDist).toBe(false);
    expect(result.staticDir).toBe(builtClientDir);
  });

  test('falls back to standalone-web/dist when dist/client is missing', () => {
    const result = resolveStandaloneStaticDir({
      rootDir,
      lifecycleEvent: '',
      existsSync: createExistsSync([standaloneWebDist]),
    });

    expect(result.staticDir).toBe(standaloneWebDist);
  });

  test('falls back to ui-vue in dev when no build output exists', () => {
    const result = resolveStandaloneStaticDir({
      rootDir,
      lifecycleEvent: '',
      existsSync: createExistsSync([]),
    });

    expect(result.staticDir).toBe(devClientDir);
  });
});
