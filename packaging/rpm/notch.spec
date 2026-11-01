Name:           notch
Version:        0.1.0
Release:        3%{?dist}
Summary:        Native GNOME notch with media, notifications and system status
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
in-notch notifications, MPRIS media controls, procfs diagnostics, UPower
battery state and GNOME quick actions. There is no background helper daemon,
clipboard history or file shelf. Primary target: Fedora 44, GNOME 50.

%prep
%autosetup -n %{name}-%{version}

%build
make stage PREFIX=%{_prefix} SYSCONFDIR=%{_sysconfdir}

%install
%make_install PREFIX=%{_prefix} SYSCONFDIR=%{_sysconfdir} SYSTEMDUSERDIR=%{buildroot}%{_userunitdir}
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
* Sun Nov 01 2026 Notch contributors <noreply@github.com> - 0.1.0-3
- Bound the expanded header, correct the left top flare, restore closed music
  wings and add a sub-two-second plug-in charging cue.

* Sun Nov 01 2026 Notch contributors <noreply@github.com> - 0.1.0-2
- Remove clipboard history and the file shelf/helper completely.
- Four-page UI overhaul: Home, Music, Alerts, System.

* Thu Oct 29 2026 Notch contributors <noreply@github.com> - 0.1.0-1
- Initial Fedora-ready hybrid extension and GTK4 companion package.
