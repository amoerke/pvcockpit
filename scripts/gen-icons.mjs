// Erzeugt die PWA-Icons aus scripts/icon-source.svg (Aufruf: node scripts/gen-icons.mjs).
// sharp ist ohnehin über Next.js vorhanden, keine eigene Dependency nötig.
import { readFileSync } from "node:fs";
import sharp from "sharp";

const source = readFileSync(new URL("./icon-source.svg", import.meta.url), "utf8");

// scale < 1 lässt Rand frei: "maskable"-Icons werden vom System zugeschnitten,
// wichtige Inhalte müssen in den inneren ~80 % liegen.
const targets = [
  { file: "public/icons/icon-192.png", size: 192, scale: 1 },
  { file: "public/icons/icon-512.png", size: 512, scale: 1 },
  { file: "public/icons/icon-maskable-512.png", size: 512, scale: 0.7 },
  { file: "app/apple-icon.png", size: 180, scale: 0.85 },
];

for (const { file, size, scale } of targets) {
  await sharp(Buffer.from(source.replace("SCALE", String(scale))))
    .resize(size, size)
    .flatten({ background: "#0a0a0a" }) // keine Transparenz (iOS macht sie schwarz)
    .png()
    .toFile(new URL(`../${file}`, import.meta.url).pathname);
}
