# Retro LCD 7-Segment Clock & Widget

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitLab release](https://img.shields.io/gitlab/v/release/corral1976%2Fgnome-shell-extension-relojlcd)](https://gitlab.com/corral1976/gnome-shell-extension-relojlcd/-/releases)
[![pipeline status](https://gitlab.com/corral1976/gnome-shell-extension-relojlcd/badges/main/pipeline.svg)](https://gitlab.com/corral1976/gnome-shell-extension-relojlcd/-/commits/main)

GNOME Shell extension that shows a retro digital LCD-style clock in the top panel, or as a floating widget on the desktop.

Minimalist, lightweight design, true to the classic 7-segment LCD look from the 80s/90s. No fonts to install, no bundled audio files — everything the clock needs is drawn or played from what's already on your system.

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
- Multiple alarms with sound, custom labels and snooze support — the alarm sound plays through GNOME Shell's own sound theme, no extra audio file needed
- On-screen alarm dialog, so a ringing alarm isn't missed if notifications are silenced (e.g. Do Not Disturb)
- Built-in preferences panel (GTK4/Adwaita), organized into General, Appearance, Alarms and About tabs
- Looks good in both light and dark shell themes
- Desktop widget mode (draggable) or docked to the panel
- Optional flicker effect, for that old-LCD-screen feel
- Ghost segments: faint always-on digit pattern behind the active time, like a real LCD
- Lamp test on startup: briefly flashes all segments when the extension loads
- Minute flicker: a subtle brightness dip whenever the minute changes
- CRT scanlines overlay, for a retro tube/VFD look
- Toggleable display border: hide just the outline, keeping the background and glow
- Quick color menu: click the panel indicator for instant theme switching without opening full Preferences
- Update notice: a one-time notification (with the extension's icon) lets you know when it has updated to a new version

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

## The clock shows blank or broken digits

The digits are drawn from small vector shapes embedded directly in `glyphAssets.js` — not from
a system font and not from separate asset files — so this is rare. If it happens, it's almost
certainly a JavaScript error rather than a missing file; check the extension's logs
(`journalctl -f -o cat /usr/bin/gnome-shell` while it happens, or the Looking Glass extension
inspector) for anything mentioning `relojlcd`.

**1. Restart GNOME Shell (or log out and back in).** On X11: `Alt+F2`, type `r`, Enter. On
Wayland: log out and log back in (the X11 shortcut won't do anything, so that's the sign
you're on Wayland).

**2. Turn the extension off and back on** in the Extensions app (`gnome-extensions-app`)
after restarting.

If you did both and it still looks wrong, please open an issue with your GNOME Shell version
(`gnome-shell --version`) and whether you're on X11 or Wayland (`echo $XDG_SESSION_TYPE`).

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
├── glyphAssets.js
├── glyphTexture.js
├── sevenSegmentRow.js
├── metadata.json
├── prefs.js
├── stylesheet.css
├── DSEG-LICENSE.txt
├── LICENSE
├── README.md
└── schemas/
    ├── org.gnome.shell.extensions.relojlcd.gschema.xml
    └── gschemas.compiled  (auto-generated, don't commit it)
```

The digit glyphs don't ship as separate files — they're embedded as SVG path data directly
in `glyphAssets.js` and drawn at runtime, so there's nothing under `assets/` to install for
them. The original per-glyph `.svg` reference files used while designing them live in this
repository (see the source tree on GitLab/GitHub) but aren't part of the packaged
extension. The alarm sound isn't bundled either — it plays through GNOME Shell's own sound
theme, so there's no audio file to ship or keep in sync. The one-time notification shown
after an update uses a stock symbolic icon from the system theme, so there's no image file
to ship for it either.

---

## Support the project

If you like the extension and want to help keep it maintained:

[Buy me a coffee on Ko-fi](https://ko-fi.com/retrolcdclock)

---

## License

- The extension code is licensed under the **MIT License** (see `LICENSE`).
- The digit glyphs are embedded as SVG path data inside `glyphAssets.js`, derived from the
  shapes of the **DSEG7 Classic** font by Keshikan. No `.ttf` file is bundled or installed
  on your system — the extension draws the digits directly from this embedded data.
  Because the glyph shapes are still a derivative of DSEG7, the font's **SIL Open Font
  License 1.1** (see `DSEG-LICENSE.txt`) applies to them and is bundled alongside the
  code, as the OFL requires for derivative works.
- The alarm sound is played from GNOME Shell's own system sound theme, not from a file
  bundled with the extension, so no separate audio license applies.

---

## Credits

- **DSEG7 Classic font**: original design by **Keshikan** ([keshikan.net](https://www.keshikan.net/fonts-e.html)), whose glyph shapes were adapted into this extension's embedded SVG data
- **Font license**: [SIL Open Font License 1.1](http://scripts.sil.org/OFL)

Made by **Carlos Corral**
