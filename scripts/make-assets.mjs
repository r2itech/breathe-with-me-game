// renders the SVG sources into every image the web build, the PWA and Electron need
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

// system fonts so the OG image text has something to render with
const FONT = { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' };

function render(svg, width) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: FONT }).render().asPng();
}

const iconSvg = await readFile(join(root, 'assets', 'icon.svg'), 'utf8');
// square corners for home-screen / PWA icons, the OS rounds them itself
const fullBleed = iconSvg.replace('rx="56"', 'rx="0"');

const pngs = new Map();
for (const size of ICON_SIZES) pngs.set(size, render(iconSvg, size));

const buildDir = join(root, 'build');
const publicDir = join(root, 'public');
await mkdir(buildDir, { recursive: true });
await mkdir(publicDir, { recursive: true });

// Electron / installer
await writeFile(join(buildDir, 'icon.png'), pngs.get(512));
await writeFile(join(buildDir, 'icon.ico'), await pngToIco(ICO_SIZES.map((s) => pngs.get(s))));
// the window icon has to live inside the packaged app, build/ isn't packed
await writeFile(join(root, 'electron', 'icon.png'), pngs.get(256));

// web
await copyFile(join(root, 'assets', 'icon.svg'), join(publicDir, 'favicon.svg'));
await writeFile(join(publicDir, 'favicon-32.png'), pngs.get(32));
await writeFile(join(publicDir, 'apple-touch-icon.png'), render(fullBleed, 180));
await writeFile(join(publicDir, 'icon-192.png'), render(fullBleed, 192));
await writeFile(join(publicDir, 'icon-512.png'), render(fullBleed, 512));

const ogSvg = await readFile(join(root, 'assets', 'og-image.svg'), 'utf8');
await writeFile(join(publicDir, 'og-image.png'), render(ogSvg, 1200));

console.log('assets written to build/, electron/ and public/');
