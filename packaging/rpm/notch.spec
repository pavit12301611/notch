Name:           notch
Version:        0.1.0
Release:        7%{?dist}
Summary:        Native GNOME notch with notifications and system status
License:        GPL-3.0-or-later
URL:            https://github.com/pavit12301611/notch
Source0:        %{name}-%{version}.tar.gz
BuildArch:      noarch

BuildRequires:  make
BuildRequires:  glib2-devel
BuildRequires:  desktop-file-utils
Requires:       gnome-shell >= 46
Requires:       python3-gobject
Requires:       gtk4
Requires:       libadwaita >= 1.4
Requires:       glib2
Requires:       upower
Requires:       adwaita-icon-theme
Requires:       hicolor-icon-theme
Recommends:     gnome-extensions-app

%description
Notch is a hybrid GNOME Shell extension and GTK4/Libadwaita settings app.
The extension owns the animated MacBook-style top-edge overlay: idle clock,
in-notch notifications, procfs diagnostics, UPower battery state and GNOME
quick actions. There is no background helper daemon, music player, clipboard
history or file shelf. Primary target: Fedora 45, GNOME 51.

%prep
%autosetup -n %{name}-%{version}

%build
make stage PREFIX=%{_prefix} SYSCONFDIR=%{_sysconfdir}

%install
%make_install PREFIX=%{_prefix} SYSCONFDIR=%{_sysconfdir} SYSTEMDUSERDIR=%{buildroot}%{_userunitdir}
rm -f %{buildroot}%{_datadir}/gnome-shell/.notch@pavit12301611.github.io.install.lock
desktop-file-validate %{buildroot}%{_datadir}/applications/io.github.pavit12301611.Notch.desktop
# The shared schema directory is compiled by Fedora's glib2 file trigger.
glib-compile-schemas %{buildroot}%{_datadir}/gnome-shell/extensions/notch@pavit12301611.github.io/schemas

%files
%license LICENSE
%doc README.md
%{_bindir}/notch-settings
%{_bindir}/notch-doctor
%{_datadir}/notch/
%{_datadir}/gnome-shell/extensions/notch@pavit12301611.github.io/
%{_datadir}/glib-2.0/schemas/io.github.pavit12301611.Notch.gschema.xml
%{_datadir}/applications/io.github.pavit12301611.Notch.desktop
%{_datadir}/icons/hicolor/scalable/apps/io.github.pavit12301611.Notch.svg

%changelog
* Tue Nov 10 2026 Notch contributors <noreply@github.com> - 0.1.0-7
- Restore notch visibility after exiting GNOME Activities Overview by listening
  to Main.overview 'hidden' in addition to 'hiding' and reading visibleTarget
  in syncVisibility().
- Fix PyGObject GLib.Variant construction in notch-doctor for Shell registration.
- Build 23.

* Tue Nov 10 2026 Notch contributors <noreply@github.com> - 0.1.0-6
- Fix System page live telemetry: connect UPower DisplayDevice on Gio.DBus.system,
  parse hex /proc/net/route flags (including VPN/point-to-point default routes),
  add fast 250ms initial CPU/Network delta warmup and Gio.File procfs fallback,
  and display Offline instead of a permanent ellipsis when no NIC is active.
- Build 22.

* Tue Nov 10 2026 Notch contributors <noreply@github.com> - 0.1.0-5
- Remove all music and MPRIS media functionality from both extension frontend
  and Python companion/backend: Music tab, MPRIS D-Bus client/interfaces, closed
  music wings/equalizer, media icons, and related schema/settings/doctor checks.
- Build 21.

* Fri Nov 06 2026 Notch contributors <noreply@github.com> - 0.1.0-4
- Add Fedora 45 / GNOME Shell 51 support: declare shell-version 46-51 and use
  St.BoxLayout:orientation with a :vertical fallback for Shell 46/47, where
  Shell 51 removed the deprecated :vertical property.
- Honour St reduced-motion in addition to enable-animations for all notch
  transitions and the closed-state equalizer.
- Build 20. CI container moved to Fedora 45.

* Sun Nov 01 2026 Notch contributors <noreply@github.com> - 0.1.0-3
- Bound the expanded header, correct the left top flare, restore closed music
  wings and add a sub-two-second plug-in charging cue.

* Sun Nov 01 2026 Notch contributors <noreply@github.com> - 0.1.0-2
- Remove clipboard history and the file shelf/helper completely.
- Four-page UI overhaul: Home, Music, Alerts, System.

* Thu Oct 29 2026 Notch contributors <noreply@github.com> - 0.1.0-1
- Initial Fedora-ready hybrid extension and GTK4 companion package.
