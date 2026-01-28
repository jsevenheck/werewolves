/**
 * Legacy entry point – delegates to server/src/standalone.ts.
 *
 * Kept so that existing scripts (`tsx server.ts`, Playwright config, etc.)
 * continue to work without changes.
 */
import './server/src/standalone';
