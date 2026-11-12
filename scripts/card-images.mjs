// Card images are the site's own copies in docs/assets/cards/ (#157), never links to another site: pokemontcg.io
// has moved to Scrydex, and Scrydex asks sites to keep their own copies rather than build its image URLs.
//
// Each card has two WebP files, named after its card page slug:
//   docs/assets/cards/<slug>.webp         the large image (card pages, the lightbox): up to 734px wide
//   docs/assets/cards/<slug>-small.webp   the grid image: up to 367px wide, sharp on phone screens
// and imageOrigin in data/cards.json records where the copy was made from.
//
//   node scripts/card-images.mjs                  copy every card whose images aren't ours yet (a new card's
//                                                 imageLarge is the image URL to copy from)
//   node scripts/card-images.mjs --check          list those cards, change nothing
//   node scripts/card-images.mjs --redo <slug>…   copy a card again from its imageOrigin, or from a URL given as
//                                                 --from <url> (one slug), e.g. for a better scan
//
// The WebP encoding uses Python 3 with Pillow (pip install Pillow). Nothing on the site needs it: pages only load
// the files.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CARDS_PATH, assignSlugs } from "./build-helpers.mjs";

export const CARD_IMAGE_DIR = "docs/assets/cards";
export const CARD_IMAGE_SIZES = { large: { width: 734, quality: 85 }, small: { width: 367, quality: 82 } };
export const cardImagePaths = (slug) => ({ large: `/assets/cards/${slug}.webp`, small: `/assets/cards/${slug}-small.webp` });

const ENCODE = `
import sys
from PIL import Image, ImageOps
source, large, small, lw, lq, sw, sq = sys.argv[1:8]
image = ImageOps.exif_transpose(Image.open(source))
image = image.convert("RGBA" if ("A" in image.getbands() or "transparency" in image.info) else "RGB")
for path, width, quality in ((large, int(lw), int(lq)), (small, int(sw), int(sq))):
    copy = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS) if image.width > width else image
    copy.save(path, "WEBP", quality=quality, method=6)
print(f"{image.width}x{image.height}")
`;

async function download(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "sleepy-pokemon-card-images" } });
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      const type = response.headers.get("content-type") || "";
      if (!type.startsWith("image/")) throw new Error(`${url} isn't an image (${type || "no content type"})`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

function needsCopy(card) {
  const paths = cardImagePaths(card.slug);
  return card.imageLarge !== paths.large || card.imageSmall !== paths.small
    || !existsSync(join("docs", paths.large)) || !existsSync(join("docs", paths.small));
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const redoIndex = args.indexOf("--redo");
  const fromIndex = args.indexOf("--from");
  const from = fromIndex === -1 ? "" : args[fromIndex + 1];
  const redo = redoIndex === -1 ? [] : args.slice(redoIndex + 1).filter((arg, index, all) => !arg.startsWith("--") && all[index - 1] !== "--from");
  if (from && redo.length !== 1) throw new Error("--from takes one card: --redo <slug> --from <url>");

  const raw = await readFile(CARDS_PATH, "utf8");
  const payload = JSON.parse(raw);
  const slugs = assignSlugs(payload.cards).map((card) => card.slug);
  const unknown = redo.filter((slug) => !slugs.includes(slug));
  if (unknown.length) throw new Error(`No card with slug ${unknown.join(", ")}`);
  const todo = payload.cards
    .map((card, index) => ({ card, slug: slugs[index] }))
    .filter(({ card, slug }) => redo.includes(slug) || (!redo.length && needsCopy({ ...card, slug })));

  if (!todo.length) {
    console.log("Every card's images are already copied.");
    return;
  }
  if (check) {
    for (const { card, slug } of todo) console.log(`${slug}  ←  ${card.imageLarge}`);
    console.log(`\n${todo.length} card(s) to copy. Run without --check to copy them.`);
    return;
  }
  try {
    execFileSync("python3", ["-c", "import PIL"], { stdio: "ignore" });
  } catch {
    throw new Error("The WebP encoding needs Python 3 with Pillow: pip install Pillow");
  }

  const work = mkdtempSync(join(tmpdir(), "card-images-"));
  const failed = [];
  try {
    for (const [index, { card, slug }] of todo.entries()) {
      const source = from || (redo.includes(slug) ? card.imageOrigin || card.imageLarge : card.imageLarge);
      const paths = cardImagePaths(slug);
      try {
        if (!source) throw new Error("no image to copy from (set imageLarge to the image's URL)");
        const local = source.startsWith("/") && !source.startsWith("//");
        const bytes = local ? readFileSync(join("docs", source)) : await download(source);
        const input = join(work, "source");
        writeFileSync(input, bytes);
        const large = join("docs", paths.large);
        const small = join("docs", paths.small);
        const { large: L, small: S } = CARD_IMAGE_SIZES;
        const size = execFileSync("python3", ["-c", ENCODE, input, large, small, L.width, L.quality, S.width, S.quality].map(String), { encoding: "utf8" }).trim();
        card.imageLarge = paths.large;
        card.imageSmall = paths.small;
        // A copy made from another of our own files (the older local scans) has no outside origin to record.
        if (!local) card.imageOrigin = source;
        const kb = (path) => Math.round(readFileSync(path).length / 1024);
        console.log(`[${index + 1}/${todo.length}] ${slug}: ${size} → ${kb(large)} KB + ${kb(small)} KB`);
      } catch (error) {
        failed.push(slug);
        console.error(`[${index + 1}/${todo.length}] ${slug}: ${error.message}`);
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
    const next = `${JSON.stringify(payload, null, 2)}\n`;
    if (next !== raw) await writeFile(CARDS_PATH, next, "utf8");
  }
  console.log(`\nCopied ${todo.length - failed.length} of ${todo.length}. Now run sync-seo-index.mjs and sync-guides.mjs.`);
  if (failed.length) {
    console.error(`Not copied (their images are unchanged): ${failed.join(", ")}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
