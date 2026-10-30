PREFIX ?= $(HOME)/.local
DESTDIR ?=
DATADIR ?= $(PREFIX)/share
BINDIR ?= $(PREFIX)/bin
SYSCONFDIR ?= $(HOME)/.config
PYTHON ?= /usr/bin/python3
VERSION := 0.1.0
UUID := notch@pavit12301611.github.io
APP_ID := io.github.pavit12301611.Notch
EXTDIR := $(DESTDIR)$(DATADIR)/gnome-shell/extensions/$(UUID)
PKGDATA := $(DESTDIR)$(DATADIR)/notch
SCHEMADIR := $(DESTDIR)$(DATADIR)/glib-2.0/schemas
SYSTEMDUSERDIR ?= $(DESTDIR)$(SYSCONFDIR)/systemd/user
STAGE := .generated

.PHONY: all stage install uninstall check check-python lint test dist rpm clean

all: stage

stage:
	mkdir -p $(STAGE)
	@for name in notch-settings notch-helper notch-doctor notch-shelf; do \
	  sed -e 's|@bindir@|$(BINDIR)|g' -e 's|@extdir@|$(DATADIR)/gnome-shell/extensions/$(UUID)|g' \
	      -e 's|@pkgdatadir@|$(DATADIR)/notch|g' -e 's|@python@|$(PYTHON)|g' \
	      data/$$name.in > $(STAGE)/$$name; \
	done
	sed 's|@bindir@|$(BINDIR)|g' data/$(APP_ID).desktop.in > $(STAGE)/$(APP_ID).desktop
	sed 's|@bindir@|$(BINDIR)|g' data/$(APP_ID).Helper.service.in > $(STAGE)/$(APP_ID).Helper.service
	sed 's|@bindir@|$(BINDIR)|g' data/notch-helper.service.in > $(STAGE)/notch-helper.service

install: stage
	install -d $(EXTDIR)/schemas $(EXTDIR)/lib $(EXTDIR)/dbus $(EXTDIR)/icons $(PKGDATA)/python/notch_app
	install -d $(DESTDIR)$(BINDIR) $(SCHEMADIR) $(DESTDIR)$(DATADIR)/applications
	install -d $(DESTDIR)$(DATADIR)/dbus-1/services $(SYSTEMDUSERDIR)
	install -d $(DESTDIR)$(DATADIR)/icons/hicolor/scalable/apps
	install -m644 extension/extension.js extension/prefs.js extension/metadata.json extension/stylesheet.css $(EXTDIR)/
	install -m644 extension/lib/*.js $(EXTDIR)/lib/
	install -m644 extension/dbus/*.xml $(EXTDIR)/dbus/
	install -m644 extension/icons/*.svg $(EXTDIR)/icons/
	install -m644 extension/schemas/*.gschema.xml $(EXTDIR)/schemas/
	install -m644 extension/schemas/*.gschema.xml $(SCHEMADIR)/
	install -m644 app/notch_app/*.py $(PKGDATA)/python/notch_app/
	install -m755 $(STAGE)/notch-settings $(STAGE)/notch-helper $(STAGE)/notch-doctor $(STAGE)/notch-shelf $(DESTDIR)$(BINDIR)/
	install -m644 $(STAGE)/$(APP_ID).desktop $(DESTDIR)$(DATADIR)/applications/
	install -m644 $(STAGE)/$(APP_ID).Helper.service $(DESTDIR)$(DATADIR)/dbus-1/services/
	install -m644 $(STAGE)/notch-helper.service $(SYSTEMDUSERDIR)/
	install -m644 data/$(APP_ID).svg $(DESTDIR)$(DATADIR)/icons/hicolor/scalable/apps/
	install -m644 README.md LICENSE $(PKGDATA)/
ifeq ($(DESTDIR),)
	glib-compile-schemas $(EXTDIR)/schemas
	glib-compile-schemas $(SCHEMADIR)
	-update-desktop-database -q $(DATADIR)/applications
endif

uninstall:
	rm -rf $(EXTDIR) $(PKGDATA)
	rm -f $(SCHEMADIR)/$(APP_ID).gschema.xml
	rm -f $(DESTDIR)$(BINDIR)/notch-settings $(DESTDIR)$(BINDIR)/notch-helper $(DESTDIR)$(BINDIR)/notch-doctor $(DESTDIR)$(BINDIR)/notch-shelf
	rm -f $(DESTDIR)$(DATADIR)/applications/$(APP_ID).desktop
	rm -f $(DESTDIR)$(DATADIR)/dbus-1/services/$(APP_ID).Helper.service
	rm -f $(SYSTEMDUSERDIR)/notch-helper.service
	rm -f $(DESTDIR)$(DATADIR)/icons/hicolor/scalable/apps/$(APP_ID).svg
ifeq ($(DESTDIR),)
	-glib-compile-schemas $(SCHEMADIR)
	-update-desktop-database -q $(DATADIR)/applications
endif

check-python:
	$(PYTHON) -m compileall -q app
	PYTHONPATH=app $(PYTHON) -m unittest discover -s tests/python -v

check: check-python
	npm run check
	glib-compile-schemas --strict --dry-run extension/schemas
	@command -v desktop-file-validate >/dev/null && desktop-file-validate $(STAGE)/$(APP_ID).desktop || true
	@for file in $$(find extension -name '*.js'); do node --check $$file || exit 1; done

lint:
	npm run lint

test: check-python
	npm test

dist:
	mkdir -p dist
	git ls-files -co --exclude-standard | tar --transform='s,^,notch-$(VERSION)/,' -czf dist/notch-$(VERSION).tar.gz -T -

rpm: dist
	mkdir -p dist/rpmbuild/{BUILD,RPMS,SOURCES,SRPMS,SPECS}
	cp dist/notch-$(VERSION).tar.gz dist/rpmbuild/SOURCES/
	rpmbuild -ba packaging/rpm/notch.spec --define '_topdir $(CURDIR)/dist/rpmbuild'

clean:
	rm -rf $(STAGE)
	find app tests -type d -name __pycache__ -prune -exec rm -rf {} +
