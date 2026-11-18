# Bundled fonts

Computer Modern Unicode (CMU) 0.7.0 by Andrey V. Panov, converted from the TeX
Computer Modern fonts. Licensed under the SIL Open Font License 1.1, with the
Reserved Font Family Name "Computer Modern Unicode fonts". The full license,
with the copyright notices of the original fonts, is in [OFL.txt](OFL.txt).

Source: the official package `cm-unicode-0.7.0-ttf.tar.xz` from
https://sourceforge.net/projects/cm-unicode/ (SHA-256
`2609c14450f42d0bcd40203900afcb1d693521a9b24a18c65e14b6b0585ff150`).

| File | Source file | Family / style |
|---|---|---|
| `cmu-serif-roman.woff2` | `cmunrm.ttf` | CMU Serif Roman |
| `cmu-serif-bold.woff2` | `cmunbx.ttf` | CMU Serif Bold (LaTeX `bx`) |
| `cmu-serif-italic.woff2` | `cmunti.ttf` | CMU Serif Italic |
| `cmu-serif-bolditalic.woff2` | `cmunbi.ttf` | CMU Serif BoldItalic |
| `cmu-typewriter-regular.woff2` | `cmuntt.ttf` | CMU Typewriter Text Regular |
| `cmu-typewriter-bold.woff2` | `cmuntb.ttf` | CMU Typewriter Text Bold |
| `cmu-typewriter-italic.woff2` | `cmunit.ttf` | CMU Typewriter Text Italic |
| `cmu-typewriter-bolditalic.woff2` | `cmuntx.ttf` | CMU Typewriter Text BoldItalic |

The TTFs are repackaged as WOFF2 with fontTools (`TTFont(path).flavor =
"woff2"`), with no subsetting and no change to glyphs, metrics or names.
The vertical metrics the layout uses are set as `ascent-override`,
`descent-override` and `line-gap-override` in the `@font-face` rules
(`../font-loader.ts`), not in the files.

The files are embedded in `main.js` by esbuild's base64 loader and
registered under the names in `../fonts.ts` ("Academic PDF CMU Serif",
"Academic PDF CMU Typewriter").
