import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { Clock } from './src/clock/clock.js';

export default class RelojLCDExtension extends Extension {
    #clock = null;

    enable() {
        this.#clock = new Clock(this);
    }

    disable() {
        this.#clock.destroy();
        this.#clock = null;
    }
}
