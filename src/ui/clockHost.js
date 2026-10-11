import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { RelojLCDIndicator } from './indicator.js';

const WIDGET_FALLBACK_OFFSET = 100;

export function getClampedWidgetPosition(settings) {
    const x = settings.get_int('widget-x');
    const y = settings.get_int('widget-y');

    const isOnAnyMonitor = Main.layoutManager.monitors.some(monitor =>
        x >= monitor.x && x < monitor.x + monitor.width &&
        y >= monitor.y && y < monitor.y + monitor.height
    );

    if (isOnAnyMonitor) return [x, y];

    const primary = Main.layoutManager.primaryMonitor;
    return [primary.x + WIDGET_FALLBACK_OFFSET, primary.y + WIDGET_FALLBACK_OFFSET];
}

export class ClockHost {
    #extension;
    #settings;
    #alarmManager;
    #isWidget;
    #actor;
    #parent = null;
    #parentAllocationId = 0;
    #pressId = 0;
    #motionId = 0;
    #releaseId = 0;
    #dragGrab = null;

    constructor(extension, settings, alarmManager, displayActor, onParentAllocationChanged) {
        this.#extension = extension;
        this.#settings = settings;
        this.#alarmManager = alarmManager;
        this.#isWidget = settings.get_boolean('is-widget');

        if (this.#isWidget)
            this.#buildWidget(displayActor);
        else
            this.#buildPanelIndicator(displayActor, onParentAllocationChanged);

        this.#actor.accessible_role = Atk.Role.PUSH_BUTTON;
    }

    get actor() {
        return this.#actor;
    }

    destroy() {
        this.#endDrag();

        if (this.#pressId) {
            this.#actor.disconnect(this.#pressId);
            this.#pressId = 0;
        }

        if (this.#parentAllocationId) {
            this.#parent.disconnect(this.#parentAllocationId);
            this.#parentAllocationId = 0;
            this.#parent = null;
        }

        if (this.#isWidget) {
            Main.layoutManager.disconnectObject(this);
            Main.layoutManager.removeChrome(this.#actor);
        }

        this.#actor.destroy();
        this.#actor = null;
    }

    getParentWidth() {
        return this.#actor.get_parent()?.get_width() ?? 0;
    }

    getHorizontalPadding() {
        return this.#actor.get_theme_node().get_horizontal_padding();
    }

    #buildWidget(displayActor) {
        const [x, y] = getClampedWidgetPosition(this.#settings);
        this.#actor = new St.Bin({
            reactive: true,
            can_focus: true,
            track_hover: true,
            x,
            y
        });
        this.#actor.set_child(displayActor);
        this.#pressId = this.#actor.connect('button-press-event', (actor, event) => this.#onButtonPress(actor, event));
        Main.layoutManager.addChrome(this.#actor);
        Main.layoutManager.connectObject('monitors-changed', () => this.#relocate(), this);
    }

    #buildPanelIndicator(displayActor, onParentAllocationChanged) {
        this.#actor = new RelojLCDIndicator(
            this.#extension.metadata.name,
            this.#settings,
            () => this.#extension.openPreferences(),
            () => this.#alarmManager.isRinging,
            () => this.#alarmManager.stopRinging()
        );
        displayActor.y_align = Clutter.ActorAlign.CENTER;
        displayActor.y_expand = false;
        this.#actor.add_child(displayActor);

        Main.panel.addToStatusArea(
            this.#extension.uuid, this.#actor, 1, this.#settings.get_string('panel-position'));
        this.#parent = this.#actor.get_parent();
        this.#parentAllocationId = this.#parent.connect('notify::allocation', onParentAllocationChanged);
    }

    #relocate() {
        const [x, y] = getClampedWidgetPosition(this.#settings);
        this.#actor.set_position(x, y);
    }

    #onButtonPress(actor, event) {
        if (this.#alarmManager.isRinging) {
            this.#alarmManager.stopRinging();
            return Clutter.EVENT_STOP;
        }

        if (event.get_button() === Clutter.BUTTON_PRIMARY) {
            this.#beginDrag(actor, event);
            return Clutter.EVENT_STOP;
        }

        if (event.get_button() === Clutter.BUTTON_SECONDARY) {
            this.#extension.openPreferences();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    #beginDrag(actor, event) {
        const [x, y] = event.get_coords();
        const [actorX, actorY] = actor.get_transformed_position();
        const grabX = x - actorX;
        const grabY = y - actorY;

        this.#dragGrab = global.stage.grab(actor);

        this.#motionId = actor.connect('motion-event', (dragActor, motionEvent) => {
            const [motionX, motionY] = motionEvent.get_coords();
            const [width, height] = dragActor.get_size();
            const monitor = Main.layoutManager.currentMonitor;

            const newX = Math.max(monitor.x, Math.min(motionX - grabX, monitor.x + monitor.width - width));
            const newY = Math.max(monitor.y, Math.min(motionY - grabY, monitor.y + monitor.height - height));

            dragActor.set_position(newX, newY);
            return Clutter.EVENT_STOP;
        });

        this.#releaseId = actor.connect('button-release-event', (dragActor, releaseEvent) => {
            if (releaseEvent.get_button() !== Clutter.BUTTON_PRIMARY)
                return Clutter.EVENT_PROPAGATE;

            const [newX, newY] = dragActor.get_position();
            this.#settings.set_int('widget-x', newX);
            this.#settings.set_int('widget-y', newY);
            this.#endDrag();
            return Clutter.EVENT_STOP;
        });
    }

    #endDrag() {
        if (this.#dragGrab) {
            this.#dragGrab.dismiss();
            this.#dragGrab = null;
        }

        if (this.#motionId) {
            this.#actor.disconnect(this.#motionId);
            this.#motionId = 0;
        }

        if (this.#releaseId) {
            this.#actor.disconnect(this.#releaseId);
            this.#releaseId = 0;
        }
    }
}
