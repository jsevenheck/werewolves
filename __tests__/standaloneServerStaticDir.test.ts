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

  test('prefers standalone-web/dist when both builds exist', () => {
    const result = resolveStandaloneStaticDir({
      rootDir,
      existsSync: createExistsSync([builtClientDir, standaloneWebDist]),
    });

    expect(result.preferStandaloneWebDist).toBe(true);
    expect(result.staticDir).toBe(standaloneWebDist);
  });

  test('falls back to dist/client when standalone-web/dist is missing', () => {
    const result = resolveStandaloneStaticDir({
      rootDir,
      existsSync: createExistsSync([builtClientDir]),
    });

    expect(result.preferStandaloneWebDist).toBe(false);
    expect(result.staticDir).toBe(builtClientDir);
  });

  test('uses standalone-web/dist when dist/client is also missing', () => {
    const result = resolveStandaloneStaticDir({
      rootDir,
      existsSync: createExistsSync([standaloneWebDist]),
    });

    expect(result.preferStandaloneWebDist).toBe(true);
    expect(result.staticDir).toBe(standaloneWebDist);
  });

  test('falls back to ui-vue in dev when no build output exists', () => {
    const result = resolveStandaloneStaticDir({
      rootDir,
      existsSync: createExistsSync([]),
    });

    expect(result.preferStandaloneWebDist).toBe(false);
    expect(result.staticDir).toBe(devClientDir);
  });
});
