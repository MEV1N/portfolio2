import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const targets = [
  path.join(root, 'apps', 'web', '.prisma', 'client'),
  path.join(root, 'apps', 'web', 'node_modules', '.prisma', 'client'),
];

for (const target of targets) {
  fs.mkdirSync(target, { recursive: true });
}

function copyFiles(srcDir) {
  if (!fs.existsSync(srcDir)) return false;
  let copied = 0;
  const files = fs.readdirSync(srcDir);
  for (const f of files) {
    if (f.includes('engine') || f.endsWith('.prisma') || f.endsWith('.js') || f.endsWith('.d.ts')) {
      for (const target of targets) {
        const dest = path.join(target, f);
        try {
          fs.copyFileSync(path.join(srcDir, f), dest);
          copied++;
        } catch (e) {
          console.warn(`[copy-prisma] Notice: ${(e).message}`);
        }
      }
    }
  }
  return copied > 0;
}

// Search locations where Prisma Client might be generated
const candidates = [
  path.join(root, 'node_modules', '.prisma', 'client'),
  path.join(root, 'node_modules', '.pnpm', '@prisma+client@5.22.0_prisma@5.22.0', 'node_modules', '.prisma', 'client'),
  path.join(root, 'packages', 'db', 'node_modules', '.prisma', 'client'),
];

// Also scan .pnpm for any @prisma+client folder
const pnpmDir = path.join(root, 'node_modules', '.pnpm');
if (fs.existsSync(pnpmDir)) {
  const items = fs.readdirSync(pnpmDir);
  for (const item of items) {
    if (item.startsWith('@prisma+client')) {
      candidates.push(path.join(pnpmDir, item, 'node_modules', '.prisma', 'client'));
    }
  }
}

let found = false;
for (const cand of candidates) {
  if (copyFiles(cand)) {
    console.log(`[copy-prisma] Successfully copied Prisma engines from: ${cand}`);
    found = true;
  }
}

// Copy schema.prisma
const schemaSrc = path.join(root, 'packages', 'db', 'prisma', 'schema.prisma');
if (fs.existsSync(schemaSrc)) {
  for (const target of targets) {
    fs.copyFileSync(schemaSrc, path.join(target, 'schema.prisma'));
  }
}

if (!found) {
  console.warn('[copy-prisma] Warning: No source .prisma/client directory found to copy.');
} else {
  console.log('[copy-prisma] Prisma engines mirrored to apps/web/.prisma/client.');
}
