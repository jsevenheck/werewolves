import fs from 'fs';
import path from 'path';
import { de } from '../ui-vue/src/i18n/messages/de';
import { en } from '../ui-vue/src/i18n/messages/en';

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' ? flattenKeys(child, nextPrefix) : [nextPrefix];
  });
}

function readServerSources(): Array<{ file: string; source: string }> {
  const serverRoot = path.join(process.cwd(), 'server', 'src');
  const files: string[] = [];

  function collect(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collect(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }

  collect(serverRoot);
  return files.map((file) => ({ file, source: fs.readFileSync(file, 'utf8') }));
}

function extractServerMessageKeys(): string[] {
  const keyPatterns = [
    /localizedMessage\(\s*['"]([^'"]+)['"]/g,
    /errorResponse\([^,]+,\s*['"]([^'"]+)['"]/g,
  ];

  return Array.from(
    new Set(
      readServerSources().flatMap(({ source }) =>
        keyPatterns.flatMap((pattern) => Array.from(source.matchAll(pattern), (match) => match[1]))
      )
    )
  ).sort();
}

function extractCalls(source: string, functionName: string): string[] {
  const calls: string[] = [];
  let cursor = 0;
  const token = `${functionName}(`;

  while (cursor < source.length) {
    const start = source.indexOf(token, cursor);
    if (start === -1) break;

    const prefix = source.slice(Math.max(0, start - 20), start);
    if (/function\s+$/.test(prefix)) {
      cursor = start + token.length;
      continue;
    }

    let depth = 0;
    let quote: string | null = null;
    let escaped = false;

    for (let index = start + functionName.length; index < source.length; index += 1) {
      const char = source[index];

      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === quote) {
          quote = null;
        }
        continue;
      }

      if (char === "'" || char === '"' || char === '`') {
        quote = char;
        continue;
      }

      if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          calls.push(source.slice(start, index + 1));
          cursor = index + 1;
          break;
        }
      }
    }
  }

  return calls;
}

describe('server-to-client i18n contract', () => {
  test('every server-emitted LocalizedMessage key exists in English and German', () => {
    const englishKeys = new Set(flattenKeys(en));
    const germanKeys = new Set(flattenKeys(de));
    const serverKeys = extractServerMessageKeys();

    expect(serverKeys).not.toHaveLength(0);
    expect(serverKeys.filter((key) => !englishKeys.has(key))).toEqual([]);
    expect(serverKeys.filter((key) => !germanKeys.has(key))).toEqual([]);
  });

  test('server log emissions include LocalizedMessage fallbacks for clients', () => {
    const callsWithoutMessage = readServerSources().flatMap(({ file, source }) =>
      extractCalls(source, 'addLog')
        .filter((call) => !call.includes('localizedMessage('))
        .map((call) => `${path.relative(process.cwd(), file)}: ${call}`)
    );

    expect(callsWithoutMessage).toEqual([]);
  });

  test('server error acknowledgements are built through errorResponse', () => {
    const inlineErrorObjects = readServerSources().flatMap(({ file, source }) => {
      const relativeFile = path.relative(process.cwd(), file);
      if (relativeFile === path.join('server', 'src', 'utils', 'helpers.ts')) return [];
      return /\{\s*error\s*:/.test(source) ? [relativeFile] : [];
    });

    expect(inlineErrorObjects).toEqual([]);
  });
});
