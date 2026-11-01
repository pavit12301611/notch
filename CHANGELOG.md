# Changelog

## Unreleased

### v17 — stable centered layout, compact Alerts, clean empty states

- Replace the shifting active-tab label with a fixed, centered icon rail at normal
  widths. All six labels appear only when they genuinely fit; active/inactive
  icons use opacity instead of theme-blue symbolic recoloring.
- Alerts: count actual notification cards, remove the duplicate date heading,
  keep long bodies compact with Show more/Show less, render native actions in a
  centered row, and cap rendering at 50 cards to protect the Shell main loop.
- Music: show a clean empty state when no MPRIS player is connected instead of
  disabled transport/seek clutter. The white play button now uses inverse
  monochrome play/pause icons so the glyph is visible.
- Status messages render in an in-flow footer with reserved height, so errors no
  longer overlay page content. `Invalid GType` becomes a short restart-helper
  message with Retry.
- Hide Shelf/Clips pagers when there is only one page. Bundle missing
  previous/next monochrome icons. Fix the MacBook preset maximum height to 480.
- Bump build to 17.


### v16 — minimal MacBook-notch Home/Music, no volume UI

- Home is now only a centered clock and date. Remove the Home media card, quick
  actions, Quick stash card and recent-file row; Shelf remains the file surface.
- Music removes player volume, system output volume/mute and the raise button.
  It keeps only title/artist/player switcher, progress/seek and previous/play/next.
- Remove the Gvc `AudioController` module entirely so the extension no longer
  connects to the Shell mixer for volume UI.
- Compact open page budgets: Home 640×220, Music 640×300, Alerts 640×380,
  System 640×320, Shelf/Clips 640×400. Only Alerts scrolls.
- Bump build to 16.


### v15 — clean centered UI, Alerts-only scrolling, reliable file stash

- Fix the GTK drop target raising `Invalid GType`: `set_gtypes` now receives
  `Gdk.FileList.__gtype__` and `GObject.TYPE_STRING`, not Python wrapper classes.
  Direct file drops can initialize the stash surface again.
- Remove album-art loading and broken cover placeholders. Music is a clean,
  centered text-first player: title, artist, player switcher, progress, transport
  controls and symmetric player/output volume controls.
- Only Alerts owns a ScrollView. Home/Music/System use fixed centered layouts;
  Shelf and Clips use bounded pagination instead of hidden scrolling.
- Center headers, cards, empty states, file rows, pagers and status messages.
  The tab cluster is centered with equal side gutters.
- Increase default page height budget to 480 px and migrate untouched v14 presets
  so non-scrolling pages fit without clipping. Narrow/large-text layouts reserve
  extra height instead of introducing scrollbars.
- Remove the remote-art setting and outbound art requests.


### v14 — atomic extension installation and discovery diagnostics

- Publish the extension from a validated staging directory instead of writing
  `metadata.json` and JS files in place. GNOME can no longer observe a zero-byte
  metadata file during an upgrade; failed final publication restores the previous
  complete directory.
- Honor `XDG_DATA_HOME` for user installs/uninstalls and keep launcher paths in sync.
- `notch-doctor` now distinguishes installed files from GNOME Shell registration,
  reports load errors/out-of-date state, and tells the user to log out/in when a
  newly installed extension has not been discovered by the current session.
- Build 14 changes installation/diagnostics only; it is not a claimed fix for the
  reported media freeze.

### v13 — media-tab audio stutter / feedback protection

- Programmatic slider updates now suppress `notify::value` feedback for 150 ms,
  so updating the seek/volume sliders cannot re-enter `setVolume`/`seekTo`.
- System and MPRIS volume setters ignore no-op changes, preventing PulseAudio /
  D-Bus feedback loops when a player or sink reports the same volume back.
- MPRIS UI updates are coalesced to at most one per 60 ms, instead of rebuilding
  on every property burst from browsers/YouTube.
- Audio UI updates only run while the Music page is open.
- Album-art loading is single-flight per URL and remote art is rate-limited, so a
  chatty YouTube MPRIS source cannot spawn repeated downloads/decodes.


### v12 — freeze safety for open-notch use

- Geometry animation is now a single-shot Clutter timeline with a hard watchdog
  instead of a repeating timeline. If a spring stalls, the notch snaps to the
  target instead of repainting forever.
- Added a relayout reentrancy guard and a 40-pass/second storm budget; a feedback
  storm temporarily snaps geometry instead of spinning the GNOME Shell main loop.
- Geometry application is rounded/deduplicated, and page lists are no longer
  rebuilt on every layout pass. ScrollView pages keep natural height instead of
  y-expanding inside automatic scrollbars, avoiding allocation feedback loops.
- Local album-art metadata is queried asynchronously so a slow FUSE/network file
  cannot block the Shell main thread.
- The closed-notch equalizer stops itself if an animation error occurs.


### v11 — rhythmic closed-notch equalizer

- The three green media bars now animate continuously with eased `scale_y`
  targets from a looping rhythm pattern, instead of changing CSS height in
  discrete steps. They grow from the bottom edge and stop/reset when playback,
  visibility or animation settings turn off.


### v10 — visible Quick stash, reliable drop/save, real song titles

