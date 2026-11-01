import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { Clock } from './src/clock/clock.js';

export default class RelojLCDExtension extends Extension {
    #clock = null;
    #alarmCarryover = null;

    enable() {
        this.#clock = new Clock(this, this.#alarmCarryover);
        this.#alarmCarryover = null;
    }

    disable() {
        this.#alarmCarryover = this.#clock.getAlarmCarryover();
        this.#clock.destroy();
        this.#clock = null;
    }
}
