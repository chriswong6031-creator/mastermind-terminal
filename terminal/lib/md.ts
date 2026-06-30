// Tiny, safe markdown → HTML renderer for copilot replies (bold, headers, lists,
// GitHub tables, code, links, hr). Escapes HTML first so model output can't inject.
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

export function mdToHtml(src: string): string {
  const lines = (src || "").replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let i = 0;
  const isTableSep = (s: string) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(s) && s.includes("-");
  while (i < lines.length) {
    const ln = lines[i];
    if (/^\s*```/.test(ln)) { // fenced code
      const buf: string[] = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`); continue;
    }
    if (/^\s*#{1,4}\s/.test(ln)) { const lvl = ln.match(/^#+/)![0].length; out.push(`<h${lvl + 2}>${inline(ln.replace(/^#+\s/, ""))}</h${lvl + 2}>`); i++; continue; }
    if (/^\s*([-*_])\1\1+\s*$/.test(ln)) { out.push("<hr/>"); i++; continue; }
    // table: a row followed by a separator row
    if (ln.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const cells = (s: string) => s.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
      const head = cells(ln); i += 2;
      const body: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) { body.push(cells(lines[i])); i++; }
      out.push(`<table class="md"><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^\s*[-*]\s/.test(ln)) { const items: string[] = []; while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*[-*]\s/, ""))}</li>`); out.push(`<ul>${items.join("")}</ul>`); continue; }
    if (/^\s*\d+\.\s/.test(ln)) { const items: string[] = []; while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*\d+\.\s/, ""))}</li>`); out.push(`<ol>${items.join("")}</ol>`); continue; }
    if (!ln.trim()) { i++; continue; }
    // paragraph (gather until blank)
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,4}\s|[-*]\s|\d+\.\s|```)/.test(lines[i]) && !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))) para.push(lines[i++]);
    out.push(`<p>${para.map(inline).join("<br/>")}</p>`);
  }
  return out.join("");
}
