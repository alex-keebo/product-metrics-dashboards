# Keebo Design System

All colors must come from the Keebo palette defined in `keebo_style_guide.css` and mapped to CSS variables in `src/app/globals.css`. **Never introduce colors not in this palette.**

## Keebo color palette

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--primary` | `#2a6985` | `#9ac6da` | Interactive selected state (checkboxes, toggles, focus rings) |
| `--primary-foreground` | `#ffffff` | `#00283a` | Text/icons on primary background |
| `--secondary` | `#daeaf4` | `#08394f` | Subtle backgrounds, hover states |
| `--secondary-foreground` | `#061c27` | `#cccccc` | Text on secondary background |
| `--accent` | `#08394f` | `#2a6985` | Stronger interactive backgrounds |
| `--accent-foreground` | `#ffffff` | `#ffffff` | Text on accent background |
| `--background` | `#f0f6fa` | `#061c27` | Page background |
| `--card` | `#ffffff` | `#04202d` | Card/panel background |
| `--muted` | `#e4f0f7` | `#04202d` | Muted surface |
| `--muted-foreground` | `#4a6373` | `#5a5e65` | De-emphasized text |
| `--border` | `#bdd4e0` | `#0d3344` | Borders and dividers |
| `--destructive` | `#e53935` | `#f25654` | Errors, negative states |
| `--success` | `#2e7d52` | `#56bd88` | Positive states |

Full blue scale (light → dark): `#EBF7FE` · `#C4E2F4` · `#9AC6DA` · `#6C9DB3` · `#2A6985` · `#08394F` · `#00283A`

`#F5F5F5` ("New Grey Light F5") — secondary CTA background in light mode. Use for the active/selected state of secondary interactive elements (toggle buttons, checkboxes) in light mode. In dark mode, use `--secondary` (`#08394F`) instead.

Full green scale (light → dark): `#E3FFEE` · `#A2E7C2` · `#56BD88` · `#2E7D52` · `#055D35` · `#00371E`

## Rules
- Use Tailwind semantic tokens (`bg-primary`, `text-muted-foreground`, `border-border`, etc.) — never hardcode hex values in component files.
- Exception: `src/app/globals.css` is the one place hex values are defined.
- The old theme blue `#3770f7` is **not** part of the Keebo palette — do not use it.
