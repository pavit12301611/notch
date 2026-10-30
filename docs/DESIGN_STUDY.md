# MacBook notch design study

This project takes its product/visual direction from **native macOS notch apps**, not
from GNOME notch extensions. GNOME Shell source is used only to understand the
Wayland/Shell integration constraints.

Pinned references inspected on 2026-10-30:

| Project | Commit | License | What we learned |
|---|---|---|---|
| [TheBoredTeam/boring.notch](https://github.com/TheBoredTeam/boring.notch) | `23e7705a4ffcb5d97a54fb1d4135e180084a566d` | GPL-3.0 | Closed notch follows the real cutout/menu-bar height; open home is 640×190 pt; closed radii 6/14, open 19/24; spring open 0.42 s / damping 0.8, close 0.45 s / damping 1.0; compact music wings, hover growth, shelf and live-activity peeks. |
| [mrkai77/DynamicNotchKit](https://github.com/mrkai77/DynamicNotchKit) | `cd0b3e52d537db115ad3a9d89601f20e0bee8d27` | MIT | The original flared `NotchShape`, separate compact leading/trailing content, top-anchored expansion, fixed expanded content with opacity/scale transition, and distinct notch vs floating styles. |
| [Lakr233/NotchDrop](https://github.com/Lakr233/NotchDrop) | `e70b3d715a99e47de6eb823540282eafc7401a3a` | MIT | A focused 600×160 pt shelf, drag-to-open, dashed drop target, temporary file storage and a single interactive spring for state changes. |

## Concrete decisions for Notch on GNOME

- **Shape:** black surface flush with the top edge, small outward top flares and
  larger bottom corners. This is a MacBook notch silhouette, not a rounded
  rectangle or a floating Dynamic Island. The flare is drawn with Cairo; the body
  uses St CSS bottom radii.
- **Closed state:** match the GNOME panel height by default, base width 185
  logical px, centered idle clock. While music plays, small album-art and playback
  indicator wings grow from the sides without increasing height. Hover adds a
  restrained 12×4 px affordance.
- **Opening:** top edge stays pinned; width/height/radii move together with a
  damped spring. Open home is 640×210 logical px (the extra height accommodates a
  compact tab header). Other pages size to their content instead of forcing every
  page into one large utility window.
- **Motion:** open response 0.42 s / damping 0.8; close 0.45 s / damping 1.0;
  page resize 0.38 s / damping 0.8. The frame timeline runs only while a spring is
  moving. Reduced motion / disabled animation snaps to the final state.
- **Notifications:** ordinary notifications become compact in-notch peeks with
  native actions; they remain in GNOME's notification history. Critical
  notifications keep the native banner path. Opening the full Alerts page is an
  explicit click, not an automatic full-window interruption.
- **Shelf:** keep the existing reversible GTK drop helper and reference-only
  storage, but present it as a focused shelf page with a clear drop affordance.
- **Settings:** Libadwaita remains the native settings surface; the notch itself
  uses a dark, compact, Mac-inspired visual language.

No Apple proprietary code or assets are used. The geometry/spring implementation
is independent GJS/Cairo/St code informed by the open-source references above.
The macOS projects' licenses are recorded here for attribution; this project is
GPL-3.0-or-later.
