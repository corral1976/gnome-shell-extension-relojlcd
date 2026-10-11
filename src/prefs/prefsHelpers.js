import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class SettingsLinks {
    #settings;
    #ids = [];

    constructor(settings) {
        this.#settings = settings;
    }

    connect(signal, callback) {
        this.#ids.push(this.#settings.connect(signal, callback));
    }

    disconnectAll() {
        for (const id of this.#ids)
            this.#settings.disconnect(id);
        this.#ids = [];
    }
}

export function escapeMarkup(text) {
    return GLib.markup_escape_text(text, -1);
}

export function addSwitchRow(settings, group, key, title, subtitle) {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(row);
    return row;
}

export function bindChoiceRow(settings, links, row, key, choices) {
    row.set_selected(Math.max(0, choices.indexOf(settings.get_string(key))));
    row.connect('notify::selected', (w) => {
        settings.set_string(key, choices[w.selected]);
    });
    links.connect(`changed::${key}`, () => {
        const index = choices.indexOf(settings.get_string(key));
        if (index >= 0 && row.selected !== index)
            row.set_selected(index);
    });
}

export function parseAlarms(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        parsed = [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(alarm => alarm && typeof alarm.id === 'string');
}
