import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import { PRESET_COLORS } from '../shared/colorUtils.js';

export const RelojLCDIndicator = GObject.registerClass(
{ GTypeName: 'RelojLCDIndicator' },
class RelojLCDIndicator extends PanelMenu.Button {
    _init(name, settings, openPreferences, isAlarming, stopAlarm) {
        super._init(0.5, name, false);

        this._settings = settings;
        this._openPreferences = openPreferences;
        this._isAlarming = isAlarming;
        this._stopAlarm = stopAlarm;
        this.menu.sourceActor = this;
        this._colorMenuItems = new Map();

        this._buildQuickColorMenu();

        this._menuOpenStateId = this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen) this._refreshQuickColorMenu();
        });

        this._capturedEventId = this.connect('captured-event', (actor, event) => {
            if (!this._isAlarming()) return Clutter.EVENT_PROPAGATE;

            switch (event.type()) {
            case Clutter.EventType.BUTTON_PRESS:
            case Clutter.EventType.TOUCH_BEGIN:
                return Clutter.EVENT_STOP;
            case Clutter.EventType.BUTTON_RELEASE:
            case Clutter.EventType.TOUCH_END:
                this._stopAlarm();
                return Clutter.EVENT_STOP;
            default:
                return Clutter.EVENT_PROPAGATE;
            }
        });

        this._clickHandlerId = this.connect('button-release-event', () => {
            this.menu.toggle();
            return Clutter.EVENT_STOP;
        });
    }

    destroy() {
        if (this._capturedEventId) {
            this.disconnect(this._capturedEventId);
            this._capturedEventId = 0;
        }
        if (this._clickHandlerId) {
            this.disconnect(this._clickHandlerId);
            this._clickHandlerId = 0;
        }
        if (this._menuOpenStateId) {
            this.menu.disconnect(this._menuOpenStateId);
            this._menuOpenStateId = 0;
        }
        super.destroy();
    }

    _buildQuickColorMenu() {
        const colorEntries = [
            ['green', _('Neon Green')],
            ['amber', _('Vintage Amber')],
            ['gray', _('Retro LCD')],
            ['ruby', _('Red Ruby')],
            ['sapphire', _('Blue Sapphire')],
            ['white', _('White LED')],
            ['violet', _('Violet Purple')],
            ['gold', _('Gold')],
            ['teal', _('VFD Teal')],
            ['orange', _('Nixie Orange')]
        ];

        for (const [key, label] of colorEntries) {
            const colorMenuItem = new PopupMenu.PopupMenuItem(label);
            const swatchHex = key === 'gray' ? '#6a8a5a' : (PRESET_COLORS[key] || '#ffffff');
            colorMenuItem.label.set_style(`color: ${swatchHex}; font-weight: bold;`);
            colorMenuItem.connect('activate', () => {
                this._settings.set_string('clock-color', key);
            });
            this.menu.addMenuItem(colorMenuItem);
            this._colorMenuItems.set(key, colorMenuItem);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const prefsItem = new PopupMenu.PopupMenuItem(_('More Settings…'));
        prefsItem.connect('activate', () => this._openPreferences());
        this.menu.addMenuItem(prefsItem);

        this._refreshQuickColorMenu();
    }

    _refreshQuickColorMenu() {
        const currentColor = this._settings.get_string('clock-color');
        for (const [key, item] of this._colorMenuItems)
            item.setOrnament(key === currentColor ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
    }
});
