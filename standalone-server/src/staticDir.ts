import path from 'path';

type ExistsSync = (targetPath: string) => boolean;

type ResolveStaticDirOptions = {
  rootDir: string;
  existsSync: ExistsSync;
};

type ResolveStaticDirResult = {
  builtClientDir: string;
  devClientDir: string;
  preferStandaloneWebDist: boolean;
  standaloneWebDist: string;
  staticDir: string;
};

function resolveStandaloneStaticDir({
  rootDir,
  existsSync,
}: ResolveStaticDirOptions): ResolveStaticDirResult {
  const builtClientDir = path.join(rootDir, 'dist', 'client');
  const devClientDir = path.join(rootDir, 'ui-vue');
  const standaloneWebDist = path.join(rootDir, 'standalone-web', 'dist');
  // standalone-web/dist always takes precedence: it contains the bundled audio
  // assets and standalone-specific build. dist/client is the game-hub build and
  // does not include those assets.
  const preferStandaloneWebDist = existsSync(standaloneWebDist);

  let staticDir: string;
  if (preferStandaloneWebDist) {
    staticDir = standaloneWebDist;
  } else if (existsSync(builtClientDir)) {
    staticDir = builtClientDir;
  } else {
    staticDir = devClientDir;
  }

  return {
    builtClientDir,
    devClientDir,
    preferStandaloneWebDist,
    standaloneWebDist,
    staticDir,
  };
}

export { resolveStandaloneStaticDir };
export type { ResolveStaticDirOptions, ResolveStaticDirResult };
