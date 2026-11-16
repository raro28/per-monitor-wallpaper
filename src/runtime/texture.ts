import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import Glycin from 'gi://Gly';

// Glycin ships no TypeScript bindings and GNOME 51's Cogl texture API is newer
// than the @girs 48-era types, so both are reached through `any` here.
/* eslint-disable @typescript-eslint/no-explicit-any */
const C = Cogl as any;

/**
 * Decode an image file into a CoglTexture.
 *
 * GNOME Shell 51 removed `Meta.Background.set_file()`; its `ui/background.js` now
 * decodes images in JS with Glycin and uploads the pixels to a CoglTexture passed
 * to `set_texture()`. This mirrors that path. Glycin is constrained to a single
 * premultiplied-RGBA output, so there is exactly one pixel format to upload.
 */
export function loadTexture(file: Gio.File): any {
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
