import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import { calculateRetroShadowOffset, RETRO_SHADOW_RGBA } from '../shared/renderMath.js';
import {
    calculateCellPixelHeight,
    calculateCellPixelWidth,
    getGlyphAspectRatio,
    resolveGlyphStyleOptions
} from '../shared/glyphAssets.js';
import { getPlaceholderText, getTheme, readLayoutFlags, readStyleConfig } from '../clock/clockConfig.js';
import { SevenSegmentRow } from './sevenSegmentRow.js';

const GHOST_SEGMENTS_OPACITY = 30;
const ALARM_ICON_MIN_RASTER_SIZE = 48;
const SCANLINES_OPACITY = 0.15;
const SCANLINES_LINE_RATIO = 0.08;
const SCANLINES_MIN_SPACING = 2;

export class ClockDisplay {
    #settings;
    #textureCache;
    #rasterScale;
    #clockLabel;
    #shadowLabel;
    #ghostLabel;
    #scanlinesActor;
    #clockContainer;
    #alarmDot;
    #alarmDotShadow;
    #alarmDotWrapper;
    #container;
    #displayWrapper;
    #scanlinesAllocationId;
    #containerAllocationId;
    #scanlinesLastHeight = 0;
    #horizontalCenteringOffset = 0;
    #retroShadowOffset = 0;

