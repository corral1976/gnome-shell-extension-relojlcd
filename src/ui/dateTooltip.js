import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

const SHOW_DELAY_MS = 400;
const FADE_MS = 150;
const ANCHOR_GAP = 6;
const MONITOR_MARGIN = 8;

export class DateTooltip {
    #settings;
    #anchor;
    #label;
    #hoverId;
    #pressId;
    #showTimeoutId = null;

    constructor(settings, anchor) {
        this.#settings = settings;
        this.#anchor = anchor;

        this.#label = new St.Label({
            style_class: 'dash-label',
            reactive: false,
            visible: false,
            opacity: 0
        });
        Main.uiGroup.add_child(this.#label);

        this.#hoverId = anchor.connect('notify::hover', () => this.#onHoverChanged());
        this.#pressId = anchor.connect('button-press-event', () => {
            this.#hide();
            return Clutter.EVENT_PROPAGATE;
        });
    }

    destroy() {
        this.#anchor.disconnect(this.#hoverId);
        this.#anchor.disconnect(this.#pressId);

        if (this.#showTimeoutId) {
            GLib.Source.remove(this.#showTimeoutId);
            this.#showTimeoutId = null;
        }

        Main.uiGroup.remove_child(this.#label);
        this.#label.destroy();
        this.#label = null;
        this.#anchor = null;
        this.#settings = null;
    }

    #onHoverChanged() {
        if (this.#anchor.hover)
            this.#scheduleShow();
        else
            this.#hide();
    }

    #scheduleShow() {
        if (!this.#settings.get_boolean('show-date-tooltip')) return;

        if (this.#showTimeoutId) {
            GLib.Source.remove(this.#showTimeoutId);
            this.#showTimeoutId = null;
        }

        this.#showTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SHOW_DELAY_MS, () => {
            this.#showTimeoutId = null;
            this.#show();
            return GLib.SOURCE_REMOVE;
        });
    }

    #show() {
        this.#label.set_text(GLib.DateTime.new_now_local().format(_('%A, %-d %B %Y')));
        this.#label.remove_all_transitions();
        this.#label.show();
        this.#positionLabel();
        this.#label.ease({
            opacity: 255,
            duration: FADE_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
    }

    #hide() {
        if (this.#showTimeoutId) {
            GLib.Source.remove(this.#showTimeoutId);
            this.#showTimeoutId = null;
        }

        const label = this.#label;
        if (!label.visible) return;

        label.remove_all_transitions();
        label.ease({
            opacity: 0,
            duration: FADE_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => label.hide()
        });
    }

    #positionLabel() {
        const [anchorX, anchorY] = this.#anchor.get_transformed_position();
        const [anchorWidth, anchorHeight] = this.#anchor.get_transformed_size();
        const [, labelWidth] = this.#label.get_preferred_width(-1);
        const [, labelHeight] = this.#label.get_preferred_height(labelWidth);
        const monitor = Main.layoutManager.findMonitorForActor(this.#anchor) ?? Main.layoutManager.primaryMonitor;

        const minX = monitor.x + MONITOR_MARGIN;
        const maxX = monitor.x + monitor.width - labelWidth - MONITOR_MARGIN;
        const x = Math.max(minX, Math.min(anchorX + (anchorWidth - labelWidth) / 2, maxX));

        const below = anchorY + anchorHeight + ANCHOR_GAP;
        const fitsBelow = below + labelHeight <= monitor.y + monitor.height - MONITOR_MARGIN;
        const y = fitsBelow ? below : anchorY - labelHeight - ANCHOR_GAP;

        this.#label.set_position(Math.round(x), Math.round(y));
    }
}
