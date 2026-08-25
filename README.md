# Retro LCD 7-Segment Clock & Widget

GNOME Shell extension that shows a retro digital LCD-style clock in the top panel, or as a floating widget on the desktop.

Minimalist, lightweight design, true to the classic 7-segment LCD look from the 80s/90s.

---

## Recommended installation

The simplest way is to install it from the official GNOME Extensions site — it updates itself and integrates a bit better that way:

[Get it on GNOME Extensions](https://extensions.gnome.org/extension/9082/reloj-retro-lcd/)

Repository mirrors: [GitLab](https://gitlab.com/corral1976/gnome-shell-extension-relojlcd) · [GitHub](https://github.com/corral1976/gnome-shell-extension-relojlcd)

---

## Features

- 7-segment LCD style clock
- 4 font styles: Regular, Bold, Italic and Bold Italic, applied live from the preferences window
- 10 color themes: neon green, amber, retro gray, ruby, sapphire, white, violet, gold, VFD teal and Nixie orange
- Custom color picker for digits, separators, alarm dot and border, with a live preview in the preferences window
- Multiple alarms with sound, custom labels and snooze support
- On-screen alarm dialog, so a ringing alarm isn't missed if notifications are silenced (e.g. Do Not Disturb)
- Built-in preferences panel (GTK4/Adwaita), organized into General, Appearance, Alarms and About tabs
- Looks good in both light and dark shell themes
- Desktop widget mode (draggable) or docked to the panel
- Optional flicker effect, for that old-LCD-screen feel
- Ghost segments: faint always-on digit pattern behind the active time, like a real LCD
- Lamp test on startup: briefly flashes all segments when the extension loads
- Minute flicker: a subtle brightness dip whenever the minute changes
- CRT scanlines overlay, for a retro tube/VFD look

---

## Manual installation

Prefer to install it by hand instead of using the extensions website? No problem — just follow these steps one by one in a terminal. If you've never used a terminal before, don't worry: just copy each block of code, paste it in, and press Enter.

### 1. Get the code onto your computer

Open a terminal and paste this in. It will download ("clone") the project to a folder on your computer, and then move you into that folder:

```bash
git clone https://gitlab.com/corral1976/gnome-shell-extension-relojlcd.git
cd gnome-shell-extension-relojlcd
```

> Prefer GitHub over GitLab? Use this instead — it does exactly the same thing, just from a different source:
> ```bash
> git clone https://github.com/corral1976/gnome-shell-extension-relojlcd.git
> cd gnome-shell-extension-relojlcd
> ```

### 2. Install it in the right place

GNOME Shell only looks for extensions in one specific folder. This next block copies the files there and prepares the extension's settings so it works correctly:

```bash
UUID=$(grep -Po '(?<="uuid": ")[^"]*' metadata.json)
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"
mkdir -p "$DEST"
cp -r * "$DEST/"
cd "$DEST"
glib-compile-schemas schemas
```

That last line, `glib-compile-schemas schemas`, is easy to forget but important — it's what lets GNOME understand the extension's settings (colors, fonts, alarm, etc). If you skip it, the extension may not load, or its preferences panel may not open.

### 3. Restart GNOME Shell

Linux needs a quick "refresh" before it will notice the new extension. How you do this depends on the type of desktop session you're using:

- **If you're on X11:** press `Alt+F2`, type `r`, and press Enter. The screen will flicker briefly — that's normal.
- **If you're on Wayland:** X11's shortcut doesn't work here, so you'll need to log out and log back in instead.

> Not sure which one you're using? It's fine — if `Alt+F2` doesn't do anything, that just means you're on Wayland, so simply log out and back in.

### 4. Turn the extension on

Almost done! Open the Extensions app that manages your GNOME extensions:

```bash
gnome-extensions-app
```

Find "Retro LCD" in the list and flip its switch to on. The clock should appear right away.

If nothing shows up after all this, try restarting your whole computer once before assuming something's wrong — that solves it most of the time.

---

## Requirements

- GNOME Shell 45, 46, 47, 48, 49 or 50
- The `gnome-extensions-app` (comes preinstalled on most distros)

---

## File structure

```
~/.local/share/gnome-shell/extensions/relojlcd@carlos/

relojlcd@carlos/
├── extension.js
├── colorUtils.js
├── renderMath.js
├── metadata.json
├── prefs.js
├── stylesheet.css
├── DSEG-LICENSE.txt
├── LICENSE
├── assets/
│   ├── DSEG7Classic-Regular.ttf
│   └── alarm.ogg
└── schemas/
    ├── org.gnome.shell.extensions.relojlcd.gschema.xml
    └── gschemas.compiled  (auto-generated, don't commit it)
```

---

## Support the project

If you like the extension and want to help keep it maintained:

[Buy me a coffee on Ko-fi](https://ko-fi.com/retrolcdclock)

---

## License

- The extension code is licensed under the **MIT License** (see `LICENSE`).
- The bundled font, **DSEG7 Classic** by Keshikan, is licensed under the **SIL Open Font License 1.1** (see `DSEG-LICENSE.txt`). It can be used, embedded, and redistributed for both personal and commercial purposes.

---

## Credits

- **DSEG7 Classic font**: created by **Keshikan** ([keshikan.net](https://www.keshikan.net/fonts-e.html))
- **Font license**: [SIL Open Font License 1.1](http://scripts.sil.org/OFL)

Made by **Carlos Corral**
