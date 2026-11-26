import Clutter from 'gi://Clutter';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';

const ORIENTATION_MIN_SHELL_VERSION = 48;
const SHELL_MAJOR_VERSION = parseInt(Config.PACKAGE_VERSION.split('.')[0], 10);

// St.BoxLayout only gets "orientation" in 48; older shells need "vertical"
export function getBoxOrientationProps(vertical) {
    if (SHELL_MAJOR_VERSION < ORIENTATION_MIN_SHELL_VERSION)
        return { vertical };

    return { orientation: vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL };
}
