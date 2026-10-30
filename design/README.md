# Notch design review workbook

Canonical file: **`../Notch-Design-Review.pptx`** (repo root).

This is the editable design handoff for the current v8 UI. It started from the
PPT uploaded to `main`, preserved the meaningful edits found in that upload, and
was expanded into a more complete review workbook.

## What is inside

- 61 slides, 16:9, dark review theme.
- Closed / peek / open modes and all six pages.
- Empty, loading, paused, disabled, locked, offline, error, narrow and compact states.
- Settings pages for inline extension prefs and the GTK4/Adw companion app.
- Adaptive layout, text scaling, motion, visibility, components and guardrails.
- `REVIEW / EDIT HERE` boxes on mockup slides.
- Native editable PowerPoint tables:
  - **N45** imported-edit provenance
  - **N59–N60** review worksheets
  - **N41** decision log
- **N42** slide → source-file mapping.
- **N61** preserves the curl command added in the uploaded PPT.
- Speaker notes on every slide.

All mockups are native PowerPoint shapes/text boxes. There are no embedded
screenshots, so colors, spacing, labels and geometry can be edited directly.

## Preserved uploaded edits

The uploaded `main` PPT was compared against the generated v8 baseline.
Meaningful edits were preserved:

- Home idle clock/date moved left toward the content gutter.
- Music player switcher moved to the right side of the metadata block.
- Alerts count/date indented toward notification-card padding.
- The added curl install command was moved to appendix slide N61 so it does not
  cover the notification peek mockup.

Minor PowerPoint font-rounding differences were normalized to the deck token
scale. No application UI/behavior code was changed by this workbook.

## How to edit

1. Keep the slide ID (`N01`…`N61`) in the footer.
2. Select a mockup group; ungroup if you need to move one control.
3. Change shapes/text/colors/spacing directly, or write exact values in the
   yellow `REVIEW / EDIT HERE` box.
4. For a new state, duplicate the closest slide and name it `Nxx-A`.
5. Fill worksheets N59–N60 and decision log N41, then save as `.pptx`.

Useful explicit edit format:

```text
N12 / Music page
- Art: 72 → 80 px, radius 14 → 16
- Title: 14.7 → 16 px, max 2 lines
- Transport spacing: 10 → 12 px
- Keep disabled state visible
```

## Regenerate (optional)

```bash
python3 -m pip install python-pptx pillow
python3 scripts/build_design_review.py \
  --output Notch-Design-Review.pptx \
  --preview .cache/design-review/preview \
  --warnings .cache/design-review/warnings.txt
```

`pillow` is only needed for optional PNG proof previews. Preview images are
written to `.cache/` and are not part of the deck.

## QA performed

- PPTX parses with `python-pptx`; 61 slides, speaker notes on all slides.
- No out-of-bounds shapes in structural check.
- No duplicate slide IDs.
- Optional Pillow proof renderer reports no text overflow warnings.
- No embedded raster media; mockups remain editable.
- No application UI/behavior code was changed for this deck.

## v9 implementation note

The user explicitly requested code changes after this deck: a non-empty Home dashboard, direct file drop onto the notch, and coordinated iPhone-like motion. Those v9 code changes supersede the older Home/drop/motion mockups in this baseline deck. The deck remains the review reference for pages not explicitly changed by that request.
