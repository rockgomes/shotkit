// web/decode.js — turn dropped/browsed Files into the bitmaps composeWithMeta
// wants. This is pure plumbing: decode, measure, classify by orientation.
// No fitting, no scaling, no colour decisions — that is core/'s job once the
// bitmap reaches composeWithMeta.

let nextId = 1;

/** A landscape image is the web screenshot; anything else (portrait, or
 *  exactly square) is treated as a phone — matching how core/'s own mobile
 *  layout expects a taller-than-wide source. */
export function isLandscape(bitmap) {
  return bitmap.width >= bitmap.height;
}

/**
 * Decode one File into an ImageBitmap. Throws a plain Error carrying a
 * message that names the file — decodeFiles() below collects these instead
 * of letting one bad file abort a whole drop.
 *
 * `createImageBitmap` is the actual gate here: it rejects non-image files
 * (and corrupt/unsupported ones) on its own, so this never has to guess from
 * a filename extension or MIME type first — the browser already knows.
 */
export async function decodeFile(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`"${file.name}" isn't an image shotkit can read.`);
  }
  // Tag every decoded bitmap with a stable identity of its own. ImageBitmap
  // objects are freshly created per decode, so two drops of the exact same
  // file are two different objects — callers that need to tell "the same
  // picture" apart from "a new picture" (e.g. a ground-recompute cache)
  // can't rely on `===` and need something to key on instead.
  bitmap.__id = nextId++;
  bitmap.__name = file.name;
  return { bitmap, orientation: isLandscape(bitmap) ? 'landscape' : 'portrait' };
}

/**
 * Decode every file in `files` (a FileList or array of File).
 *
 * Returns `{ web, mobile, errors }`:
 * - `web`: the last landscape image decoded from this batch, or null if none.
 * - `mobile`: portrait images decoded from this batch, in drop order —
 *   uncapped here; how many of these actually get kept (max 3, combined with
 *   whatever was already loaded) is state.js's call, not this module's.
 * - `errors`: one human-readable, file-named message per file that failed to
 *   decode. A batch that is entirely bad still returns `{ web: null, mobile:
 *   [], errors: [...] }` rather than throwing — the caller decides what that
 *   means for anything already on screen.
 */
export async function decodeFiles(files) {
  const errors = [];
  let web = null;
  const mobile = [];

  for (const file of Array.from(files)) {
    try {
      const { bitmap, orientation } = await decodeFile(file);
      if (orientation === 'landscape') web = bitmap;
      else mobile.push(bitmap);
    } catch (err) {
      errors.push(err.message);
    }
  }

  return { web, mobile, errors };
}
