# Notch design baseline (build 21)

The old six-page design-review PPTX and its generator were removed. They described
clipboard history, Quick stash and a helper daemon that no longer exist. Build 21
also removed all Music / MPRIS UI and backend code. This document is the current
design baseline; the implementation lives in `extension/lib/view.js`,
`extension/lib/layout.js`, `extension/lib/geometry.js` and
`extension/stylesheet.css`.

## Product shape

- MacBook-style top-edge notch, not a floating Dynamic Island.
- Closed: 185×32 logical px base, panel-height matched, centered idle clock;
  hover affordance +12×4 px.
- Peek: 440×(panel + 112) logical px.
- Open pages: Home 640×220, Alerts 640×380, System 640×360.
- Default maximum expanded preset: 640×480. Narrow/large-text layouts reserve
  extra height instead of introducing scrollbars outside Alerts.

## Pages

| Page | Primary | Secondary | Controls |
|---|---|---|---|
| Home | Large clock | Small date | None |
| Alerts | Bold notification title | Small body preview, count badge | Show more/less, native actions, dismiss, clear all |
| System | Large metric values | Small labels and details | DND / Night Light / Dark Mode |

## Typography

- Base: 10.5 pt.
- Home clock: 3 em, weight 700.
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
- Status footer: translucent white 6%, radius 12, in-flow reserved height.

## Layout rules

- Header: 44 px, centered three-tab rail between two expanding gutters (76 px
  minimum; 30 px ultra-narrow). Settings/close live inside the right gutter.
- Labels at effective width ≥560 only if the pure header budget fits; otherwise
  icon rail. Ultra-narrow hides settings and keeps close inside the notch.
- System metrics: 2×2 grid at effective width ≥320; single column below.
- Only Alerts owns a ScrollView. Home/System are centered natural blocks.
- Content padding: 20 px horizontal, 8 px top, 16 px bottom.
- No text ellipsis; long text wraps. Long alert bodies preview at 140 chars with
  Show more/Show less. Rendering caps at 50 cards while the badge shows the true
  total.

## Motion

- Open: 420 ms smooth / mac-spring 0.42 s damping 0.8.
- Close: 450 ms smooth / mac-spring 0.45 s damping 1.0.
- Page switch: 160 ms fade/translate.
- Charging cue: green bolt + percentage on plug-in transition, ~1.76 s total
  (140 ms in / hold / 120 ms out), closed notch only, first sample ignored.
- Reduced motion snaps to final geometry.

## Removed

- Build 21: Music tab, MPRIS v2 D-Bus client/interfaces, closed music wings,
  equalizer, seek slider, media icons, `closed-media` setting and `notch-doctor`
  MPRIS check.
- Build 18: Clipboard history, Quick stash / file shelf, drop target, helper
  process, systemd unit, D-Bus service, CLI, storage module, pagination, album
  art, volume controls, decorative empty-state icons and duplicate headings.
