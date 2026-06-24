import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolve, relative } from "node:path";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function matches(input: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(input));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function isInsideRoot(absPath: string, rootDir: string): boolean {
  const rel = relative(rootDir, absPath);
  return !rel.startsWith("..") && !rel.startsWith("/") && !rel.startsWith("\\");
}

// ─── Datei-Richtlinien ────────────────────────────────────────────────────────

// Lesen grundsätzlich verboten: sensible Credentials & interne Metadaten
const READ_DENY = [
  /(?:^|\/)\.env(\.[^/]*)?$/,   // .env* (außer .env.example)
  /(?:^|\/)\.git\//,
  /(?:^|\/)node_modules\//,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /\.crt$/,
  /\.cer$/,
  /\.log$/,
];

// Schreiben grundsätzlich verboten: kritische Konfigurationsdateien & Credentials
const WRITE_DENY = [
  /(?:^|\/)\.env(\.[^/]*)?$/,                  // .env* (außer .env.example → siehe WRITE_ALLOW_OVERRIDE)
  /(?:^|\/)\.claude\/settings\.json$/,          // eigene Agent-Settings
  /(?:^|\/)package-lock\.json$/,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /\.crt$/,
  /\.cer$/,
];

// Explizit immer erlaubt (überschreibt ggf. WRITE_DENY-ähnliche Muster)
const WRITE_ALLOW_OVERRIDE = [
  /\.env\.example$/,            // .env.example ist harmlos und soll editierbar bleiben
];

// Schreiben verboten nach Dateityp: Binärdateien & kompilierte Artefakte
// Alles andere ist erlaubt (Open-World-Ansatz statt Whitelist).
const WRITE_DENY_TYPES = [
  // Binäre / kompilierte Artefakte
  /\.exe$/,
  /\.dll$/,
  /\.so$/,
  /\.dylib$/,
  /\.class$/,
  /\.jar$/,
  /\.war$/,
  /\.ear$/,
  /\.pyc$/,
  /\.pyd$/,
  /\.wasm$/,

  // Mobile Build-Artefakte (Flutter / Android / iOS)
  /\.apk$/,
  /\.aab$/,
  /\.ipa$/,
  /\.dSYM$/,

  // Medien & Archive (kein sinnvoller Text-Edit)
  /\.zip$/,
  /\.tar$/,
  /\.gz$/,
  /\.bz2$/,
  /\.7z$/,
  /\.rar$/,
  /\.png$/,
  /\.jpe?g$/,
  /\.gif$/,
  /\.webp$/,
  /\.svg$/,   // SVG ist XML — bei Bedarf diese Zeile entfernen
  /\.ico$/,
  /\.mp3$/,
  /\.mp4$/,
  /\.mov$/,
  /\.avi$/,
  /\.pdf$/,
  /\.ttf$/,
  /\.woff2?$/,
  /\.eot$/,
];

// ─── Bash-Richtlinien ─────────────────────────────────────────────────────────

// Hart verboten — unabhängig vom Rest
const BASH_DENY = [
  // Destruktive Git-Operationen
  /^git\s+add\b/,
  /^git\s+commit\b/,
  /^git\s+push\b/,
  /^git\s+merge\b/,
  /^git\s+rebase\b/,
  /^git\s+reset\b/,
  /^git\s+clean\b/,
  /^git\s+checkout\s+--/,   // Datei-Discard
  
  /^graphify\s+add\b/,

  // Destruktive Filesystem-Ops
  /\brm\s+.*-[a-z]*r[a-z]*f\b/,  // rm -rf und Varianten
  /\brm\s+.*-[a-z]*f[a-z]*r\b/,
  /^sudo\b/,
  /^su\b/,

  // Netzwerk-Exfiltration / Tunneling
  /\bcurl\b.*\|\s*(ba)?sh/,
  /\bwget\b.*\|\s*(ba)?sh/,
  /\bngrok\b/,
  /\bssh\s+-R\b/,           // Reverse-Tunnel

  // Deploy & Publish — explizit blockiert
  /^npm\s+publish\b/,
  /^cf\s+(push|login)\b/,   // Cloud Foundry
  /^cds\s+deploy\b/,        // SAP CAP Deploy (Produktiv-Deploy verhindern)

  // .env-Inhalt via Shell-Tools lesen blockieren
  /\b(cat|less|more|grep|awk|sed)\b[^|]*\.env\b/,
];

