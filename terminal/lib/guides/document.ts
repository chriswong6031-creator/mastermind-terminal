import { mdToHtml } from "@/lib/md";

export type GuideSectionKind = "anatomy" | "playbook" | "settings" | "alerts" | "detail";

export interface ParsedGuideSection {
  id: string;
  title: string;
  kind: GuideSectionKind;
  html: string;
  markdown: string;
}

export interface ParsedGuideDocument {
  title: string;
  intro: string;
  introHtml: string;
  sections: ParsedGuideSection[];
}

const SECTION_KINDS: GuideSectionKind[] = ["anatomy", "playbook", "settings", "alerts"];

function sectionKind(heading: string, index: number): GuideSectionKind {
  const normalized = heading.toLocaleLowerCase().replace(/[&/]/g, " ");
  if (/(what you see|what it shows|图上|图中)/.test(normalized)) return "anatomy";
  if (/(how to trade|how to use|怎么用|如何交易|交易方法)/.test(normalized)) return "playbook";
  if (/(settings|inputs|设置|参数)/.test(normalized)) return "settings";
  if (/(signals|alerts|events|信号|提醒|事件)/.test(normalized)) return "alerts";
  return SECTION_KINDS[index] ?? "detail";
}

function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueId(kind: GuideSectionKind, index: number, used: Set<string>): string {
  const root = kind === "detail" ? `detail-${index + 1}` : kind;
  let id = root;
  let suffix = 2;
  while (used.has(id)) id = `${root}-${suffix++}`;
  used.add(id);
  return id;
}

/**
 * Turn the existing bilingual guide prose into stable, navigable article sections.
 *
 * The source files intentionally remain lazy-loaded strings. This parser removes their repeated H1,
 * promotes the lede into the visual hero, and gives localized headings language-neutral ids so the
 * Guide Center can use the same TOC, tests, and deep links in English and Chinese.
 */
export function parseGuideDocument(markdown: string): ParsedGuideDocument {
  const lines = (markdown || "").replace(/\r/g, "").split("\n");
  const titleIndex = lines.findIndex((line) => /^#\s+/.test(line));
  const title = titleIndex >= 0 ? lines[titleIndex].replace(/^#\s+/, "").trim() : "";
  const sectionStarts: number[] = [];

  for (let index = Math.max(0, titleIndex + 1); index < lines.length; index++) {
    if (/^##\s+/.test(lines[index])) sectionStarts.push(index);
  }

  const introStart = titleIndex >= 0 ? titleIndex + 1 : 0;
  const introEnd = sectionStarts[0] ?? lines.length;
  const introMarkdown = lines.slice(introStart, introEnd).join("\n").trim();
  const used = new Set<string>();
  const sections = sectionStarts.map((start, index): ParsedGuideSection => {
    const end = sectionStarts[index + 1] ?? lines.length;
    const heading = lines[start].replace(/^##\s+/, "").trim();
    const body = lines.slice(start + 1, end).join("\n").trim();
    const kind = sectionKind(heading, index);
    return {
      id: uniqueId(kind, index, used),
      title: heading,
      kind,
      html: mdToHtml(body),
      markdown: body,
    };
  });

  return {
    title,
    intro: plainText(introMarkdown),
    introHtml: mdToHtml(introMarkdown),
    sections,
  };
}
