// Generates build/icon.png — the Ollibeu app icon.
// A calm, minimal leaf mark on a soft sage gradient, matching the app's tone.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIZE = 1024;
const OUT_DIR = path.join(__dirname, "..", "build");
const OUT_FILE = path.join(OUT_DIR, "icon.png");

const svg = `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate(160 0.5 0.5)">
      <stop offset="0%" stop-color="#f2f5ef" />
      <stop offset="100%" stop-color="#a4c4ae" />
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="225" ry="225" fill="url(#bg)" />

  <!-- Leaf -->
  <path
    d="M512 200 C 700 320, 740 560, 512 820 C 284 560, 328 320, 512 200 Z"
    fill="#2b4038"
  />

  <!-- Mid-vein, from tip down the center -->
  <path
    d="M512 250 C 512 420, 512 620, 512 780"
    fill="none"
    stroke="#8fc4a4"
    stroke-width="22"
    stroke-linecap="round"
  />

  <!-- Side veins -->
  <path
    d="M512 420 C 460 450, 430 470, 400 500"
    fill="none"
    stroke="#8fc4a4"
    stroke-width="22"
    stroke-linecap="round"
  />
  <path
    d="M512 420 C 564 450, 594 470, 624 500"
    fill="none"
    stroke="#8fc4a4"
    stroke-width="22"
    stroke-linecap="round"
  />
  <path
    d="M512 560 C 470 590, 448 606, 420 630"
    fill="none"
    stroke="#8fc4a4"
    stroke-width="22"
    stroke-linecap="round"
  />
  <path
    d="M512 560 C 554 590, 576 606, 604 630"
    fill="none"
    stroke="#8fc4a4"
    stroke-width="22"
    stroke-linecap="round"
  />
</svg>
`;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(OUT_FILE);

  const meta = await sharp(OUT_FILE).metadata();
  console.log(`Wrote ${OUT_FILE}: ${meta.width}x${meta.height} ${meta.format}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