// Erlaubt
const BASH_ALLOW = [
  // Node.js / npm / yarn / pnpm / bun
  /^npm\b/,
  /^npx\b/,
  /^yarn\b/,
  /^pnpm\b/,
  /^node\b/,
  /^bun\b/,
  /^bunx\b/,

  // TypeScript
  /^tsc\b/,
  /^ts-node\b/,
  /^tsx\b/,
  /^tsup\b/,
  /^esbuild\b/,
  /^vite\b/,
  /^vitest\b/,

  // Angular CLI
  /^ng\b/,

  // Maven / Gradle / Java / Kotlin
  /^\.\/mvnw\b/,
  /^mvn\b/,
  /^\.\/gradlew\b/,
  /^gradle\b/,
  /^java\b/,
  /^javac\b/,
  /^jar\b/,
  /^kotlin\b/,
  /^kotlinc\b/,
  /^spring\b/,              // Spring Boot CLI

  // Python / FastAPI / Uvicorn / Gunicorn
  /^python3?\b/,
  /^pip3?\b/,
  /^uv\b/,
  /^poetry\b/,
  /^ruff\b/,
  /^mypy\b/,
  /^pytest\b/,
  /^uvicorn\b/,
  /^gunicorn\b/,
  /^hypercorn\b/,
  /^fastapi\b/,             // fastapi dev / fastapi run
  /^alembic\b/,             // DB-Migrationen
  /^celery\b/,              // Task-Queue

  // SAP CAP (CDS)
  /^cds\b/,                 // cds build / cds deploy / cds watch / cds repl …

  // Playwright
  /^playwright\b/,
  /^npx\s+playwright\b/,

  // Flutter / Dart
  /^flutter\b/,
  /^dart\b/,
  /^pub\b/,                 // dart pub

  // Go
  /^go\b/,

  // Rust
  /^cargo\b/,
  /^rustc\b/,

  // Git (read-only)
  /^git\s+status\b/,
  /^git\s+diff\b/,
  /^git\s+log\b/,
  /^git\s+show\b/,
  /^git\s+branch\b/,
  /^git\s+stash\s+(list|show)\b/,

  // Docker (nur bauen & inspizieren, kein Push)
  /^docker\s+build\b/,
  /^docker\s+run\b/,
  /^docker\s+ps\b/,
  /^docker\s+images\b/,
  /^docker\s+logs\b/,
  /^docker\s+compose\b/,
  /^docker-compose\b/,

  // Shell-Werkzeuge (Suche, Inspektion, Text)
  /^grep\b/,
  /^rg\b/,             // ripgrep
  /^find\b/,
  /^ls\b/,
  /^ll\b/,
  /^cat\b/,
  /^head\b/,
  /^tail\b/,
  /^less\b/,
  /^wc\b/,
  /^sort\b/,
  /^uniq\b/,
  /^cut\b/,
  /^awk\b/,
  /^sed\b/,
  /^jq\b/,
  /^yq\b/,
  /^echo\b/,
  /^printf\b/,
  /^env\b/,
  /^printenv\b/,
  /^which\b/,
  /^whereis\b/,
  /^type\b/,
  /^pwd\b/,
  /^cd\b/,
  /^mkdir\b/,
  /^cp\b/,
  /^mv\b/,
  /^touch\b/,
  /^diff\b/,
  /^patch\b/,
  /^graphify\b/,

  // Linting & Formatierung
  /^eslint\b/,
  /^prettier\b/,
  /^tsc\b/,
  /^tslint\b/,
  /^biome\b/,
];

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const { toolName, input } = event;
    const projectRoot = resolve(ctx.cwd);

    // ── Datei-Tools ──────────────────────────────────────────────────────────
    if (toolName === "read" || toolName === "write" || toolName === "edit") {
      const rawPath = String(input?.path ?? "");
      if (!rawPath) return;

      const absPath = resolve(projectRoot, rawPath);
      const relPath = normalizePath(relative(projectRoot, absPath));

      // Pfad muss innerhalb des Projekts liegen
      if (!isInsideRoot(absPath, projectRoot)) {
        return {
          block: true,
          reason: `${toolName} außerhalb des Projektverzeichnisses blockiert: ${absPath} (root: ${projectRoot})`,
        };
      }

      // Lesen: sensible Dateien blockieren
      if (toolName === "read" && matches(relPath, READ_DENY)) {
        return { block: true, reason: `Read blocked (protected): ${relPath}` };
      }

      // Schreiben / Editieren
      if (toolName === "write" || toolName === "edit") {
        // Override: .env.example immer erlauben
        if (matches(relPath, WRITE_ALLOW_OVERRIDE)) {
          return; // durchlassen
        }

        // Credentials & kritische Config → hart blockieren
        if (matches(relPath, WRITE_DENY)) {
          return { block: true, reason: `Write/Edit blocked (protected file): ${relPath}` };
        }

        // Binärdateien & Medien → blockieren
        if (matches(relPath, WRITE_DENY_TYPES)) {
          return {
            block: true,
            reason: `Write/Edit blocked (binary/media file): ${relPath}`,
          };
        }

        // Alles andere: erlaubt (Open-World)
      }
    }

    // ── Bash-Tool ─────────────────────────────────────────────────────────────
    if (toolName === "bash") {
      const command = String(input?.command ?? "").trim();
      if (!command) return;

      // Deny hat immer Vorrang
      if (matches(command, BASH_DENY)) {
        return { block: true, reason: `Bash blockiert (Denylist): ${command}` };
      }

      // Danach Allowlist prüfen
      if (!matches(command, BASH_ALLOW)) {
        return {
          block: true,
          reason: `Bash nicht in der Allowlist: ${command}`,
        };
      }
    }
  });
}