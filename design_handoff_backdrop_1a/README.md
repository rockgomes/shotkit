# Handoff: Backdrop — "Obsidian" editor shell (option 1a)

## Overview
Backdrop is a macOS desktop app for turning UI screenshots into share-ready images (dribbble shots, twitter posts, etc.): the screenshot sits inside a device/browser frame, centered on a gradient background with noise and shadow, then exports at a template size. This handoff covers **option 1a ("Obsidian")** — the dark, dense, three-pane editor.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to ship. Recreate this design in your target codebase's environment (SwiftUI/AppKit, Electron + React, Tauri, etc.) using its established patterns. If no environment exists yet, pick the most appropriate stack for a macOS app and implement there.

`Backdrop Mockups.dc.html` contains three design options; implement the one wrapped in `id="1a"` (`data-screen-label="1a Obsidian — dark three-pane"`). Ignore options 1b and 1c. `image-slot.js` is prototype-only scaffolding (a drag-drop placeholder) — replace with your real file-import flow.

## Fidelity
**High-fidelity.** Colors, type, spacing, and copy are final intent — recreate pixel-perfectly.

## Screens / Views

### Editor (single window, frameless)
Window: 1180 × 764, background `#0b0c0e`, 1px border `#26282e`, radius 12. Fonts: **Geist** (UI), **Geist Mono** (numbers, sizes, meta labels — always). Layout is a column: toolbar (48px) → main row (fills).

**Toolbar (h 48, border-bottom 1px `#1b1d22`, padding 0 14)**
- Traffic lights (12px circles `#ff5f57 #febc2e #28c840`, gap 7), 1×18 divider `#1f2126`.
- Breadcrumb: "Backdrop" (12.5px, 600, `#e8eaee`) · "/" `#4b4f58` · filename in Geist Mono 11.5px `#9ba1ab` (e.g. `onboarding-flow.png`).
- Right group (gap 8): zoom stepper `− 72% +` (h 28, border `#26282e`, radius 7, mono 11px, value white); "Copy" ghost button (h 28, border `#26282e`, radius 7, 12px `#c6cad2`); "Export" primary (h 28, radius 7, bg `#f2f3f5`, text `#0b0c0e`, 12px/600).

**Icon rail (w 52, border-right `#1b1d22`, padding 12 0, gap 6, centered column)**
- App mark: 30px, radius 8, `linear-gradient(135deg,#5b6cff,#a24ff0)`, white "B" 13px/700, 10px bottom margin.
- Nav items: 32px squares, radius 8; active = bg `#1a1c20` + icon `#e8eaee`; inactive icon `#6b7078`. Order: canvas (active), library, presets, integrations; settings pinned to bottom. Prototype uses unicode glyphs — use your icon set.

**Sidebar (w 226, border-right `#1b1d22`, padding 12)**
- Search field mock: h 30, border `#1f2126`, radius 8, placeholder `#6b7078` 12px.
- Section labels: Geist Mono 10px, letter-spacing .12em, `#6b7078`, uppercase ("TEMPLATES", "PRESETS").
- Template rows: h 32, radius 8, padding 0 10; name 12.5px; size right-aligned Geist Mono 10.5px `#565b64`. Selected row: bg `#17191d`, border `#26282e`, name 500 white, size `#8a8f98`. Items: Dribbble shot 2800×2100 (selected), Twitter post 1600×900, Twitter header 1500×500, App Store 2880×1800, Open Graph 2400×1260, Instagram 2160×2160, "+ Custom size" (dashed border `#2c2f36`, `#6b7078`).
- Preset rows: h 30, 14px gradient swatch (radius 4) + name 12.5px `#c6cad2`. Aurora blur / Studio gray / Candy pop.
- Bottom CLI card: border `#1f2126`, radius 10, padding 10 11; `$ backdrop watch ./shots` in mono 10.5px `#8a8f98`; status line 6px green dot `#28c840` + "CLI connected" 11px `#9ba1ab`.

**Canvas (flex 1, bg `#0e0f12`, dot grid `radial-gradient(circle,#1c1e23 1px,transparent 1px)` 22px)**
- Centered artboard 560×420 (4:3), radius 10, shadow `0 20px 60px rgba(0,0,0,.55)`; background = active gradient, default `linear-gradient(135deg,#2563eb 0%,#7c3aed 48%,#ec4899 100%)`; SVG fractal-noise overlay at 16% opacity.
- Inside, browser frame at 76% width, radius 10, shadow `0 24px 50px rgba(6,8,16,.45)`. Dark chrome: bar h 32 bg `#1b1d22`, border `rgba(255,255,255,.09)`, 8px traffic dots, URL pill h 18 bg `rgba(255,255,255,.07)` mono 9.5px `#9ba1ab`. Body = the user's screenshot (`#101114` empty state).
- Bottom-center caption: mono 10.5px `#6b7078` — "2800 × 2100 · dribbble shot · @2x".

