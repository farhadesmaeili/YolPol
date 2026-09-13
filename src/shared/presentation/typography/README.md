# Local typography

`src/app/globals.css` owns the self-hosted `@font-face` declarations and fallback stacks. `locale-font.ts` maps `en` and `tr` to the default `Arial, Helvetica, sans-serif` stack and selects Persian and Arabic independently. The localized root layout applies that mapping once; pages must not select fonts themselves.

The current files are static faces, not variable fonts:

- Persian: `public/fonts/persian/brand-persian.woff2`, Shabnam Light, 300.
- Arabic: `public/fonts/arabic/brand-arabic.woff2`, True Arabic Medium, 500.

To add static 400, 500, 600, and 700 faces later:

1. Put the real files in the existing `public/fonts/latin`, `public/fonts/persian`, or `public/fonts/arabic` directory using the approved `regular`, `medium`, `semibold`, and `bold` names.
2. Add one `@font-face` block per existing file in `src/app/globals.css`, using the same family name and the file's actual `font-weight` value.
3. Keep `font-display: swap`, `font-style: normal`, and the current fallback list.
4. Do not change `locale-font.ts` unless a locale should move to a different family.
5. Run the font, lint, typecheck, test, and production-build checks. Never register a path before its font file exists.
