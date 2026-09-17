#!/usr/bin/env node
/**
 * Turns the supplied cap photographs into the files the gallery asks for.
 *
 * Drop the originals here, named by view:
 *
 *   public/images/products/taiwan/originals/main.jpg
 *                                          /front.jpg
 *                                          /side.jpg
 *                                          /back.jpg
 *                                          /detail.jpg
 *   public/images/products/al-adou/originals/…
 *
 * Then run:  node scripts/optimize-images.mjs
 *
 * For each original it writes, beside it in the product folder:
 *
 *   main.jpg                 the fallback <img> src
 *   main-480.avif  .webp     the srcset entries the browser picks from
 *   main-768.avif  .webp
 *   main-1200.avif .webp
 *   main-1800.avif .webp
 *
 * The originals are never modified and never deleted -- they stay in
 * `originals/` as the high-resolution masters.
 *
 * NOTHING HERE CROPS. Every output preserves the original aspect ratio and is
 * only ever scaled down. The embroidery is the product, and a centre-crop
 * would cut the phrase off at the edge of the frame.
 *
 * Requires `sharp`, which is not a dependency of the app because it is only
 * needed when new photographs arrive:
 *
 *   npm install --no-save sharp
 */
import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTS_DIR = join(ROOT, "public", "images", "products");

/** Must match IMAGE_WIDTHS in src/lib/catalog/products.ts. */
const WIDTHS = [480, 768, 1200, 1800];
const VIEWS = ["main", "front", "side", "back", "detail"];

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error(
    "sharp is not installed. Run:\n\n  npm install --no-save sharp\n\nthen run this script again.",
  );
  process.exit(1);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function processProduct(slug) {
  const originalsDir = join(PRODUCTS_DIR, slug, "originals");
  if (!(await exists(originalsDir))) {
    console.warn(`  no originals/ folder for "${slug}" — skipping`);
    return 0;
  }

  const files = await readdir(originalsDir);
  let written = 0;

  for (const file of files) {
    const { name, ext } = parse(file);
    if (!/^\.(jpe?g|png|tiff?|webp|avif)$/i.test(ext)) continue;

    if (!VIEWS.includes(name)) {
      console.warn(
        `  "${file}" is not one of ${VIEWS.join(", ")} — skipping (the gallery would not find it)`,
      );
      continue;
    }

    const source = join(originalsDir, file);
    const image = sharp(source);
    const meta = await image.metadata();

    console.log(`  ${slug}/${name}  ${meta.width}×${meta.height}`);

    // The fallback <img> src: a reasonably sized JPEG for a browser too old
    // for AVIF or WebP.
    await image
      .clone()
      .resize({ width: Math.min(1200, meta.width ?? 1200), withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toFile(join(PRODUCTS_DIR, slug, `${name}.jpg`));
    written++;

    for (const width of WIDTHS) {
      // Never upscale: a 900px original produces nothing at 1200 or 1800, and
      // the browser falls back to a width that does exist.
      if ((meta.width ?? 0) < width && width !== WIDTHS[0]) continue;

      const resized = image.clone().resize({ width, withoutEnlargement: true });

      await resized
        .clone()
        .avif({ quality: 58 })
        .toFile(join(PRODUCTS_DIR, slug, `${name}-${width}.avif`));

      await resized
        .clone()
        .webp({ quality: 80 })
        .toFile(join(PRODUCTS_DIR, slug, `${name}-${width}.webp`));

      written += 2;
    }
  }

  return written;
}

async function main() {
  await mkdir(PRODUCTS_DIR, { recursive: true });

  const slugs = ["taiwan", "al-adou"];
  let total = 0;

  for (const slug of slugs) {
    console.log(`\n${slug}`);
    await mkdir(join(PRODUCTS_DIR, slug), { recursive: true });
    total += await processProduct(slug);
  }

  console.log(`\nWrote ${total} file(s).`);

  if (total === 0) {
    console.log(
      "\nNo photographs found. Put the originals in\n" +
        "  public/images/products/<slug>/originals/<view>.jpg\n" +
        `  views: ${VIEWS.join(", ")}`,
    );
    return;
  }

  console.log(
    "\nNow set `placeholder: false` on those images in " +
      "src/lib/catalog/products.ts\nso the gallery stops rendering the " +
      '"photo pending" panel.',
  );
}

await main();
