import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../build-tests', import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);

const isRelativeSpecifier = (value) => value.startsWith('./') || value.startsWith('../');

const normalizeSpecifier = (specifier) => {
  if (!isRelativeSpecifier(specifier)) {
    return specifier;
  }
  if (specifier.endsWith('.js') || specifier.endsWith('.json') || specifier.endsWith('.mjs')) {
    return specifier;
  }
  if (specifier.endsWith('.ts')) {
    return `${specifier.slice(0, -3)}.js`;
  }
  const trailing = specifier.split('/').pop() ?? '';
  if (!extname(trailing)) {
    return `${specifier}.js`;
  }
  return specifier;
};

const RELATIVE_FROM_PATTERN = /((?:import|export)[^'";]*?from\s+['"])([^'"\s]+)(['"])/g;
const RELATIVE_DYNAMIC_PATTERN = /(import\(\s*['"])([^'"\s]+)(['"]\s*\))/g;

const fixFile = (filePath) => {
  const original = readFileSync(filePath, 'utf8');
  let updated = original.replace(RELATIVE_FROM_PATTERN, (match, start, specifier, end) => {
    const next = normalizeSpecifier(specifier);
    return `${start}${next}${end}`;
  });
  updated = updated.replace(RELATIVE_DYNAMIC_PATTERN, (match, start, specifier, end) => {
    const next = normalizeSpecifier(specifier);
    return `${start}${next}${end}`;
  });

  if (updated !== original) {
    writeFileSync(filePath, updated, 'utf8');
  }
};

const walk = (directory) => {
  const entries = readdirSync(directory);
  for (const entry of entries) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath);
    } else if (stats.isFile() && fullPath.endsWith('.js')) {
      fixFile(fullPath);
    }
  }
};

walk(ROOT_PATH);