- Home now uses a compact 640×360 dashboard: clock/date + quick actions, a one-row player card with wrapped song title, and a Quick stash card that stays inside the default viewport. The old 320px preset is migrated to 360px.
- Fixed MPRIS metadata parsing for nested GLib variants, so `xesam:title`, artists, duration and track id are read correctly from browsers/players. Active players with empty metadata show “Playing in …” instead of a misleading “Nothing playing”; disabled controls look disabled.
- Direct file drop now hides the Shell chrome while the GTK drop surface is mapped over the notch, so the drop actually reaches GTK instead of being painted over by the extension. The helper window is reused, positioned again after map, and accepts both `GdkFileList` and URI-list/text drops.
- Document-portal `/run/user/.../doc/...` paths are resolved back to stable host paths when possible. Shelf writes fsync the directory as well as the file.
- Added `notch-shelf add/list/remove/clear/info` as a drag-independent way to stash files and inspect storage; added helper `GetInfo` and doctor build/storage checks.
- Bundled original monochrome chrome icons so third-party Shell/icon themes cannot turn notch controls blue. Album art and notification app icons remain full-color.


### v9 — Home dashboard, direct notch drop, coordinated motion

- Rebuilt Home as a real scrollable page instead of a visibility-switched stack. The clock/date block is always present; Quick stash shows count, Add/Open actions and recent files, so Home cannot render as an empty black body.
- Increased the Home page to 640×320 and kept compact/narrow reflow with vertical scrolling.
- Direct file drop now targets the physical closed/open notch rectangle, not only a separate GTK window below the panel. The helper is prewarmed, positioned by Mutter, and reports success/failure back to the Shell.
- Added `PrepareDropTarget`, `DropCompleted` and `DropFailed` helper D-Bus contracts; successful drops open Shelf and show an in-notch confirmation. Originals are still never moved/copied/deleted.
- Added coordinated page crossfade/slide, open/close content translation, peek fade, status-footer fade and stash pulse. All explicit motion respects Notch animations and GNOME Enable Animations; the GTK drop card respects GTK animations.
- Forced symbolic icon rendering at the notch root and styled notch scrollbars monochrome; album art remains full-color.
- Fixed the remote installer documentation: `NOTCH_REF` belongs to the `bash` process after the pipe. Bootstrap default ref is now `main`; v9 development installs explicitly pin the active branch.
- Added drop-geometry, helper drop-result and v9 contract tests.


### Adaptive layout and action reliability

- Design/spacing polish: 20px content gutters, 44px header, consistent page/list/card spacing, centered empty-state cards, and monochrome symbolic control icons (album art stays full-color).

- Fixed GNOME 50 `No property icon_type on StIcon`: removed the nonexistent property entirely from icon construction and artwork updates. St derives symbolic rendering from the icon source; `is_symbolic` is read-only. Added strict St.Icon constructor/write regression tests.
- Fixed artwork source switching so clearing `icon_name` cannot erase the newly assigned album-art `gicon`.
- `notch-doctor` now compares the loaded extension build with installed metadata and warns when Wayland still has old code loaded.
- Superseded the incomplete version 6 enum guard; version 7 removes the invalid icon property instead of masking the first error.

- Fixed Shelf/Media D-Bus result handling: GJS `call_finish()` returns a `GLib.Variant`; unpack it instead of destructuring it as an array (`{} is not iterable`).
- Header labels now collapse to active-only/icon modes before they can ellipsize; tab labels no longer truncate.

- Fixed Fedora 44 / PyGObject helper startup crash: use `Gio.DBusConnection.register_object_with_closures2` (fallback `register_object`) and `unregister_object`, not nonexistent `*_object_path` methods.
- Fixed `notch-doctor` and companion settings status calls: PyGObject `Variant` results use `unpack()`, not GJS-style `deepUnpack()`.

- Replaced fixed content sizing with monitor-aware geometry and a pure adaptive layout resolver. Header labels collapse to active-only/icon-only before truncating; every page scrolls instead of clipping.
- Added a wrapping, dismissible status bar with actionable helper Retry, replacing clipped raw D-Bus errors.
- Quick actions now keep stable button actors, expose on/off/locked state, and report success/failure instead of silently rebuilding during clicks.
- Shelf helper client has explicit offline/starting/ready states, serialized activation, retry, and friendly activation errors; Copy URI uses a typed GObject value.
- Helper systemd unit no longer depends on a desktop-environment condition; installer resets failed units and imports session environment. `notch-doctor` checks helper service/unit state and can activate the helper.

### MacBook-native redesign v2

- Studied pinned native macOS sources from boring.notch, DynamicNotchKit and NotchDrop; recorded findings and licenses in `docs/DESIGN_STUDY.md`.
- Replaced the rounded-rectangle chrome with a Cairo-flared MacBook silhouette, adaptive 6/14 closed and 19/24 open corners, panel-height closed state and compact music wings.
- Added a top-anchored damped-spring open/close/resize animation with a smooth-easing fallback, per-page sizes and a compact Home page.
- Ordinary notifications now peek inside the notch with native actions instead of forcing the full Alerts page open; critical alerts keep the native banner path.
- Added notch scale, panel-height matching, adaptive corners, closed music wings, motion profile and peek duration settings; migrated untouched earlier presets.

- MacBook-style top-edge notch defaults: replaces the centered top-bar clock, shows idle local time, and expands smoothly from the top edge with configurable open/close durations.
- GNOME notification banners are routed into an Alerts page with native actions, unread count, calendar shortcut and dismiss-all; routing is reversible and restores native banners on disable/hide.
- Added a MacBook preset in both Libadwaita settings UIs and a safe migration for untouched 0.1 defaults.

## 0.1.0 — 2026-10-29

- Initial hybrid GNOME Shell extension + GTK4/Libadwaita companion project.
- MPRIS media, gated system diagnostics, quick toggles, opt-in RAM clipboard history.
- GTK file-drop helper and atomic local-reference shelf.
- User installer, systemd/D-Bus activation, RPM recipe and Fedora CI recipe.
- Pure logic/storage tests and an explicit live Fedora acceptance checklist.

Primary target: Fedora 44 / GNOME 50. Live desktop validation is pending.
