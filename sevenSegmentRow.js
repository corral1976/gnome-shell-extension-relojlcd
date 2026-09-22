import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import { isBlankGlyph, calculateCellPixelHeight, calculateCellPixelWidth } from './glyphAssets.js';

export const SevenSegmentRow = GObject.registerClass(
{ GTypeName: 'RelojLCDSevenSegmentRow' },
class SevenSegmentRow extends St.Widget {
    _init(textureCache, params = {}) {
        super._init({
            layout_manager: new Clutter.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                spacing: 2
            }),
            reactive: false,
            accessible_role: Atk.Role.FILLER,
            ...params
        });

        this._textureCache = textureCache;
        this._lines = [];
    }

    setText(text, color, fontSize, styleOptions = {}) {
        const lines = text.split('\n');
        this._reconcileLineCount(lines.length);

        for (let i = 0; i < lines.length; i++)
            this._setLineText(this._lines[i], lines[i], color, fontSize, styleOptions);
    }

    _setLineText(line, text, color, fontSize, styleOptions) {
        const chars = Array.from(text);
        this._reconcileCellCount(line, chars.length);

        const cellHeight = calculateCellPixelHeight(fontSize);

        for (let i = 0; i < chars.length; i++) {
            const char = chars[i];
            const cell = line.cells[i];
            const cellWidth = calculateCellPixelWidth(fontSize, char, styleOptions.italic);
            cell.set_size(Math.max(1, Math.round(cellWidth)), Math.max(1, Math.round(cellHeight)));

            if (isBlankGlyph(char)) {
                cell.set_content(null);
                continue;
            }

            cell.set_content(this._textureCache.getImage(char, color, cellWidth, cellHeight, styleOptions));
        }
    }

    _reconcileLineCount(count) {
        while (this._lines.length < count) {
            const row = new Clutter.Actor({
                layout_manager: new Clutter.BoxLayout({ orientation: Clutter.Orientation.HORIZONTAL }),
                reactive: false,
                x_align: Clutter.ActorAlign.CENTER,
                x_expand: true
            });
            this.add_child(row);
            this._lines.push({ actor: row, cells: [] });
        }

        while (this._lines.length > count) {
            const line = this._lines.pop();
            line.actor.destroy();
        }
    }

    _reconcileCellCount(line, count) {
        while (line.cells.length < count) {
            const cell = new Clutter.Actor({
                reactive: false,
                content_gravity: Clutter.ContentGravity.RESIZE_ASPECT
            });
            line.actor.add_child(cell);
            line.cells.push(cell);
        }

        while (line.cells.length > count) {
            const cell = line.cells.pop();
            cell.destroy();
        }
    }
});
