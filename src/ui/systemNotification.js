import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

const SHELL_MAJOR_VERSION = parseInt(Config.PACKAGE_VERSION.split('.')[0], 10);

function addActions(notification, actions) {
    for (const { label, callback } of actions)
        notification.addAction(label, callback);
}

function notifyWithSystemSource({ title, body, gicon = null, urgency = MessageTray.Urgency.NORMAL, actions = [] }) {
    const source = MessageTray.getSystemSource();
    const notification = new MessageTray.Notification({ source, title, body, gicon, urgency });
    addActions(notification, actions);
    source.addNotification(notification);
    return notification;
}

function notifyWithLegacySource({ title, body, gicon = null, urgency = MessageTray.Urgency.NORMAL, actions = [] }) {
    const source = new MessageTray.SystemNotificationSource();
    Main.messageTray.add(source);
    const notification = new MessageTray.Notification(source, title, body, { gicon });
    notification.setUrgency(urgency);
    addActions(notification, actions);
    source.showNotification(notification);
    return notification;
}

export const notifySystem = SHELL_MAJOR_VERSION >= 46 ? notifyWithSystemSource : notifyWithLegacySource;
