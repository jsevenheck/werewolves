import path from 'path';

type ExistsSync = (targetPath: string) => boolean;

type ResolveStaticDirOptions = {
  rootDir: string;
  existsSync: ExistsSync;
};

type ResolveStaticDirResult = {
  builtClientDir: string;
  devClientDir: string;
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

  let staticDir: string;
  if (existsSync(standaloneWebDist)) {
    staticDir = standaloneWebDist;
  } else if (existsSync(builtClientDir)) {
    staticDir = builtClientDir;
  } else {
    staticDir = devClientDir;
  }

  return {
    builtClientDir,
    devClientDir,
    standaloneWebDist,
    staticDir,
  };
}

export { resolveStandaloneStaticDir };
export type { ResolveStaticDirOptions, ResolveStaticDirResult };
