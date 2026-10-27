# DESIGN.md: Switzerland Style

This file is the design contract for everything HunterOps produces: the dashboard and every resume (PDF and DOCX). The numbers here are not suggestions. They live in code in `src/lib/modules/designer.ts` (Module E), the dashboard reads them through `tailwind.config.ts`, the resume renderer reads them in `src/lib/resume-render.ts`, and `auditResume()` checks each rendered resume against them before it is offered for download.

If you change a value, change it in `designer.ts` and here, in the same commit.

## Principles

1. **Type does the work.** Hierarchy comes from size, weight and the mono face. No colour accents, no icons in documents, no boxes around content.
2. **One column.** Content reads top to bottom. No sidebars, no tables, no multi-column skill grids. This is also what ATS parsers read most reliably.
3. **Everything on the grid.** Every line, gap and margin is a whole multiple of 4px.
4. **Flush left, ragged right.** No centred headers, no justified text.
5. **Nothing decorative.** If an element does not carry information, remove it.

## Typography

| Role | Face | Weight | Print size / leading | Screen (Tailwind) |
| --- | --- | --- | --- | --- |
| Name / page title | Inter | 700 | 21pt / 27pt | `text-2xl font-bold tracking-tight` |
| Section heading | Roboto Mono | 400, UPPERCASE, +8% tracking | 8pt / 12pt | `font-mono text-xs uppercase tracking-wider` |
| Body, bullets | Inter | 400 | 9.75pt / 15pt | `text-sm leading-5` |
| Role title | Inter | 600 | 9.75pt / 15pt | `text-sm font-semibold` |
| Metadata (dates, places, contact, scores, sources) | Roboto Mono | 400 | 8pt / 12pt | `font-mono text-xs` |

- Inter is used for all headings and running text. Roboto Mono is used only for metadata: dates, locations, contact lines, section labels, counts, scores and source names.
- Two faces, at most three sizes on any one screen or page.
- DOCX files name the same fonts. On a machine without Inter, Word substitutes Arial; the layout still holds because sizes and spacing do not change.

## Spacing: 4px baseline grid

- Base unit: **4px** on screen, **3pt** in print (1px = 0.75pt).
- Line heights: 12pt (4 units), 15pt (5 units), 27pt (9 units).
- Gaps between blocks: after the header 12pt (4 units), before a section 15pt (5 units), between roles 9pt (3 units), after a section rule 6pt (2 units).
- Tailwind's spacing scale is already 4px-based (`p-1` = 4px). Use only the scale; no arbitrary values like `p-[13px]`.
- The renderer snaps every vertical step to the grid with `snap()`. `auditResume()` fails a resume with any line off the grid.

## Colour

| Token | Hex | Use |
| --- | --- | --- |
| `text` | `#111111` | All text and rules |
| `bg` | `#FFFFFF` | Page and card background |
| `border` | `#E5E5E5` | Hairlines, card borders, dividers (0.5pt in print, 1px on screen) |

- Three colours. Secondary text is the same `#111111`; it reads as secondary because it is set in Roboto Mono at 8pt, not because it is grey.
- **One functional exception in documents' sense:** the app (see App themes) adds an accent; the Grill Score badge uses red (below 50), yellow (50 to 74) and green (75 and up). Status colours never appear in documents.

## Layout

- **Resume page:** A4 portrait, **24mm margins on all four sides**, a single column 162mm wide.
- **Header:** name, then headline, then one mono contact line. Flush left.
- **Sections, in this order:** Summary, Skills, Experience, Education, Certifications, Achievements. Each heading is a mono uppercase label with a 0.5pt `#E5E5E5` rule under it.
- **Experience entries:** role title (Inter 600) on the left, dates (mono) on the right of the same line; company and location (mono) on the next line; then bullets.
- **Bullets:** at most 6 per role, at most 2 lines each. Start with a verb. Real numbers only.
- **Length:** one page under 8 years of experience, two pages otherwise.
- **App screens:** see "App themes" below. Documents (resumes) never change with the app theme.

## App themes

The resume rules above are strict Switzerland Style. The app itself uses the same type (Inter, Roboto Mono) and 4px grid, with two themes on one set of CSS tokens in `src/app/globals.css`:

- **Light:** `#111111` text and white cards on a very light grey page, `#E5E5E5` borders.
- **Dark ("command center"):** near-black page (`hsl(228 24% 5%)`), slightly raised cards, soft light text.
- **Accent:** one violet accent for actions and the active tab, plus status colours (success, warning, info) for pipeline stages and reminders. The Grill Score bands stay red, yellow and green in both themes.
- **Auto** follows the phone's light or dark mode; Settings and the header button can force Light or Dark. The choice is stored in the browser.
- Cards: 16px radius, 1px border, soft shadow. Buttons and chips are pills. Single column on phones with a five-tab bottom bar; wider grids from 768px.

## Density variants

| Variant | Body leading | Before section | Between roles |
| --- | --- | --- | --- |
| Standard | 15pt (5 units) | 15pt | 9pt |
| Compact | 12pt (4 units) at 9.25pt | 12pt | 6pt |

Both stay on the grid and keep the 24mm margins.

## Writing

All generated text passes Module A (Anti-Slop) before it reaches a document. See `src/lib/modules/anti-slop.ts` for the banned phrase list.

## References

- Resume structure and section order follow common ATS guidance, including the samples in `zapplyjobs/resume-samples-2026` (no license on that repo, so no files or text from it are copied).
- The Grill's whole-term keyword matching follows `srbhr/Resume-Matcher` (Apache-2.0).
