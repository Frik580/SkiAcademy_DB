# Carve Academy — Alpine Air Design System

Editorial alpine aesthetic for a premium ski and snowboard school. Stitch screens and production code must stay aligned with these tokens.

## Brand

- Product name: **Carve Academy**
- Tone: premium, calm, editorial, mountain-focused
- Avoid: loud gradients, heavy borders, generic SaaS chrome

## Color (light mode — default)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#ffffff` | Page background |
| `--card-bg` | `#ffffff` | Cards, panels |
| `--profile-bg` | `#f6f6f4` | Profile / secondary surfaces |
| `--ink` | `#111111` | Primary text |
| `--ink-dim` | `rgba(17, 17, 17, 0.5)` | Secondary text |
| `--accent` | `#1a6578` | Primary CTA, links, highlights |
| `--accent-hover` | `#134e5e` | Hover state |
| `--accent-muted` | `rgba(26, 101, 120, 0.08)` | Subtle accent fills |
| `--border` | `rgba(17, 17, 17, 0.07)` | Quiet dividers |

## Color (dark mode)

| Token | Value |
|-------|-------|
| `--bg` | `#0a0a0a` |
| `--card-bg` | `#141414` |
| `--ink` | `#f3f3f1` |
| `--accent` | `#5ec8e8` |
| `--accent-hover` | `#8dd8ef` |

## Typography

- **Headlines / display**: Cormorant Garamond (serif) — elegant, editorial
- **Body / UI**: DM Sans — clean, readable
- **Monospace / labels**: Space Mono — sparingly for data labels

Hierarchy: generous whitespace, clear size steps, uppercase eyebrow labels for section intros.

## Shape & elevation

- Card radius: `20px` (`--radius`)
- Pill buttons / chips: `9999px` (`--radius-sm`)
- Secondary radius: `14px` (`--radius-md`)
- Shadows: soft, low-contrast (`0 8px 40px rgba(17, 17, 17, 0.07)`)
- Borders: minimal — prefer spacing and shadow over hard lines

## Layout patterns

1. **Sticky frosted navbar** — logo left, theme toggle + language + Sign In right
2. **Hero** — full-bleed alpine photography with left scrim; serif headline; primary + text-link CTAs
3. **Two-column content** — narrow sidebar (resort conditions) + wide main column
4. **Instructor rows** — avatar, name, specialty, rating, Book action
5. **Course cards** — photo, level tag, title, short description

## Stitch generation defaults

When calling `generate_screen_from_text` or `generate_variants`:

- `projectId`: `12447626312814512672`
- `designSystem`: `assets/11762622741281556178` (SkiAcademy Alpine Air)
- `deviceType`: `DESKTOP` unless mobile flow is explicit
- `modelId`: `GEMINI_3_8_FLASH` (or `GEMINI_3_5_FLASH_LITE` for faster drafts)

## Implementation source of truth

Production CSS tokens live in `src/index.css` under the `Alpine Air` comment block. When Stitch output is ported to React, map Stitch colors/fonts to these CSS variables — do not introduce parallel token names.

## UX preservation

Stitch explorations are design references. Do not remove or simplify existing product UX when porting a Stitch screen. See [ADR-0008](../adr/0008-ux-preservation-during-canonical-migration.md).
