#!/bin/sh
# fetch-vendor.sh — download the pinned third-party libraries into site/vendor.
# Run from the repo root after changing a version. The downloaded files are
# committed, so the app never loads anything from a CDN at runtime.
set -e

CDN=https://cdn.jsdelivr.net/npm
OUT=site/vendor

MARKDOWN_IT=markdown-it@14.3.3
FOOTNOTE=markdown-it-footnote@4.0.0
TASK_LISTS=markdown-it-task-lists@2.1.1
TEXMATH=markdown-it-texmath@1.0.0
DOMPURIFY=dompurify@3.4.17
HIGHLIGHT=@highlightjs/cdn-assets@11.12.0
KATEX=katex@0.19.0
MERMAID=mermaid@11.17.2
CODEMIRROR=codemirror@5.65.21

# get <package@version> <file in package> <target in site/vendor>
get() {
  mkdir -p "$OUT/$(dirname "$3")"
  curl -fsSL "$CDN/$1/$2" -o "$OUT/$3"
  echo "  $3"
}

rm -rf "$OUT"

get $MARKDOWN_IT dist/markdown-it.min.js           markdown-it/markdown-it.min.js
get $MARKDOWN_IT LICENSE                           markdown-it/LICENSE
get $FOOTNOTE    dist/markdown-it-footnote.min.js  markdown-it/footnote.min.js
get $FOOTNOTE    LICENSE                           markdown-it/LICENSE-footnote
get $TASK_LISTS  dist/markdown-it-task-lists.min.js markdown-it/task-lists.min.js
get $TASK_LISTS  LICENSE                           markdown-it/LICENSE-task-lists
get $TEXMATH     texmath.js                        markdown-it/texmath.js
get $TEXMATH     license.txt                       markdown-it/LICENSE-texmath

get $DOMPURIFY   dist/purify.min.js                dompurify/purify.min.js
get $DOMPURIFY   LICENSE                           dompurify/LICENSE

get $HIGHLIGHT   highlight.min.js                  highlight/highlight.min.js
get $HIGHLIGHT   LICENSE                           highlight/LICENSE

get $KATEX       dist/katex.min.js                 katex/katex.min.js
get $KATEX       dist/katex.min.css                katex/katex.min.css
get $KATEX       LICENSE                           katex/LICENSE
for font in AMS-Regular Caligraphic-Bold Caligraphic-Regular Fraktur-Bold \
  Fraktur-Regular Main-Bold Main-BoldItalic Main-Italic Main-Regular \
  Math-BoldItalic Math-Italic SansSerif-Bold SansSerif-Italic SansSerif-Regular \
  Script-Regular Size1-Regular Size2-Regular Size3-Regular Size4-Regular \
  Typewriter-Regular; do
  get $KATEX dist/fonts/KaTeX_$font.woff2 katex/fonts/KaTeX_$font.woff2
done

get $MERMAID     dist/mermaid.min.js               mermaid/mermaid.min.js
get $MERMAID     LICENSE                           mermaid/LICENSE

get $CODEMIRROR  lib/codemirror.js                 codemirror/codemirror.js
get $CODEMIRROR  lib/codemirror.css                codemirror/codemirror.css
get $CODEMIRROR  addon/mode/overlay.js             codemirror/overlay.js
get $CODEMIRROR  mode/xml/xml.js                   codemirror/xml.js
get $CODEMIRROR  mode/markdown/markdown.js         codemirror/markdown.js
get $CODEMIRROR  mode/gfm/gfm.js                   codemirror/gfm.js
get $CODEMIRROR  mode/yaml/yaml.js                 codemirror/yaml.js
get $CODEMIRROR  mode/yaml-frontmatter/yaml-frontmatter.js codemirror/yaml-frontmatter.js
get $CODEMIRROR  addon/edit/continuelist.js        codemirror/continuelist.js
get $CODEMIRROR  addon/selection/active-line.js    codemirror/active-line.js
get $CODEMIRROR  addon/dialog/dialog.js            codemirror/dialog.js
get $CODEMIRROR  addon/dialog/dialog.css           codemirror/dialog.css
get $CODEMIRROR  addon/search/searchcursor.js      codemirror/searchcursor.js
get $CODEMIRROR  addon/search/search.js            codemirror/search.js
get $CODEMIRROR  LICENSE                           codemirror/LICENSE

echo "Done: $(du -sh "$OUT" | cut -f1) in $OUT"
