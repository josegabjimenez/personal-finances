// One-shot script to render PWA icons from public/icon.svg.
// Run with: node scripts/generate-icons.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const srcSvg = await readFile(resolve(root, "public/icon.svg"));
const outDir = resolve(root, "public/icons");
await mkdir(outDir, { recursive: true });

async function render(size, name, opts = {}) {
  const pipeline = sharp(srcSvg, { density: 384 }).resize(size, size, {
    fit: "contain",
    background: opts.background ?? { r: 10, g: 10, b: 10, alpha: 1 },
  });
  const buf = await pipeline.png().toBuffer();
  await writeFile(resolve(outDir, name), buf);
  console.log(`wrote ${name}`);
}

await render(192, "icon-192.png");
await render(512, "icon-512.png");
await render(512, "icon-512-maskable.png");
