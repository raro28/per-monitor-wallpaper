import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import Glycin from 'gi://Gly';

// Glycin ships no TypeScript bindings and GNOME 51's Cogl texture API is newer
// than the @girs 48-era types, so both are reached through `any` here.
/* eslint-disable @typescript-eslint/no-explicit-any */
const C = Cogl as any;

// A decoded CoglTexture is a shareable GPU resource: one texture can back every
// Meta.Background that uses the same file. GNOME's own BackgroundTextureCache does
// this. Without it, each overview background manager (connected monitors x
// workspaces, re-decoded on every overview show) runs a full synchronous Glycin
// decode + upload on the compositor thread — seconds of stall for a large image.
//
// Keyed by path + mtime: a given path's content is immutable in practice (the
// writer emits new filenames rather than overwriting), and mtime guards the
// in-place-replacement case. Entries hold GPU memory until clearTextureCache();
// the extension calls it on disable().
const cache = new Map<string, any>();

export function clearTextureCache(): void {
  cache.clear();
}

/** Decode an image file into a CoglTexture, reusing a cached one when possible. */
export function loadTexture(file: Gio.File): any {
  const key = cacheKey(file);
  if (key !== null) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const texture = decode(file);
  if (key !== null) cache.set(key, texture);
  return texture;
}

/** `<path>\0<mtime>`, or null when the path or mtime is unavailable (decode uncached). */
function cacheKey(file: Gio.File): string | null {
  const path = file.get_path();
  if (!path) return null;
  try {
    const info = file.query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
    return `${path}\0${info.get_attribute_uint64('time::modified')}`;
  } catch {
    return null;
  }
}

/**
 * GNOME Shell 51 removed `Meta.Background.set_file()`; its `ui/background.js` now
 * decodes images in JS with Glycin and uploads the pixels to a CoglTexture passed
 * to `set_texture()`. This mirrors that path. Glycin is constrained to a single
 * premultiplied-RGBA output, so there is exactly one pixel format to upload.
 */
function decode(file: Gio.File): any {
  const loader: any = Glycin.Loader.new_for_stream(file.read(null));
  loader.set_accepted_memory_formats(Glycin.MemoryFormatSelection.R8G8B8A8_PREMULTIPLIED);
  const frame: any = loader.load().next_frame();

  const ctx = (globalThis as any).global.stage.context.get_backend().get_cogl_context();
  const width = frame.get_width();
  const height = frame.get_height();

  let texture = C.Texture2D.new_with_size(ctx, width, height);
  texture.set_components(C.TextureComponents.RGBA);
  try {
    texture.allocate();
  } catch {
    // Image exceeds the max single-texture size: use a sliced texture, as the shell does.
    texture = C.Texture2DSliced.new_with_size(ctx, width, height, C.TEXTURE_MAX_WASTE);
    texture.set_components(C.TextureComponents.RGBA);
  }

  if (!texture.set_data(C.PixelFormat.RGBA_8888_PRE, frame.get_stride(), frame.get_buf_bytes().get_data(), 0))
    throw new Error(`failed to upload texture for ${file.get_path()}`);
  return texture;
}
