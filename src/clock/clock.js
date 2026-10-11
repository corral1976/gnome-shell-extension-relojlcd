import { AlarmManager } from '../alarm/alarmManager.js';
import { GlyphTextureCache } from '../graphics/glyphTexture.js';
import { ClockView } from './clockView.js';
import { notifyIfUpdated } from './updateNotice.js';

export class Clock {
    #extension;
    #settings;
    #alarmManager;
    #textureCache;
    #view = null;

    constructor(extension) {
        this.#extension = extension;
        this.#settings = extension.getSettings();
        this.#textureCache = new GlyphTextureCache();

        this.#alarmManager = new AlarmManager(this.#settings, {
            title: extension.metadata.name,
            onRingingChanged: isRinging => this.#view?.setRinging(isRinging),
            onAlarmsChanged: () => this.#view?.refreshAlarms()
        });

        this.#view = this.#createView();

        this.#settings.connectObject(
            'changed::panel-position', () => this.#rebuildView(),
            'changed::is-widget', () => this.#rebuildView(),
            this
        );

        this.#view.runLampTest();
        notifyIfUpdated(this.#settings, extension.metadata);
    }

    destroy() {
        this.#settings.disconnectObject(this);
        this.#view.destroy();
        this.#view = null;
        this.#alarmManager.destroy();
        this.#alarmManager = null;
        this.#textureCache.clear();
        this.#textureCache = null;
        this.#settings = null;
    }

    #createView() {
        return new ClockView(this.#extension, this.#settings, this.#alarmManager, this.#textureCache);
    }

    #rebuildView() {
        this.#view.destroy();
        this.#view = null;
        this.#view = this.#createView();
    }
}