    constructor(settings, textureCache, rasterScale, fontSize) {
        this.#settings = settings;
        this.#textureCache = textureCache;
        this.#rasterScale = rasterScale;

        const placeholderText = getPlaceholderText(readLayoutFlags(settings));
        const glyphOptions = resolveGlyphStyleOptions(settings.get_string('font-style'));
        const mainColor = getTheme(settings, settings.get_string('clock-color')).main;
        this.#clockLabel = this.#createRow('reloj-lcd-label', mainColor, placeholderText, glyphOptions, fontSize);
        this.#shadowLabel = this.#createRow('reloj-lcd-shadow-label', RETRO_SHADOW_RGBA, placeholderText, glyphOptions, fontSize);
        this.#ghostLabel = this.#createRow('reloj-lcd-ghost-label', mainColor, placeholderText, glyphOptions, fontSize, { opacity: 0 });

        this.#scanlinesActor = new St.Widget({
            layout_manager: new Clutter.BoxLayout({ orientation: Clutter.Orientation.VERTICAL }),
            reactive: false,
            visible: settings.get_boolean('crt-scanlines'),
            x_expand: true,
            y_expand: true,
            clip_to_allocation: true
        });

        this.#scanlinesAllocationId = this.#scanlinesActor.connect('notify::allocation', () => {
            const [, height] = this.#scanlinesActor.get_size();
            const roundedHeight = Math.round(height);
            if (roundedHeight > 0 && roundedHeight !== this.#scanlinesLastHeight) {
                this.#scanlinesLastHeight = roundedHeight;
                this.#rebuildScanlines(roundedHeight);
            }
        });

        this.#clockContainer = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            offscreen_redirect: Clutter.OffscreenRedirect.ALWAYS,
            x_align: Clutter.ActorAlign.CENTER
        });

        this.#containerAllocationId = this.#clockContainer.connect('notify::allocation', () => this.updateCentering());

        this.#clockContainer.add_child(this.#ghostLabel);
        this.#clockContainer.add_child(this.#shadowLabel);
        this.#clockContainer.add_child(this.#clockLabel);
        this.#clockContainer.set_child_above_sibling(this.#shadowLabel, this.#ghostLabel);
        this.#clockContainer.set_child_above_sibling(this.#clockLabel, this.#shadowLabel);

        this.#alarmDotShadow = new Clutter.Actor({
            reactive: false,
            visible: false,
            x_expand: false,
            y_expand: false,
            content_gravity: Clutter.ContentGravity.RESIZE_FILL,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        this.#alarmDot = new Clutter.Actor({
            reactive: false,
            x_expand: false,
            y_expand: false,
            content_gravity: Clutter.ContentGravity.RESIZE_FILL,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        this.#alarmDotWrapper = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            reactive: false,
            visible: false,
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            accessible_role: Atk.Role.ICON,
            accessible_name: _('Alarm active')
        });
        this.#alarmDotWrapper.add_child(this.#alarmDotShadow);
        this.#alarmDotWrapper.add_child(this.#alarmDot);

        this.#container = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            clip_to_allocation: false,
            x_expand: true,
            y_expand: true
        });
        this.#container.add_child(this.#alarmDotWrapper);
        this.#container.add_child(this.#clockContainer);

        this.#displayWrapper = new St.Widget({
            layout_manager: new Clutter.BinLayout()
        });
        this.#displayWrapper.add_child(this.#container);
        this.#displayWrapper.add_child(this.#scanlinesActor);
        this.#displayWrapper.set_child_above_sibling(this.#scanlinesActor, this.#container);
    }

    get actor() {
        return this.#displayWrapper;
    }

    get clockLabel() {
        return this.#clockLabel;
    }

    get shadowLabel() {
        return this.#shadowLabel;
    }

    get ghostLabel() {
        return this.#ghostLabel;
    }

    get alarmDotWrapper() {
        return this.#alarmDotWrapper;
    }

    destroy() {
        this.#scanlinesActor.disconnect(this.#scanlinesAllocationId);
        this.#clockContainer.disconnect(this.#containerAllocationId);
        this.#displayWrapper.destroy();
        this.#displayWrapper = null;
        this.#container = null;
        this.#clockContainer = null;
        this.#scanlinesActor = null;
        this.#clockLabel = null;
        this.#shadowLabel = null;
        this.#ghostLabel = null;
        this.#alarmDot = null;
        this.#alarmDotShadow = null;
        this.#alarmDotWrapper = null;
    }

    setRasterScale(scale) {
        this.#rasterScale = scale;
        this.#clockLabel.setRasterScale(scale);
        this.#shadowLabel.setRasterScale(scale);
        this.#ghostLabel.setRasterScale(scale);
    }

    setTime(timeStr, fontSize) {
        const colorType = this.#settings.get_string('clock-color');
        const glow = this.#settings.get_double('glow-intensity');
        const glyphOptions = resolveGlyphStyleOptions(this.#settings.get_string('font-style'));

        this.#clockLabel.setText(timeStr, getTheme(this.#settings, colorType).main, fontSize, glyphOptions);
        if (colorType === 'gray' && glow >= 1)
            this.#shadowLabel.setText(timeStr, RETRO_SHADOW_RGBA, fontSize, glyphOptions);

        this.updateCentering();
    }

    updateStyle(fontSize) {
        const config = readStyleConfig(this.#settings, fontSize);
        const theme = getTheme(this.#settings, config.colorType);

        this.#applyContainerOrientation(config);
        this.#updateShadowLabel(config);
        this.#updateGhostLabel(config, theme);
        this.#container.set_style(this.#buildContainerStyle(config, theme));
        this.#updateAlarmDotAppearance(config, theme);
        this.updateCentering();
    }

    getGhostOpacity() {
        return this.#settings.get_boolean('ghost-segments') ? GHOST_SEGMENTS_OPACITY : 0;
    }

    updateGhostOpacity() {
        this.#ghostLabel.set_opacity(this.getGhostOpacity());
    }

    updateScanlines() {
        this.#scanlinesActor.visible = this.#settings.get_boolean('crt-scanlines');
    }

    updateAlarmDot(hasEnabledAlarm) {
        this.#alarmDotWrapper.visible = hasEnabledAlarm || this.#settings.get_boolean('ghost-segments');
        this.#alarmDot.opacity = hasEnabledAlarm ? 255 : GHOST_SEGMENTS_OPACITY;
    }

    updateCentering() {
        const [availableWidth] = this.#clockContainer.get_size();
        if (availableWidth <= 0) return;

        const [, naturalWidth] = this.#clockLabel.get_preferred_width(-1);
        const overflow = Math.max(0, naturalWidth - availableWidth);
        this.#horizontalCenteringOffset = -overflow / 2;
        this.#clockContainer.clip_to_allocation = overflow > 0.5;

        this.#clockLabel.set_translation(this.#horizontalCenteringOffset, 0, 0);
        this.#ghostLabel.set_translation(this.#horizontalCenteringOffset, 0, 0);
        this.#applyShadowLabelTranslation();
    }

    #createRow(styleClass, color, text, glyphOptions, fontSize, extraParams = {}) {
        const row = new SevenSegmentRow(this.#textureCache, {
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            style_class: styleClass,
            ...extraParams
        });
        row.setRasterScale(this.#rasterScale);
        row.setText(text, color, fontSize, glyphOptions);
        return row;
    }

    #applyShadowLabelTranslation() {
        this.#shadowLabel.set_translation(
            this.#horizontalCenteringOffset + this.#retroShadowOffset,
            this.#retroShadowOffset,
            0);
    }

    #rebuildScanlines(height) {
        this.#scanlinesActor.remove_all_children();

        const lineSpacing = Math.max(SCANLINES_MIN_SPACING, Math.round(height * SCANLINES_LINE_RATIO));
        const barCount = Math.floor(height / lineSpacing);
        this.#scanlinesActor.layout_manager.spacing = Math.max(0, lineSpacing - 1);

        for (let i = 0; i < barCount; i++) {
            this.#scanlinesActor.add_child(new St.Widget({
                style: `background-color: rgba(0, 0, 0, ${SCANLINES_OPACITY}); height: 1px;`,
                x_expand: true
            }));
        }
    }

    #applyContainerOrientation(config) {
        this.#container.orientation = config.compact ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;
        this.#alarmDotWrapper.x_align = config.compact ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START;
    }

    #updateGhostLabel(config, theme) {
        this.#ghostLabel.setText(
            getPlaceholderText(config),
            theme.main,
            config.fontSize,
            resolveGlyphStyleOptions(config.fontStyle));
        this.updateGhostOpacity();
    }

    #updateShadowLabel(config) {
        if (config.colorType === 'gray' && config.glow >= 1) {
            this.#retroShadowOffset = calculateRetroShadowOffset(config.glow, config.fontSize);
            this.#applyShadowLabelTranslation();
            this.#shadowLabel.setText(
                getPlaceholderText(config),
                RETRO_SHADOW_RGBA,
                config.fontSize,
                resolveGlyphStyleOptions(config.fontStyle));
            this.#shadowLabel.show();
        } else {
            this.#retroShadowOffset = 0;
            this.#shadowLabel.hide();
        }
    }

    #buildContainerStyle(config, theme) {
        const props = [
            `background-color: ${theme.bg}`,
            `border-radius: 8px`,
            `box-shadow: ${this.#calculateBoxShadow(config.colorType, config.glow, theme)}`,
            `padding: 2px ${config.horizontalPadding.toFixed(1)}px`
        ];

        if (config.showFrame)
            props.push(`border: 1px solid ${theme.border}`);

        return props.join('; ') + ';';
    }

    #calculateBoxShadow(colorType, glow, theme) {
        if (colorType === 'gray' || glow <= 0) return 'none';

        const glowIntensity = glow / 10;
        const withAlpha = (rgba, alpha) => rgba.replace(/[\d.]+\)$/, `${alpha})`);
        const boxGlowColor = withAlpha(theme.glow, 0.1 + glowIntensity * 0.5);
        const blurSize = 5 + glowIntensity * 35;
        return `0 0 ${blurSize.toFixed(1)}px ${boxGlowColor}`;
    }

    #updateAlarmDotAppearance(config, theme) {
        const slotHeight = calculateCellPixelHeight(config.fontSize);
        const slotWidth = calculateCellPixelWidth(config.fontSize, '8');
        const showGhostShadow = config.colorType === 'gray' && config.glow >= 1;
        const shadowOffset = showGhostShadow ? calculateRetroShadowOffset(config.glow, config.fontSize) : 0;

        const glyphOptions = resolveGlyphStyleOptions(config.fontStyle);
        const iconOptions = { ...glyphOptions, bold: true };

        const iconAspect = getGlyphAspectRatio('alarm', glyphOptions.italic);
        const iconHeight = Math.max(1, Math.round(slotHeight));
        const iconWidth = Math.max(1, Math.round(slotHeight * iconAspect));

        const rasterWidth = Math.max(iconWidth * this.#rasterScale, ALARM_ICON_MIN_RASTER_SIZE * iconAspect);
        const rasterHeight = Math.max(iconHeight * this.#rasterScale, ALARM_ICON_MIN_RASTER_SIZE);

        this.#alarmDotWrapper.set_size(Math.max(1, Math.round(slotWidth)), Math.max(1, Math.round(slotHeight)));
        const marginSide = config.compact ? 'margin-bottom' : 'margin-right';
        this.#alarmDotWrapper.set_style(`${marginSide}: ${(slotWidth * 0.15).toFixed(1)}px;`);

        this.#alarmDot.set_size(iconWidth, iconHeight);
        this.#alarmDot.set_content(
            this.#textureCache.getImage('alarm', theme.main, rasterWidth, rasterHeight, iconOptions));

        if (showGhostShadow) {
            this.#alarmDotShadow.set_size(iconWidth, iconHeight);
            this.#alarmDotShadow.set_content(
                this.#textureCache.getImage('alarm', RETRO_SHADOW_RGBA, rasterWidth, rasterHeight, iconOptions));
            this.#alarmDotShadow.set_translation(shadowOffset, shadowOffset, 0);
            this.#alarmDotShadow.show();
        } else {
            this.#alarmDotShadow.hide();
        }
    }
}
