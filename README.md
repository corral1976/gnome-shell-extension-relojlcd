# Retro LCD 7-Segment Clock & Widget

GNOME Shell extension that shows a retro digital LCD-style clock in the top panel, or as a floating widget on the desktop.

Minimalist, lightweight design, true to the classic 7-segment LCD look from the 80s/90s.

---

## Recommended installation

The simplest way is to install it from the official GNOME Extensions site — it updates itself and integrates a bit better that way:

[Get it on GNOME Extensions](https://extensions.gnome.org/extension/9082/reloj-retro-lcd/)

---

## Features

- 7-segment LCD style clock
- 4 font styles: Regular, Bold, Italic and Bold Italic, applied live from the preferences window
- 8 color themes: neon green, amber, retro gray, ruby, sapphire, white, violet and gold
- Custom color picker for digits, separators, alarm dot and border, with a live preview in the preferences window
- Alarm with sound and customizable message
- Built-in preferences panel (GTK4/Adwaita)
- Looks good in both light and dark shell themes
- Desktop widget mode (draggable) or docked to the panel
- Optional flicker effect, for that old-LCD-screen feel

---

## Manual installation

If you'd rather install it by hand instead of using the extensions website:

### 1. Download

```bash
git clone https://gitlab.com/corral1976/gnome-shell-extension-relojlcd.git
cd gnome-shell-extension-relojlcd
```

### 2. Copy the files and compile the schema

```bash
UUID=$(grep -Po '(?<="uuid": ")[^*]*' metadata.json)
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"
mkdir -p "$DEST"
cp -r * "$DEST/"
cd "$DEST"
glib-compile-schemas schemas
```

Don't skip the `glib-compile-schemas` step — if you forget it, the extension won't find its settings and may fail to load.

### 3. Restart GNOME Shell

- On **X11**: press `Alt+F2`, type `r`, hit Enter.
- On **Wayland**: log out and back in (there's no in-session reload shortcut).

### 4. Enable it

```bash
gnome-extensions-app
```

Look for "Retro LCD" in the list and flip the switch on.

If it still doesn't show up after all this, try a full session restart before reporting an issue — that usually does the trick.

---

## Requirements

- GNOME Shell 45, 46, 47 or 48
- The `gnome-extensions-app` (comes preinstalled on most distros)

---

## File structure

```
~/.local/share/gnome-shell/extensions/relojlcd@carlos/

relojlcd@carlos/
├── extension.js
├── colorUtils.js
├── metadata.json
├── prefs.js
├── stylesheet.css
├── DSEG7Classic-Regular.ttf
├── DSEG-LICENSE.txt
├── LICENSE
├── assets/alarm.ogg
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
