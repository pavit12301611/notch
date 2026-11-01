# Notch design baseline (build 19)

The old six-page design-review PPTX and its generator were removed. They described
clipboard history, Quick stash and a helper daemon that no longer exist. This
document is the current design baseline; the implementation lives in
`extension/lib/view.js`, `extension/lib/layout.js`, `extension/lib/geometry.js`
and `extension/stylesheet.css`.

## Product shape

- MacBook-style top-edge notch, not a floating Dynamic Island.
- Closed: 185×32 logical px base, panel-height matched, centered idle clock.
- Music wings: +64 px width while a player is active; 28 px wings, 16 px glyph,
  3×14 px equalizer bars, centered vertically; hover affordance +12×4 px.
- Peek: 440×(panel + 112) logical px.
- Open pages: Home 640×220, Music 640×320, Alerts 640×380, System 640×360.
- Default maximum expanded preset: 640×480. Narrow/large-text layouts reserve
  extra height instead of introducing scrollbars outside Alerts.

## Pages

| Page | Primary | Secondary | Controls |
|---|---|---|---|
| Home | Large clock | Small date | None |
| Music | Large title | Small artist, player name, timestamps | Previous / play-pause / next, seek, player switch |
| Alerts | Bold notification title | Small body preview, count badge | Show more/less, native actions, dismiss, clear all |
| System | Large metric values | Small labels and details | DND / Night Light / Dark Mode |

## Typography

- Base: 10.5 pt.
- Home clock: 3 em, weight 700.
- Music title: 1.45 em, weight 700; artist 0.95 em muted.
- System value: 1.65 em, weight 700; label 0.75 em muted; detail 0.8 em muted.
- Alert title: 1.02 em, weight 700; body 0.9 em.
- Page title: 1.1 em, weight 700.
- Tab label: 0.9 em, weight 600.

## Depth and surfaces

- Notch body: pure black.
- Cards: `#17171a`, 1 px border `rgba(255,255,255,0.07)`, radius 16, inset top
  highlight `rgba(255,255,255,0.04)`.
- Tab rail: translucent white 6%, radius 13, 3 px padding.
- Active tab: translucent white 16%, inset highlight.
- Quick action: `#1c1c1e`, radius 12; active state translucent white 18%.
- Play button: white surface with inverse monochrome glyph.
- Status footer: translucent white 6%, radius 12, in-flow reserved height.

## Layout rules

- Header: 44 px, centered four-tab rail between two expanding gutters (76 px
  minimum; 30 px ultra-narrow). Settings/close live inside the right gutter.
- Labels at effective width ≥560 only if the pure header budget fits; otherwise
  icon rail. Ultra-narrow hides settings and keeps close inside the notch.
- System metrics: 2×2 grid at effective width ≥320; single column below.
- Only Alerts owns a ScrollView. Home/Music/System are centered natural blocks.
- Content padding: 20 px horizontal, 8 px top, 16 px bottom.
- No text ellipsis; long text wraps. Long alert bodies preview at 140 chars with
  Show more/Show less. Rendering caps at 50 cards while the badge shows the true
  total.

## Motion

- Open: 420 ms smooth / mac-spring 0.42 s damping 0.8.
- Close: 450 ms smooth / mac-spring 0.45 s damping 1.0.
- Page switch: 160 ms fade/translate.
- Equalizer: 8-step pattern, 210 ms timer, 190 ms eased `scale_y`, only while
  closed, visible, playing and animations enabled.
- Charging cue: green bolt + percentage on plug-in transition, ~1.76 s total
  (140 ms in / hold / 120 ms out), closed notch only, first sample ignored.
- Reduced motion snaps to final geometry.

## Removed in build 18

- Clipboard history tab, controller, schema keys, D-Bus method and prefs.
- Quick stash / file shelf tab, drop target, helper process, systemd unit,
  D-Bus service, CLI, storage module and packaging payload.
- Pagination, album art, volume controls, decorative empty-state icons,
  duplicate headings and helper retry/status clutter.
