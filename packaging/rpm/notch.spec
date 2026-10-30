Name:           notch
Version:        0.1.0
Release:        1%{?dist}
Summary:        Native GNOME notch with media, diagnostics and a file shelf
License:        GPL-3.0-or-later
URL:            https://github.com/pavit12301611/notch
Source0:        %{name}-%{version}.tar.gz
BuildArch:      noarch

BuildRequires:  make
BuildRequires:  glib2-devel
BuildRequires:  desktop-file-utils
BuildRequires:  systemd-rpm-macros
Requires:       gnome-shell >= 46
Requires:       python3-gobject
Requires:       gtk4
Requires:       libadwaita >= 1.4
Requires:       glib2
Requires:       libsoup3
Requires:       upower
Requires:       adwaita-icon-theme
Requires:       hicolor-icon-theme
Recommends:     gnome-extensions-app
%{?systemd_requires}

%description
Notch is a hybrid GNOME Shell extension and GTK4/Libadwaita application.
The extension owns the animated overlay; Python companions provide settings,
a GTK file-drop surface and a bounded local file-reference shelf. MPRIS media,
procfs diagnostics, UPower battery state and RAM-only clipboard history are
integrated without a polling media daemon. Primary target: Fedora 44, GNOME 50.

%prep
%autosetup -n %{name}-%{version}

%build
make stage PREFIX=%{_prefix} SYSCONFDIR=%{_sysconfdir}

%install
%make_install PREFIX=%{_prefix} SYSCONFDIR=%{_sysconfdir} SYSTEMDUSERDIR=%{buildroot}%{_userunitdir}
desktop-file-validate %{buildroot}%{_datadir}/applications/io.github.pavit12301611.Notch.desktop
# The shared schema directory is compiled by Fedora's glib2 file trigger.
glib-compile-schemas %{buildroot}%{_datadir}/gnome-shell/extensions/notch@pavit12301611.github.io/schemas

%post
%systemd_user_post notch-helper.service

%preun
%systemd_user_preun notch-helper.service

%postun
%systemd_user_postun_with_restart notch-helper.service

%files
%license LICENSE
%doc README.md
%{_bindir}/notch-settings
%{_bindir}/notch-helper
%{_bindir}/notch-doctor
%{_datadir}/notch/
%{_datadir}/gnome-shell/extensions/notch@pavit12301611.github.io/
%{_datadir}/glib-2.0/schemas/io.github.pavit12301611.Notch.gschema.xml
%{_datadir}/applications/io.github.pavit12301611.Notch.desktop
%{_datadir}/dbus-1/services/io.github.pavit12301611.Notch.Helper.service
%{_datadir}/icons/hicolor/scalable/apps/io.github.pavit12301611.Notch.svg
%{_userunitdir}/notch-helper.service

%changelog
* Thu Oct 29 2026 Notch contributors <noreply@github.com> - 0.1.0-1
- Initial Fedora-ready hybrid extension and GTK4 companion package.