**Inspector (w 266, border-left `#1b1d22`; sections padded 14, separated by `#1b1d22`)**
Section headers same mono label style as sidebar. Control patterns:
- Segmented control: h 28, border `#26282e`, radius 8; active cell bg `#22252b` white 500; inactive `#8a8f98`; 11.5px.
- Sliders: label row (11.5px `#9ba1ab` + mono value 10.5px white), track 3px `#26282e`, fill `#e8eaee`, thumb 11px white circle.
- Chips: h 24, pill radius 12; selected bg `#f2f3f5` text `#0b0c0e` 600; unselected border `#26282e` text `#8a8f98`; 11.5px.

Sections:
1. **BACKGROUND** — type segmented (Solid / **Linear** / Mesh); six 26px gradient swatches (radius 7; selected gets 2px `#e8eaee` outline, offset 2); Angle slider (135°, ~62%); Noise slider (16%).
2. **FRAME** — chips None / **Browser** / macOS / iPhone; "Chrome theme" row with Dark/Light mini-segmented (Dark active); Padding slider (64, ~40%); Shadow slider (40%).
3. **EXPORT** — format select "PNG ▾" (h 28, border `#26282e`) beside 1x/**2x**/3x mono segmented; full-width primary button h 34 radius 8 bg `#f2f3f5` text `#0b0c0e` "Export PNG · 2800×2100"; footnote mono 10px `#565b64` "~1.4 MB · saves to ~/Exports".

## Interactions & Behavior (intent — not built in the prototype)
- Drop or paste a screenshot anywhere on the canvas → fills the frame body.
- Template selection resizes the artboard aspect + export dimensions; Export button label reflects them.
- Background type toggles which controls show (solid = color swatches, linear = angle, mesh = seed).
- Frame chips swap the mockup chrome (none / browser / macOS window / iPhone); chrome theme flips its palette (dark: chrome `#1b1d22` body `#101114`; light: chrome `#f6f7f9` body `#fff`, borders `#e3e5ea`).
- Sliders update the artboard live (noise opacity, shadow strength/blur, padding = frame scale within artboard).
- Zoom stepper scales the canvas view only. Copy = render to clipboard; Export = write file to `~/Exports` at chosen scale.
- Hover: rows/buttons lighten one step (`#16181c`-ish); no motion beyond that.
- CLI integration: a companion CLI can watch a folder and apply the current preset (out of scope for UI v1 beyond the status card).

## State Management
- `document`: source image, filename.
- `template`: id + export {w, h}.
- `background`: {type: solid|linear|mesh, colors[], angle, noisePct}.
- `frame`: {kind: none|browser|macos|iphone, theme: dark|light, paddingPx, radiusPx, shadowPct}.
- `export`: {format: png|jpeg|webp, scale: 1|2|3}.
- `view`: zoom. Presets = saved {background + frame} bundles.

## Design Tokens
- Surfaces: window `#0b0c0e` · canvas `#0e0f12` · raised `#17191d` / `#1a1c20` · active control `#22252b`
- Borders: strong `#26282e` · hairline `#1b1d22` / `#1f2126` · dashed `#2c2f36`
- Text: primary `#e8eaee` · secondary `#c6cad2` · muted `#9ba1ab` · faint `#8a8f98` / `#6b7078` · disabled `#565b64`
- Inverse (primary actions): bg `#f2f3f5`, text `#0b0c0e`
- Brand gradient: `#5b6cff → #a24ff0` (135°); default canvas gradient `#2563eb → #7c3aed → #ec4899`
- Traffic lights / status green: `#ff5f57 #febc2e #28c840`
- Type: Geist 400–700 (UI 11.5–13px), Geist Mono (meta 9.5–11px, labels 10px @ .12em tracking, uppercase)
- Radii: 7–8 controls, 10 cards, 12 window, 12 pill chips. Spacing rhythm: 4/6/8/10/12/14.

## Assets
No image assets. Fonts from Google Fonts (Geist, Geist Mono). Icons in the prototype are unicode placeholders — substitute a 1.5px-stroke icon set (e.g. Lucide). Noise is an inline SVG `feTurbulence` texture.

## Files
- `Backdrop Mockups.dc.html` — the prototype; option 1a is the section with `id="1a"`.
- `image-slot.js` — prototype-only drop-target helper (do not ship).
