import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import St from 'gi://St';
import Cogl from 'gi://Cogl';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import { buildGlyphSvgMarkup } from './glyphAssets.js';

const textEncoder = new TextEncoder();
const SHELL_MAJOR_VERSION = parseInt(Config.PACKAGE_VERSION.split('.')[0], 10);

export class GlyphTextureCache {
    constructor() {
        this._contents = new Map();
    }

    getImage(char, color, pixelWidth, pixelHeight, options = {}) {
        const width = Math.max(1, Math.round(pixelWidth));
        const height = Math.max(1, Math.round(pixelHeight));
        const { italic = false, bold = false } = options;
        const key = `${char}|${color}|${width}|${height}|${italic ? 1 : 0}${bold ? 1 : 0}`;

        let content = this._contents.get(key);
        if (content) return content;

        const markup = buildGlyphSvgMarkup(char, color, options);
        if (!markup) return null;

        content = this._rasterizeToContent(markup, width, height);
        this._contents.set(key, content);
        return content;
    }

    _rasterizeToContent(markup, width, height) {
        const stream = Gio.MemoryInputStream.new_from_bytes(
            GLib.Bytes.new(textEncoder.encode(markup)));
        const pixbuf = GdkPixbuf.Pixbuf.new_from_stream_at_scale(stream, width, height, false, null);

        const format = pixbuf.get_has_alpha() ? Cogl.PixelFormat.RGBA_8888 : Cogl.PixelFormat.RGB_888;
        const content = St.ImageContent.new_with_preferred_size(pixbuf.get_width(), pixbuf.get_height());
        const bytes = pixbuf.read_pixel_bytes();

        if (SHELL_MAJOR_VERSION >= 48) {
            const coglContext = global.stage.context.get_backend().get_cogl_context();
            content.set_bytes(
                coglContext,
                bytes,
                format,
                pixbuf.get_width(),
                pixbuf.get_height(),
                pixbuf.get_rowstride());
        } else {
            content.set_bytes(
                bytes,
                format,
                pixbuf.get_width(),
                pixbuf.get_height(),
                pixbuf.get_rowstride());
        }

        return content;
    }

    clear() {
        this._contents.clear();
    }
}
