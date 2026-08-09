#!/usr/bin/env python3
"""Render the Company Intelligence v2 reference compositions from payload.json.

    python3 build.py            # writes *.html + index.html + copy_table.md

Every visible figure, quotation, ticker, hash and accession comes from
payload.json, which `extract_payload.py` derives from named golden-corpus
`case_id`s.  Nothing is typed in by hand here except UI copy, and all UI copy
lives in COPY so the spec's EN/ZH table is generated rather than transcribed.
"""

from __future__ import annotations

import html
import json
from pathlib import Path

HERE = Path(__file__).parent
PAYLOAD = json.loads((HERE / "payload.json").read_text())
BY_SLUG = {c["slug"]: c for c in PAYLOAD["compositions"]}
REFERENCED = {c["case_id"]: c for c in PAYLOAD["referenced_only"]}

# ---------------------------------------------------------------------------
# EN / ZH copy.  key: (english, 中文)
#
# ZH rule for this surface: use the vocabulary a Chinese equity analyst already
# uses.  出处 (where a statement comes from), 口径 (reporting basis — the exact
# term for GAAP/non-GAAP), 业绩公告 (earnings release), 申报文件 (filing),
# 电话会 (call).  Never calque the English: "typed absence" as 类型化缺失 is
# meaningless; 已注明缺失 ("noted as missing") is what a person would say.
# ---------------------------------------------------------------------------
COPY: dict[str, tuple[str, str]] = {
    # -- lens bar -----------------------------------------------------------
    "lens.brief": ("Brief", "简报"),
    "lens.transcript": ("Transcript", "电话会"),
    "lens.sources": ("Sources", "来源"),
    "lens.history": ("History", "历史"),
    "lens.topics": ("Topics", "主题"),
    "lens.peers": ("Peers", "同业"),
    "lens.slides": ("Slides", "演示材料"),
    "lens.soon": ("soon", "待上线"),
    # -- hero ---------------------------------------------------------------
    "hero.kicker": ("Company Intelligence", "公司情报"),
    "hero.event": ("Event", "事件"),
    "hero.receipts": ("View receipts", "查看出处"),
    "hero.ask": ("Ask Mastermind", "询问 Mastermind"),
    "prov.knownAt": ("As known at", "截至"),
    "prov.event": ("Event", "事件"),
    "prov.authority": ("Authority", "权限"),
    "prov.contextOnly": ("Context only", "仅供背景参考"),
    # -- identity row (new; Q1 froze identity as issuer-keyed) --------------
    "id.issuer": ("Issuer", "发行人"),
    "id.listings": ("Listings", "上市代码"),
    "id.reports": ("Reports in", "报告币种"),
    "id.fyEnds": ("Fiscal year ends", "财年结束"),
    "id.note.one": (
        "Figures belong to the issuer, not to a symbol.",
        "数据归属于发行人，而非某一代码。",
    ),
    "id.note.dual": (
        "One issuer, two lines. Both report this quarter in USD; only trading differs.",
        "同一发行人，两个上市代码。本季均以美元报告，仅交易场所不同。",
    ),
    # -- claim states (glance tier; the contract's enum names never appear) --
    "state.allCited": ("Every claim cited", "每项均有原文出处"),
    "state.partlyCited": ("Partly sourced", "部分有出处"),
    "state.lastVerified": ("Last verified view", "最近验证视图"),
    "state.restated": ("One figure restated", "一项数据已更正"),
    "state.heldBack": ("Held back", "暂不发布"),
    "state.newSeries": ("New series", "新的材料系列"),
    "state.searchDegraded": ("Search partly down", "检索部分不可用"),
    # -- stance lines (Law 1: what to do, <= 14 words) ----------------------
    "stance.exact": (
        "Every line below opens the sentence it came from.",
        "以下每一条都可直接打开其原文出处。",
    ),
    "stance.absent": (
        "Nothing to read for these. Each says what is missing and why.",
        "这些暂无原文可查；每条都注明缺什么、为什么。",
    ),
    "stance.stale": (
        "Safe to read. The receipts point at fixed documents; only the refresh is late.",
        "可正常查阅：出处指向的文件本身未变，只是刷新滞后。",
    ),
    "stance.corrected": (
        "Read the correction first, then the rest as normal.",
        "先看更正内容，其余照常查阅。",
    ),
    "stance.docs": (
        "One event, every document behind it, newest first.",
        "同一事件，其全部来源文件，按时间倒序。",
    ),
    "stance.search": (
        "Transcripts are answering. Filings are not — those results are missing, not empty.",
        "电话会检索正常，申报文件检索不可用：该部分是缺失，而非无结果。",
    ),
    # -- locator chips ------------------------------------------------------
    "loc.para": ("¶", "第"),
    "loc.paraSuffix": ("", "段"),
    "loc.page": ("p.", "第"),
    "loc.table": ("table", "表"),
    "loc.deck": ("deck page", "材料页"),
    "loc.restated": ("restated", "已更正"),
    "loc.twoCopies": ("2 copies · 1 event", "两份文件 · 同一事件"),
    # -- absence tokens (the words that occupy a receipt's slot) ------------
    "abs.noTranscript": ("no transcript", "无电话会记录"),
    "abs.noRelease": ("no release", "无业绩公告"),
    "abs.noSpan": ("release not indexed", "公告未建立索引"),
    "abs.noBasis": ("basis not stated", "未注明口径"),
    "abs.noUnit": ("unit not stated", "未注明单位"),
    "abs.seriesChanged": ("series redefined", "材料系列已重构"),
    "abs.unjoinable": ("sources not matched", "两处来源无法对应"),
    "abs.notReported": ("not reported", "未披露"),
    "abs.heldBack": ("held back", "暂不发布"),
    "abs.indexDown": ("index unavailable", "索引不可用"),
    "abs.notYet": ("not built yet", "尚未上线"),
    # -- absence card -------------------------------------------------------
    "absence.whatFills": ("Fills when", "补齐条件"),
    "absence.lastChecked": ("Last checked", "最近检查"),
    "absence.title.noTranscript": ("No call transcript for this quarter", "本季无电话会记录"),
    "absence.body.noTranscript": (
        "Cloudflare published a release for Q1 FY2024. No call transcript reached us, "
        "so anything management said on a call is not something we can show you.",
        "Cloudflare 已发布本季业绩公告，但我们未收到电话会记录；"
        "因此管理层在会上的表述无法在此呈现。",
    ),
    "absence.fills.noTranscript": (
        "a transcript for this event is published and verified.",
        "本次事件的电话会记录发布并通过校验。",
    ),
    "absence.title.noSpan": ("We hold the release, not its text", "我们持有公告本身，但没有其正文"),
    "absence.body.noSpan": (
        "The release revision and its filing number are recorded. Its body is not indexed "
        "down to sentences yet, so a number read out of it would have no place to point at.",
        "公告的版本与申报编号均已登记，但其正文尚未逐句建立索引；"
        "此时取用其中的数字将无法指向具体位置。",
    ),
    "absence.fills.noSpan": (
        "the release body is indexed to sentence level.",
        "公告正文完成逐句索引。",
    ),
    "absence.title.unjoinable": (
        "The same filing is seen twice and matched once",
        "同一份申报被两处读取，但无法对应",
    ),
    "absence.body.unjoinable": (
        "Two readers hold this 8-K. One records the filer number and the acceptance time; "
        "the other records the filing number. They share only the ticker, which is not enough "
        "to prove they are the same document.",
        "两处读取到同一份 8-K：一处记录了申报人编号与受理时间，另一处记录了申报编号；"
        "两者仅共用股票代码，不足以证明是同一份文件。",
    ),
    "absence.fills.unjoinable": (
        "both readers record the filing number.",
        "两处读取均记录申报编号。",
    ),
    "absence.noRevenueLine": (
        "This issuer reports no revenue line. We do not map net interest income onto one.",
        "该发行人不披露「营业收入」科目；我们不会将净利息收入套用为营业收入。",
    ),
    # -- source rail --------------------------------------------------------
    "docs.title": ("SOURCE DOCUMENTS", "来源文件"),
    "docs.transcript": ("Earnings call transcript", "财报电话会记录"),
    "docs.release": ("Earnings release", "业绩公告"),
    "docs.releaseAmended": ("Earnings release, amended", "业绩公告（修订版）"),
    "docs.releaseCopy": ("Earnings release, second copy", "业绩公告（第二份副本）"),
    "docs.record": ("Structured event record", "结构化事件记录"),
    "docs.deck": ("Presentation deck", "演示材料"),
    "docs.rev": ("revision", "版本"),
    "docs.filingNo": ("Filing no.", "申报编号"),
    "docs.replaces": ("replaces", "取代"),
    "docs.sameContent": ("same content, different file", "内容相同，文件不同"),
    "docs.read": ("Read", "阅读"),
    "docs.open": ("Open", "打开"),
    "docs.notPublished": ("Not published for this event", "本事件未发布此来源"),
    # -- evidence rail ------------------------------------------------------
    "rail.eyebrow": ("EVIDENCE", "证据"),
    "rail.title": ("Where this came from", "出处"),
    "rail.titleAbsent": ("Why this is missing", "缺失原因"),
    "rail.close": ("Close", "关闭"),
    "rail.document": ("Document", "文件"),
    "rail.revision": ("Revision", "版本"),
    "rail.speaker": ("Speaker", "发言人"),
    "rail.paragraph": ("Paragraph", "段落"),
    "rail.bytes": ("Characters", "字符范围"),
    "rail.basis": ("Basis", "口径"),
    "rail.period": ("Period", "期间"),
    "rail.currency": ("Currency", "币种"),
    "rail.sourceHash": ("Source fingerprint", "来源指纹"),
    "rail.knownAt": ("Known at", "获知时间"),
    "rail.lookedIn": ("Looked in", "已检索范围"),
    "rail.openSource": ("Open the source", "打开来源"),
    "rail.openTranscript": ("Open transcript", "打开电话会"),
    "rail.copyCitation": ("Copy citation", "复制引用"),
    "rail.note.exact": (
        "This quotation is the source text, character for character. It is the company's "
        "statement, not our reading of it.",
        "此处引文与来源文本逐字一致，是公司的原话，而非我们的解读。",
    ),
    "rail.note.absent": (
        "Nothing was inferred to fill this gap. We would rather show you the hole than a "
        "number we cannot point at.",
        "我们不会用推断填补此处空缺：宁可如实呈现缺失，也不给出无法溯源的数字。",
    ),
    "rail.note.superseded": (
        "The quotation still stands. What changed is the release behind it, and everything "
        "built on that release was rebuilt.",
        "引文本身不变；变化的是其背后的业绩公告，基于该公告生成的内容均已重建。",
    ),
    # -- bands --------------------------------------------------------------
    "band.partial.t": ("No call was published for this quarter", "本季未发布电话会"),
    "band.partial.p": (
        "What the release supports is below. Everything else is named, not guessed.",
        "以下为业绩公告可支持的内容；其余均如实注明缺失，不作推测。",
    ),
    "band.stale.t": ("Showing the view saved on 6 Aug, 06:12 UTC", "显示 8 月 6 日 06:12 UTC 保存的视图"),
    "band.stale.p": (
        "The provider is unreachable. Receipts below still point at fixed documents — "
        "a document does not change while we wait.",
        "数据提供方暂时无法连接。以下出处指向的文件本身不会改变，等待期间内容依然可靠。",
    ),
    "band.stale.a": ("Try again", "重试"),
    "band.corrected.t": ("One figure was restated on 15 May", "5 月 15 日更正了一项数据"),
    "band.corrected.p": (
        "Boeing filed an amended release. The brief, the dossier and the alert were all rebuilt "
        "from it; the event itself is unchanged.",
        "波音提交了修订版业绩公告。简报、个股档案与提醒均已据此重建；事件本身未变。",
    ),
    "band.corrected.a": ("See what changed", "查看变更"),
    "band.provider.t": ("Filing search is down", "申报文件检索不可用"),
    "band.provider.p": (
        "Transcript search is answering normally. Filing and release results are missing "
        "from this list, not absent from the record.",
        "电话会检索正常。本列表中缺少申报文件与业绩公告的结果，这是检索缺失，而非记录中没有。",
    ),
    "band.provider.a": ("Retry filings", "重试申报检索"),
    # -- full-panel states --------------------------------------------------
    "held.t": ("Held back — this record is dated ahead of us", "暂不发布 —— 该记录的日期晚于当前可观测时间"),
    "held.p": (
        "AMD's Q1 FY2027 record carries a call date in February 2027. We only publish what "
        "was observable at the time we ran. Nothing is lost; it is waiting for its date.",
        "AMD 2027 财年第一季度记录的电话会日期为 2027 年 2 月。我们只发布运行时已可观测的内容。"
        "该记录并未丢失，只是尚未到期。",
    ),
    "held.observed": ("We could see up to", "可观测截至"),
    "held.dated": ("This record is dated", "该记录日期"),
    "held.field": ("Field that failed", "触发字段"),
    "held.reason": ("Reason", "原因"),
    "held.a1": ("See the last published quarter", "查看最近已发布季度"),
    "held.a2": ("How held-back records work", "暂不发布的规则说明"),
    "held.entitlement": (
        "Membership locks look the same but are a different cause: that content exists and "
        "you may unlock it. This one nobody can see yet.",
        "会员权限锁定的界面与此相同，但原因不同：那类内容确实存在，可通过订阅解锁；"
        "而本条目前任何人都还看不到。",
    ),
    "empty.t": ("This quarter's deck is a new series", "本季演示材料属于新的系列"),
    "empty.p": (
        "United rebuilt its recurring exhibit this quarter. Earlier decks are still readable, "
        "but their pages are not the same series — merging them would invent a history that "
        "was never published.",
        "美联航本季重构了其固定演示材料。此前的材料仍可阅读，但其页面已非同一系列；"
        "强行合并会凭空造出一段从未发布过的历史。",
    ),
    "empty.a1": ("Open this quarter's deck", "打开本季材料"),
    "empty.a2": ("Open the earlier series", "打开此前系列"),
    "empty.fills": (
        "two consecutive quarters publish the same page structure.",
        "连续两个季度发布相同的页面结构。",
    ),
    "empty.timeline": ("SLIDE SERIES", "材料系列"),
    "empty.tl1": ("New structure. Nothing before this quarter carries forward.", "结构更新，本季之前的内容不再延续。"),
    "empty.tl2": ("Earlier series ends here.", "此前系列到此为止。"),
    # -- search -------------------------------------------------------------
    "search.title": ("SEARCH EVERY COMPANY SOURCE", "全库来源检索"),
    "search.placeholder": ("Search transcripts, releases and filings", "检索电话会、业绩公告与申报文件"),
    "search.go": ("Search", "检索"),
    "search.scope.tx": ("Transcripts", "电话会"),
    "search.scope.rel": ("Releases", "业绩公告"),
    "search.scope.fil": ("Filings", "申报文件"),
    "search.scope.slide": ("Slides", "演示材料"),
    "search.results": ("Results from transcripts", "电话会检索结果"),
    "search.openTx": ("Open in reader", "在阅读器中打开"),
    "search.missing": (
        "Filing and release results are missing from this list.",
        "本列表缺少申报文件与业绩公告的结果。",
    ),
    # -- misc ---------------------------------------------------------------
    "misc.reported": ("WHAT THE COMPANY REPORTED", "公司披露内容"),
    "misc.saidOnCall": ("WHAT MANAGEMENT SAID", "管理层表述"),
    "misc.asked": ("WHAT ANALYSTS ASKED", "分析师提问"),
    "misc.notClaimed": ("What we are not claiming", "我们未作出的断言"),
    "misc.contextOnlyFoot": (
        "Context for research. Nothing here ranks, sizes or gates a position.",
        "仅用于研究背景；不参与任何排序、仓位或准入判断。",
    ),
}


def t(key: str, zh: bool) -> str:
    en, cn = COPY[key]
    return cn if zh else en


def e(value: str) -> str:
    return html.escape(str(value), quote=True)


# ---------------------------------------------------------------------------
# fragments
# ---------------------------------------------------------------------------

LENSES = [
    ("lens.brief", None), ("lens.transcript", None), ("lens.sources", None),
    ("lens.history", None), ("lens.topics", None), ("lens.peers", None), ("lens.slides", "soon"),
]


def lensbar(active: str, zh: bool, counts: dict[str, str] | None = None) -> str:
    counts = counts or {}
    out = [f'<div class="ci-lensbar"><nav class="ci-lenses" role="tablist" aria-label="{e(t("hero.kicker", zh))}">']
    for key, flag in LENSES:
        name = key.split(".")[1]
        is_active = name == active
        on = " on" if is_active else ""
        # A lens you are standing on never advertises itself as unbuilt.
        pending = " pending" if (flag == "soon" and not is_active) else ""
        badge = ""
        if flag == "soon" and not is_active:
            badge = f'<span>{e(t("lens.soon", zh))}</span>'
        elif name in counts:
            badge = f'<span class="num">{e(counts[name])}</span>'
        sel = "true" if name == active else "false"
        tab = "0" if name == active else "-1"
        out.append(
            f'<button role="tab" aria-selected="{sel}" tabindex="{tab}" '
            f'class="{on}{pending}".strip()>{e(t(key, zh))}{badge}</button>'.replace('".strip()', '"')
        )
    out.append("</nav></div>")
    return "".join(out)


def loc(kind: str, zh: bool, *, role: str = "", para: int = 0, word: str = "", extra: str = "") -> str:
    """The trailing locator: figures for a place, words for a reason."""
    if kind == "absent":
        return f'<span class="civ-loc absent"><b>{e(word)}</b></span>'
    bits = []
    if role:
        bits.append(f"<b>{e(role)}</b>")
    if para:
        p = f'{t("loc.para", zh)}{para}{t("loc.paraSuffix", zh)}' if zh else f'¶{para}'
        bits.append(f'<span class="num">{e(p)}</span>')
    if extra:
        bits.append(f"<b>{e(extra)}</b>")
    return '<span class="civ-loc"><i aria-hidden="true"></i>'.join([]) or (
        '<span class="civ-loc">' + '<i aria-hidden="true"></i>'.join(bits) + "</span>"
    )


ROLE_SHORT = {
    "Chief Executive Officer": ("CEO", "首席执行官"),
    "Chief Financial Officer": ("CFO", "首席财务官"),
    "Operator": ("Operator", "主持人"),
}


def role_of(claim: dict, zh: bool) -> str:
    raw = claim["role"]
    if raw in ROLE_SHORT:
        return ROLE_SHORT[raw][1 if zh else 0]
    if raw.startswith("Analyst"):
        return "分析师" if zh else "Analyst"
    return raw


def claim_row(text: str, sub: str, state: str, locator: str, *, quote: bool = False, on: bool = False) -> str:
    body = f"<q>{e(text)}</q>" if quote else e(text)
    small = f"<small>{e(sub)}</small>" if sub else ""
    cls = f"civ-claim {state}" + (" on" if on else "")
    return f'<button class="{cls}" aria-pressed="{"true" if on else "false"}"><p>{body}{small}</p>{locator}</button>'


def metric(label: str, value: str, state: str, locator: str) -> str:
    return (
        f'<button class="civ-metric {state}"><span>{e(label)}</span>'
        f'<strong class="num">{e(value)}</strong>{locator}</button>'
    )


def band(kind: str, title: str, para: str, action: str = "") -> str:
    glyph = {"stale": "!", "corrected": "!", "partial": "–", "withheld": "·", "provider": "!"}[kind]
    btn = f'<button class="btn btn-ghost btn-sm">{e(action)}</button>' if action else ""
    return (
        f'<div class="civ-band {kind}" role="status"><i aria-hidden="true">{glyph}</i>'
        f"<div><strong>{e(title)}</strong><p>{e(para)}</p></div>{btn}</div>"
    )


def hero(comp: dict, zh: bool, *, chip: str, chip_color: str, bands: str = "") -> str:
    case = comp["case"]
    iss = comp["issuer"] or {}
    name = case["display_name"]
    period = f'Q{case["fiscal_quarter"]} FY{case["fiscal_year"]}'
    listings = "".join(
        f'<span class="civ-listing{" primary" if l.get("is_primary") else ""}">'
        f'{e(l["ticker"])}<i>{e(l["mic"])} · {e(l["share_class"])}</i></span>'
        for l in iss.get("listings", [])
    )
    dual = len(iss.get("listings", [])) > 1
    # v1 takes displayName.charAt(0), which turns "The Boeing Company" into "T".
    # Skip a leading article so the mark reads as the company.
    mark_src = name[4:] if name.startswith("The ") else name
    fy_end = {12: ("Dec", "12 月"), 9: ("Sep", "9 月"), 7: ("Jul", "7 月")}.get(
        case["fiscal_year_end_month"], (str(case["fiscal_year_end_month"]), str(case["fiscal_year_end_month"])))
    return f"""
<header class="ci-hero">
  <div class="ci-hero-main">
    <div class="ci-identity">
      <span class="ci-company-mark" aria-hidden="true">{e(mark_src[0])}</span>
      <div>
        <div class="ci-title-line">
          <h2>{e(name)}</h2>
          <span class="ci-ticker num">{e(case["ticker"])}</span>
          <span class="fin-tag" style="--c:{chip_color}">{e(chip)}</span>
        </div>
        <p>{e(t("hero.kicker", zh))} · {e(period)} · <time datetime="{e(case["call_date"])}">{e(case["call_date"])}</time></p>
      </div>
    </div>
    <div class="ci-hero-actions">
      <button class="btn btn-ghost">{e(t("hero.receipts", zh))}</button>
      <button class="btn btn-primary">{e(t("hero.ask", zh))}</button>
    </div>
  </div>
  <div class="civ-identity-row">
    <span>{e(t("id.issuer", zh))} <code style="color:var(--text-2);font:500 9.5px/1 var(--font-code)">{e(case["issuer_id"])}</code></span>
    <span>{e(t("id.listings", zh))} {listings}</span>
    <span>{e(t("id.reports", zh))} <b style="color:var(--text-2)">{e(case["reporting_currency"])}</b></span>
    <span>{e(t("id.fyEnds", zh))} <b style="color:var(--text-2)">{e(fy_end[1 if zh else 0])}</b></span>
    <span style="color:var(--text-dim)">{e(t("id.note.dual" if dual else "id.note.one", zh))}</span>
  </div>
  <div class="ci-provenance-bar">
    <span><i class="ci-live-dot" aria-hidden="true"></i>{e(t("prov.knownAt", zh))} <time class="num">2026-08-06 00:00 UTC</time></span>
    <span>{e(t("prov.event", zh))} <code>{e(case["event_id_company_intelligence"])}</code></span>
    <span>{e(t("prov.authority", zh))} <b>{e(t("prov.contextOnly", zh))}</b></span>
  </div>
  {bands}
</header>"""


def rail(title: str, kicker: str, kicker_color: str, quote_html: str, rows: list[tuple], note_key: str,
         zh: bool, actions: list[str], state: str = "exact") -> str:
    body = "".join(
        f'<div><dt>{e(k)}</dt><dd class="{cls}">{v}</dd></div>' for k, v, cls in rows
    )
    acts = "".join(
        f'<button class="btn {"btn-primary" if i == 0 else "btn-ghost"} btn-sm">{e(a)}</button>'
        for i, a in enumerate(actions)
    )
    return f"""
<aside class="ci-evidence civ-claim-{state}" style="--civ-rcpt:var(--rcpt-{state})" role="complementary" aria-label="{e(title)}">
  <div class="ci-evidence-head">
    <div><p class="fin-eyebrow">{e(t("rail.eyebrow", zh))}</p><h3>{e(title)}</h3></div>
    <button class="ci-icon-button" aria-label="{e(t("rail.close", zh))}">&times;</button>
  </div>
  <div class="ci-evidence-body">
    <div class="ci-evidence-kicker"><span class="fin-tag" style="--c:{kicker_color}">{e(kicker)}</span></div>
    {quote_html}
    <dl class="civ-receipt">{body}</dl>
    <div class="civ-note"><i aria-hidden="true">i</i><p>{e(t(note_key, zh))}</p></div>
    <div class="civ-rail-actions">{acts}</div>
  </div>
</aside>"""


def page(slug: str, zh: bool, title: str, case_id: str, canvas: str, railhtml: str, active_lens: str,
         hero_html: str, counts: dict | None = None) -> str:
    lang = "zh" if zh else "en"
    return f"""<!doctype html>
<html lang="{"zh-Hans" if zh else "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)} — Company Intelligence v2 reference</title>
<link rel="stylesheet" href="composition.css">
</head>
<body>
<div class="civ-frame">
  <p class="civ-sheetnote">
    <b>Reference composition — specification, not an implementation.</b>
    <span>case <code>{e(case_id)}</code></span>
    <span>lang <code>{lang}</code></span>
    <span>screenshot at 1440 / 820 / 390</span>
    <span>every figure below is rendered from the golden corpus</span>
  </p>
  {hero_html}
  {lensbar(active_lens, zh, counts)}
  <div class="ci-workspace{"" if railhtml else " no-rail"}">
    <main class="ci-canvas" role="tabpanel">{canvas}</main>
    {railhtml}
  </div>
</div>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# 01 · populated — CIE-GC-0113 · BAC · bank_basis
# ---------------------------------------------------------------------------

def build_populated(zh: bool) -> str:
    comp = BY_SLUG["01-populated"]
    c = {cl["claim_id"]: cl for cl in comp["claims"]}

    tiles = [
        ("Net interest income", "净利息收入", "$24.9B", c["nii"]),
        ("Net interest margin", "净息差", "2.0%", c["nim"]),
        ("Provision for credit losses", "信用损失拨备", "$1,123M", c["provision"]),
        ("CET1 ratio", "核心一级资本充足率", "12.7%", c["cet1"]),
    ]
    tilehtml = "".join(
        metric(cn if zh else en, val, "exact", loc("exact", zh, role=role_of(cl, zh), para=cl["paragraph"]))
        for en, cn, val, cl in tiles
    )

    stance_cl, qa_cl = c["stance"], c["qa"]
    canvas = f"""
<section class="ci-panel">
  <div class="ci-section-label"><span>{e(t("misc.reported", zh))}</span>
    <small>{e("Bank basis · as reported" if not zh else "银行口径 · 按披露")}</small></div>
  <p class="civ-stance"><b>{e(t("state.allCited", zh))}</b>{e(t("stance.exact", zh))}</p>
  <div class="civ-metrics">{tilehtml}</div>
  <div class="civ-absence" style="margin-top:var(--sp-3)">
    <strong>{e(t("misc.notClaimed", zh))}</strong>
    <p>{e(t("absence.noRevenueLine", zh))}</p>
  </div>
</section>

<section class="ci-panel">
  <div class="ci-section-label"><span>{e(t("misc.saidOnCall", zh))}</span>
    <small>{e("Source text, character for character" if not zh else "原文逐字引用")}</small></div>
  {claim_row(stance_cl["text"], f'{stance_cl["speaker"]} · {role_of(stance_cl, zh)}', "exact",
             loc("exact", zh, role=role_of(stance_cl, zh), para=stance_cl["paragraph"]), quote=True)}
  {claim_row(c["provision"]["text"], "" , "exact",
             loc("exact", zh, role=role_of(c["provision"], zh), para=c["provision"]["paragraph"]), quote=True, on=True)}
</section>

<section class="ci-panel">
  <div class="ci-section-label"><span>{e(t("misc.asked", zh))}</span><small>Q&amp;A</small></div>
  {claim_row(qa_cl["text"], f'{qa_cl["speaker"]} · {role_of(qa_cl, zh)}', "exact",
             loc("exact", zh, role=role_of(qa_cl, zh), para=qa_cl["paragraph"]), quote=True)}
</section>
<p style="margin:0;color:var(--text-dim);font:520 10px/1.5 var(--font-ui)">{e(t("misc.contextOnlyFoot", zh))}</p>
"""

    cl = c["provision"]
    quote = (f'<blockquote><q>{e(cl["text"])}</q>'
             f'<cite>{e(cl["speaker"])} — {e(role_of(cl, zh))}</cite></blockquote>')
    rows = [
        (t("rail.document", zh), e(t("docs.transcript", zh)), "word"),
        (t("rail.revision", zh), "1 / 1", ""),
        (t("rail.paragraph", zh), str(cl["paragraph"]), ""),
        (t("rail.bytes", zh), f'{cl["span_start_byte"]}–{cl["span_end_byte"]}', ""),
        (t("rail.basis", zh), e("As reported" if not zh else "按披露口径"), "word"),
        (t("rail.period", zh), "Q1 FY2024", ""),
        (t("rail.currency", zh), "USD", ""),
        (t("rail.sourceHash", zh), f'<code>{e(cl["text_sha256"][:12])}…</code>', ""),
        (t("rail.knownAt", zh), "2024-02-12", ""),
    ]
    railhtml = rail(t("rail.title", zh), t("state.allCited", zh), "var(--rcpt-exact)", quote, rows,
                    "rail.note.exact", zh, [t("rail.openTranscript", zh), t("rail.copyCitation", zh)])

    return page("01-populated", zh, "Populated · BAC", comp["case_id"], canvas, railhtml, "brief",
                hero(comp, zh, chip=t("state.allCited", zh), chip_color="var(--rcpt-exact)"),
                {"sources": "3"})


# ---------------------------------------------------------------------------
# 02 · partial — CIE-GC-0147 · NET · missing_transcript  (THE typed-absence hero)
# ---------------------------------------------------------------------------

def build_partial(zh: bool) -> str:
    comp = BY_SLUG["02-partial"]
    case = comp["case"]
    rev = case["document_revisions"][0]

    tiles = [
        ("Revenue", "营业收入", "abs.noSpan"),
        ("Diluted EPS", "摊薄每股收益", "abs.noSpan"),
        ("Operating margin", "营业利润率", "abs.noSpan"),
        ("Analyst questions", "分析师提问数", "abs.noTranscript"),
    ]
    tilehtml = "".join(
        f'<button class="civ-metric absent"><span>{e(cn if zh else en)}</span>'
        f'<strong>{e(t(tok, zh))}</strong></button>'
        for en, cn, tok in tiles
    )

    canvas = f"""
<section class="ci-panel">
  <div class="ci-section-label"><span>{e(t("misc.reported", zh))}</span>
    <small>{e("Release recorded · body not indexed" if not zh else "已登记公告 · 正文未建索引")}</small></div>
  <p class="civ-stance"><b>{e(t("state.partlyCited", zh))}</b>{e(t("stance.absent", zh))}</p>
  <div class="civ-metrics">{tilehtml}</div>
</section>

<section class="ci-panel">
  <div class="ci-section-label"><span>{e(t("misc.saidOnCall", zh))}</span>
    <small>{e("Nothing to read" if not zh else "暂无原文可查")}</small></div>
  {claim_row(t("absence.title.noTranscript", zh), t("absence.body.noTranscript", zh), "absent",
             loc("absent", zh, word=t("abs.noTranscript", zh)), on=True)}
  <div class="civ-absence" style="margin-top:var(--sp-3)">
    <strong>{e(t("absence.title.noSpan", zh))}</strong>
    <p>{e(t("absence.body.noSpan", zh))}</p>
    <p class="civ-fills"><b>{e(t("absence.whatFills", zh))}</b>{e(t("absence.fills.noSpan", zh))}</p>
  </div>
</section>

<section class="ci-panel">
  <div class="ci-section-label"><span>{e(t("docs.title", zh))}</span><small>1 / 3</small></div>
  <p class="civ-stance">{e(t("stance.docs", zh))}</p>
  <ul class="civ-docs">
    <li class="exact"><span class="civ-doc-mark" aria-hidden="true">R</span>
      <span class="civ-doc-copy"><strong>{e(t("docs.release", zh))}</strong>
        <small>{e(t("docs.rev", zh))} 1 · {e(t("docs.filingNo", zh))} {e(rev["accession_synthetic"])} · <code>{e(rev["source_sha256"][:12])}…</code></small></span>
      <span class="civ-doc-state">{loc("absent", zh, word=t("abs.noSpan", zh))}<a href="#">{e(t("docs.open", zh))} &#8599;</a></span></li>
    <li class="absent"><span class="civ-doc-mark" aria-hidden="true">T</span>
      <span class="civ-doc-copy"><strong>{e(t("docs.transcript", zh))}</strong>
        <small>{e(t("docs.notPublished", zh))}</small></span>
      <span class="civ-doc-state">{loc("absent", zh, word=t("abs.noTranscript", zh))}</span></li>
    <li class="absent"><span class="civ-doc-mark" aria-hidden="true">D</span>
      <span class="civ-doc-copy"><strong>{e(t("docs.deck", zh))}</strong>
        <small>{e(t("docs.notPublished", zh))}</small></span>
      <span class="civ-doc-state">{loc("absent", zh, word=t("abs.notYet", zh))}</span></li>
  </ul>
</section>
<p style="margin:0;color:var(--text-dim);font:520 10px/1.5 var(--font-ui)">{e(t("misc.contextOnlyFoot", zh))}</p>
"""

    quote = (f'<div class="civ-absence"><strong>{e(t("absence.title.noTranscript", zh))}</strong>'
             f'<p>{e(t("absence.body.noTranscript", zh))}</p>'
             f'<p class="civ-fills"><b>{e(t("absence.whatFills", zh))}</b>{e(t("absence.fills.noTranscript", zh))}</p></div>')
    rows = [
        (t("rail.lookedIn", zh), e("Transcript archive · 3,350 symbols" if not zh else "电话会库 · 3,350 个代码"), "word"),
        (t("rail.document", zh), e(t("abs.noTranscript", zh)), "word"),
        (t("rail.period", zh), "Q1 FY2024", ""),
        (t("rail.knownAt", zh), "2026-08-06", ""),
        (t("absence.lastChecked", zh), "2026-08-06 00:00 UTC", ""),
    ]
    railhtml = rail(t("rail.titleAbsent", zh), t("abs.noTranscript", zh), "var(--rcpt-absent)", quote, rows,
                    "rail.note.absent", zh, [t("docs.open", zh) + " " + t("docs.release", zh)], state="absent")

    return page("02-partial", zh, "Partial · NET", comp["case_id"], canvas, railhtml, "brief",
                hero(comp, zh, chip=t("state.partlyCited", zh), chip_color="var(--rcpt-absent)",
                     bands=band("partial", t("band.partial.t", zh), t("band.partial.p", zh))),
                {"sources": "1/3"})


# ---------------------------------------------------------------------------
# 03 · stale — CIE-GC-0063 · AZN · dual_listing
# ---------------------------------------------------------------------------

def build_stale(zh: bool) -> str:
    comp = BY_SLUG["03-stale"]
    c = {cl["claim_id"]: cl for cl in comp["claims"]}
    tiles = [
        ("Total revenue", "营业总收入", "$148.1B", c["revenue"], "As reported", "按披露口径"),
        ("Diluted EPS", "摊薄每股收益", "$8.51", c["eps"], "Non-GAAP", "非公认会计准则"),
        ("Operating margin", "营业利润率", "31.1%", c["margin"], "As reported", "按披露口径"),
        ("Next-quarter guidance", "下季度指引", "$139.2–142.0B", c["guidance"], "As reported", "按披露口径"),
    ]
    tilehtml = "".join(
        metric(f'{cn if zh else en} · {bcn if zh else ben}', val, "exact",
               loc("exact", zh, role=role_of(cl, zh), para=cl["paragraph"]))
        for en, cn, val, cl, ben, bcn in tiles
    )
    st = c["stance"]
    canvas = f"""
<section class="ci-panel">
  <div class="ci-section-label"><span>{e(t("misc.reported", zh))}</span>
    <small>{e("Issuer figures · USD" if not zh else "发行人口径 · 美元")}</small></div>
  <p class="civ-stance"><b>{e(t("state.lastVerified", zh))}</b>{e(t("stance.stale", zh))}</p>
  <div class="civ-metrics">{tilehtml}</div>
</section>

<section class="ci-panel">
  <div class="ci-section-label"><span>{e(t("misc.saidOnCall", zh))}</span>
    <small>{e("Source text, character for character" if not zh else "原文逐字引用")}</small></div>
  {claim_row(c["revenue"]["text"] + ", and " + c["eps"]["text"] + ".", f'{st["speaker"]} · {role_of(st, zh)}',
             "exact", loc("exact", zh, role=role_of(c["revenue"], zh), para=c["revenue"]["paragraph"]),
             quote=True, on=True)}
  {claim_row(st["text"], f'{st["speaker"]} · {role_of(st, zh)}', "exact",
             loc("exact", zh, role=role_of(st, zh), para=st["paragraph"]), quote=True)}
</section>
<p style="margin:0;color:var(--text-dim);font:520 10px/1.5 var(--font-ui)">{e(t("misc.contextOnlyFoot", zh))}</p>
"""
    cl = c["revenue"]
    quote = (f'<blockquote><q>{e(comp["committed_receipt_text"])}</q>'
             f'<cite>{e(cl["speaker"])} — {e(role_of(cl, zh))}</cite></blockquote>')
    rows = [
        (t("rail.document", zh), e(t("docs.transcript", zh)), "word"),
        (t("rail.revision", zh), "1 / 1", ""),
        (t("rail.paragraph", zh), str(cl["paragraph"]), ""),
        (t("rail.bytes", zh), f'{cl["span_start_byte"]}–{cl["span_end_byte"]}', ""),
        (t("rail.basis", zh), e("Non-GAAP, diluted" if not zh else "非公认会计准则 · 摊薄"), "word"),
        (t("rail.currency", zh), "USD", ""),
        (t("rail.sourceHash", zh), f'<code>{e(cl["text_sha256"][:12])}…</code>', ""),
        (t("rail.knownAt", zh), "2024-05-07", ""),
    ]
    railhtml = rail(t("rail.title", zh), t("state.allCited", zh), "var(--rcpt-exact)", quote, rows,
                    "rail.note.exact", zh, [t("rail.openTranscript", zh), t("rail.copyCitation", zh)])
    return page("03-stale", zh, "Stale · AZN", comp["case_id"], canvas, railhtml, "brief",
                hero(comp, zh, chip=t("state.lastVerified", zh), chip_color="var(--rcpt-superseded)",
                     bands=band("stale", t("band.stale.t", zh), t("band.stale.p", zh), t("band.stale.a", zh))),
                {"sources": "3"})


# ---------------------------------------------------------------------------
# 04 · corrected — CIE-GC-0018 · BA · amendment
# ---------------------------------------------------------------------------

def build_corrected(zh: bool) -> str:
    comp = BY_SLUG["04-corrected"]
    c = {cl["claim_id"]: cl for cl in comp["claims"]}
    r1, r2 = comp["case"]["document_revisions"]
    tiles = [
        ("Total revenue", "营业总收入", "$171.1B", c["revenue"], "exact"),
        ("Diluted EPS", "摊薄每股收益", "$11.46", c["eps"], "exact"),
    ]
    tilehtml = "".join(
        metric(cn if zh else en, val, st, loc("exact", zh, role=role_of(cl, zh), para=cl["paragraph"]))
        for en, cn, val, cl, st in tiles
    )
    g = c["guidance"]
    tilehtml += metric("Next-quarter guidance" if not zh else "下季度指引", "$157.4–163.7B", "superseded",
                       loc("exact", zh, role=role_of(g, zh), para=g["paragraph"], extra=t("loc.restated", zh)))
    tilehtml += metric("Operating margin" if not zh else "营业利润率", t("abs.noBasis", zh), "absent", "")

    canvas = f"""
<section class="ci-panel">
  <div class="ci-section-label"><span>{e(t("misc.reported", zh))}</span>
    <small>{e("Rebuilt from revision 2" if not zh else "基于第 2 版重建")}</small></div>
  <p class="civ-stance"><b>{e(t("state.restated", zh))}</b>{e(t("stance.corrected", zh))}</p>
  <div class="civ-metrics">{tilehtml}</div>
</section>

<section class="ci-panel">
  <div class="ci-section-label"><span>{e(t("misc.saidOnCall", zh))}</span>
    <small>{e("The call is unchanged; the release was amended" if not zh else "电话会内容未变，业绩公告已修订")}</small></div>
  {claim_row(g["text"], "", "superseded",
             loc("exact", zh, role=role_of(g, zh), para=g["paragraph"], extra=t("loc.restated", zh)),
             quote=True, on=True)}
  {claim_row(c["revenue"]["text"] + ".", "", "exact",
             loc("exact", zh, role=role_of(c["revenue"], zh), para=c["revenue"]["paragraph"]), quote=True)}
</section>

<section class="ci-panel">
  <div class="ci-section-label"><span>{e(t("docs.title", zh))}</span><small>3</small></div>
  <p class="civ-stance">{e(t("stance.docs", zh))}</p>
  <ul class="civ-docs">
    <li class="superseded"><span class="civ-doc-mark" aria-hidden="true">R2</span>
      <span class="civ-doc-copy"><strong>{e(t("docs.releaseAmended", zh))}</strong>
        <small>{e(t("docs.rev", zh))} 2 · {e(t("docs.filingNo", zh))} {e(r2["accession_synthetic"])} · {e(t("docs.replaces", zh))} <code>{e(r1["source_sha256"][:10])}…</code></small></span>
      <span class="civ-doc-state">{loc("exact", zh, extra=t("loc.restated", zh))}<a href="#">{e(t("docs.open", zh))} &#8599;</a></span></li>
    <li class="exact"><span class="civ-doc-mark" aria-hidden="true">R1</span>
      <span class="civ-doc-copy"><strong>{e(t("docs.release", zh))}</strong>
        <small>{e(t("docs.rev", zh))} 1 · {e(t("docs.filingNo", zh))} {e(r1["accession_synthetic"])} · <code>{e(r1["source_sha256"][:10])}…</code></small></span>
      <span class="civ-doc-state"><a href="#">{e(t("docs.open", zh))} &#8599;</a></span></li>
    <li class="exact"><span class="civ-doc-mark" aria-hidden="true">T</span>
      <span class="civ-doc-copy"><strong>{e(t("docs.transcript", zh))}</strong>
        <small>{e(t("docs.rev", zh))} 1 · <code>{e(comp["document"]["body_sha256"][:10])}…</code></small></span>
      <span class="civ-doc-state"><button>{e(t("docs.read", zh))} &#8250;</button></span></li>
  </ul>
</section>
<p style="margin:0;color:var(--text-dim);font:520 10px/1.5 var(--font-ui)">{e(t("misc.contextOnlyFoot", zh))}</p>
"""
    quote = (f'<blockquote><q>{e(g["text"])}</q><cite>{e(g["speaker"])} — {e(role_of(g, zh))}</cite></blockquote>')
    rows = [
        (t("rail.document", zh), e(t("docs.releaseAmended", zh)), "word"),
        (t("rail.revision", zh), "2 / 2", ""),
        (t("docs.replaces", zh), f'<code>{e(r1["source_sha256"][:12])}…</code>', ""),
        (t("rail.paragraph", zh), str(g["paragraph"]), ""),
        (t("rail.bytes", zh), f'{g["span_start_byte"]}–{g["span_end_byte"]}', ""),
        (t("rail.basis", zh), e("As reported" if not zh else "按披露口径"), "word"),
        (t("rail.knownAt", zh), "2024-05-15", ""),
    ]
    railhtml = rail(t("rail.title", zh), t("state.restated", zh), "var(--rcpt-superseded)", quote, rows,
                    "rail.note.superseded", zh, [t("band.corrected.a", zh), t("rail.openSource", zh)],
                    state="superseded")
    return page("04-corrected", zh, "Corrected · BA", comp["case_id"], canvas, railhtml, "sources",
                hero(comp, zh, chip=t("state.restated", zh), chip_color="var(--rcpt-superseded)",
                     bands=band("corrected", t("band.corrected.t", zh), t("band.corrected.p", zh),
                                t("band.corrected.a", zh))),
                {"sources": "3"})


# ---------------------------------------------------------------------------
# 05 · blocked — CIE-GC-0211 · AMD · future_dated_quarantine
# ---------------------------------------------------------------------------

def build_blocked(zh: bool) -> str:
    comp = BY_SLUG["05-blocked"]
    q = comp["case"]["quarantine"]
    canvas = f"""
<section class="civ-state withheld" role="status">
  <div class="civ-state-mark" aria-hidden="true"></div>
  <h3>{e(t("held.t", zh))}</h3>
  <p>{e(t("held.p", zh))}</p>
  <dl class="civ-state-detail">
    <div><dt>{e(t("held.observed", zh))}</dt><dd>{e(q["observed_at"][:16].replace("T", " "))} UTC</dd></div>
    <div><dt>{e(t("held.dated", zh))}</dt><dd>{e(q["record_timestamp"][:10])}</dd></div>
    <div><dt>{e(t("held.field", zh))}</dt><dd><code style="font:500 9.5px/1.4 var(--font-code)">{e(q["offending_field"])}</code></dd></div>
    <div><dt>{e(t("held.reason", zh))}</dt><dd class="word">{e(q["reason"])}</dd></div>
  </dl>
  <div class="civ-state-actions">
    <button class="btn btn-primary btn-sm">{e(t("held.a1", zh))}</button>
    <button class="btn btn-ghost btn-sm">{e(t("held.a2", zh))}</button>
  </div>
</section>
<div class="civ-absence">
  <strong>{e("Not the same as a membership lock" if not zh else "与会员权限锁定不同")}</strong>
  <p>{e(t("held.entitlement", zh))}</p>
</div>
<p style="margin:0;color:var(--text-dim);font:520 10px/1.5 var(--font-ui)">{e(t("misc.contextOnlyFoot", zh))}</p>
"""
    return page("05-blocked", zh, "Held back · AMD", comp["case_id"], canvas, "", "brief",
                hero(comp, zh, chip=t("state.heldBack", zh), chip_color="var(--rcpt-withheld)",
                     bands=band("withheld", t("held.t", zh), t("held.p", zh))))


# ---------------------------------------------------------------------------
# 06 · empty — CIE-GC-0187 · UAL · changed_slide_family
# ---------------------------------------------------------------------------

def build_empty(zh: bool) -> str:
    comp = BY_SLUG["06-empty"]
    case = comp["case"]
    canvas = f"""
<section class="civ-state" role="status">
  <div class="civ-state-mark" aria-hidden="true"></div>
  <h3>{e(t("empty.t", zh))}</h3>
  <p>{e(t("empty.p", zh))}</p>
  <p class="civ-fills"><b>{e(t("absence.whatFills", zh))}</b>{e(t("empty.fills", zh))}</p>
  <div class="civ-state-actions">
    <button class="btn btn-primary btn-sm">{e(t("empty.a1", zh))}</button>
    <button class="btn btn-ghost btn-sm">{e(t("empty.a2", zh))}</button>
  </div>
</section>

<section class="ci-panel">
  <div class="ci-section-label"><span>{e(t("empty.timeline", zh))}</span>
    <small>{e(case["ticker"])} · {e(f'Q{case["fiscal_quarter"]} FY{case["fiscal_year"]}')}</small></div>
  <ul class="civ-timeline">
    <li class="absent"><time>Q1 FY2024</time>
      <p>{e(t("empty.tl1", zh))}<small>{e(case["call_date"])}</small></p>
      {loc("absent", zh, word=t("abs.seriesChanged", zh))}</li>
    <li class="exact"><time>Q4 FY2023</time>
      <p>{e(t("empty.tl2", zh))}</p>
      {loc("exact", zh, extra=t("loc.deck", zh) + " 1–24")}</li>
  </ul>
</section>
<p style="margin:0;color:var(--text-dim);font:520 10px/1.5 var(--font-ui)">{e(t("misc.contextOnlyFoot", zh))}</p>
"""
    return page("06-empty", zh, "Empty · UAL", comp["case_id"], canvas, "", "slides",
                hero(comp, zh, chip=t("state.newSeries", zh), chip_color="var(--rcpt-absent)"))


# ---------------------------------------------------------------------------
# 07 · provider-down — CIE-GC-0221 · BK · edgar_identity_join
# ---------------------------------------------------------------------------

def build_provider_down(zh: bool) -> str:
    comp = BY_SLUG["07-provider-down"]
    hit = comp["claims"][0]
    ed = comp["edgar"]
    a, b = ed["collector_edgar_earnings_8k_row"], ed["engine_edgar_earnings_wire_row"]
    text = hit["text"]
    marked = text.replace("net interest margin", "<mark>net interest margin</mark>")

    canvas = f"""
<section class="ci-panel">
  <div class="ci-section-label"><span>{e(t("search.title", zh))}</span>
    <small>{e("3,350 symbols · 26,134 documents" if not zh else "3,350 个代码 · 26,134 份文件")}</small></div>
  <p class="civ-stance"><b>{e(t("state.searchDegraded", zh))}</b>{e(t("stance.search", zh))}</p>
  <div class="civ-search-bar">
    <label><span aria-hidden="true" style="font-size:16px">&#9906;</span>
      <input value="net interest margin" aria-label="{e(t("search.placeholder", zh))}"></label>
    <button class="btn btn-primary">{e(t("search.go", zh))}</button>
  </div>
  <div class="civ-search-scope">
    <span class="civ-scope on">{e(t("search.scope.tx", zh))}<span class="num">1</span></span>
    <span class="civ-scope off">{e(t("search.scope.rel", zh))}<span>{e(t("abs.indexDown", zh))}</span></span>
    <span class="civ-scope off">{e(t("search.scope.fil", zh))}<span>{e(t("abs.indexDown", zh))}</span></span>
    <span class="civ-scope off">{e(t("search.scope.slide", zh))}<span>{e(t("abs.notYet", zh))}</span></span>
  </div>
  <div class="ci-section-label" style="margin-top:var(--sp-4)"><span>{e(t("search.results", zh))}</span><small>1</small></div>
  <article class="civ-hit">
    <header>
      <span class="civ-hit-who"><strong>{e(comp["case"]["ticker"])} · {e(comp["case"]["display_name"])}</strong>
        <span>Q1 FY2024 · {e(hit["speaker"])} — {e(role_of(hit, zh))}</span></span>
      {loc("exact", zh, role=role_of(hit, zh), para=hit["paragraph"])}
    </header>
    <p>{marked}</p>
    <footer style="display:flex;gap:10px;padding-top:8px;border-top:1px solid var(--line-2)">
      <button style="color:var(--brand-2);font:640 10px/1 var(--font-ui);min-height:34px">{e(t("search.openTx", zh))} &#8250;</button>
    </footer>
  </article>
</section>

<section class="ci-panel">
  <div class="ci-section-label"><span>{e(t("search.scope.fil", zh))}</span>
    <small>{e(t("search.missing", zh))}</small></div>
  <div class="civ-absence">
    <strong>{e(t("absence.title.unjoinable", zh))}</strong>
    <p>{e(t("absence.body.unjoinable", zh))}</p>
    <dl class="civ-state-detail" style="width:100%;margin-top:4px">
      <div><dt>{e("Reader A records" if not zh else "读取方 A 记录")}</dt>
        <dd class="word">cik {e(a["cik"])} · {e(a["filing_date"])} · {e(a["acceptance_datetime"][11:19])}</dd></div>
      <div><dt>{e("Reader B records" if not zh else "读取方 B 记录")}</dt>
        <dd class="word">{e(b["accession"])}</dd></div>
      <div><dt>{e("Shared today" if not zh else "目前共用字段")}</dt>
        <dd class="word">{e(", ".join(ed["joinable_keys_today"]))}</dd></div>
    </dl>
    <p class="civ-fills"><b>{e(t("absence.whatFills", zh))}</b>{e(t("absence.fills.unjoinable", zh))}</p>
  </div>
</section>
<p style="margin:0;color:var(--text-dim);font:520 10px/1.5 var(--font-ui)">{e(t("misc.contextOnlyFoot", zh))}</p>
"""
    return page("07-provider-down", zh, "Provider down · BK", comp["case_id"], canvas, "", "sources",
                hero(comp, zh, chip=t("state.searchDegraded", zh), chip_color="var(--rcpt-superseded)",
                     bands=band("provider", t("band.provider.t", zh), t("band.provider.p", zh),
                                t("band.provider.a", zh))))


BUILDERS = {
    "01-populated": build_populated,
    "02-partial": build_partial,
    "03-stale": build_stale,
    "04-corrected": build_corrected,
    "05-blocked": build_blocked,
    "06-empty": build_empty,
    "07-provider-down": build_provider_down,
}


def build_index() -> str:
    rows = []
    for comp in PAYLOAD["compositions"]:
        c = comp["case"]
        rows.append(
            f'<tr><td><a href="{comp["slug"]}.html">{e(comp["slug"])}</a> '
            f'<a href="{comp["slug"]}.zh.html" style="color:var(--muted)">zh</a></td>'
            f'<td>{e(comp["state"])}</td><td><code>{e(c["case_id"])}</code></td>'
            f'<td class="num">{e(c["ticker"])}</td><td>{e(c["display_name"])}</td>'
            f'<td>{e(c["difficulty_class"])}</td><td>{e(c["expected_v2_outcome"])}</td>'
            f'<td class="num">{len(comp["claims"])}</td></tr>'
        )
    g = PAYLOAD["generated_from"]
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Company Intelligence v2 — reference compositions</title>
<link rel="stylesheet" href="composition.css"></head>
<body><div class="civ-frame">
<h1 style="margin:0 0 6px;font:680 22px/1.2 var(--font-ui);letter-spacing:-.02em">Company Intelligence v2 — reference compositions</h1>
<p style="margin:0 0 var(--sp-4);color:var(--text-2);font:520 12px/1.6 var(--font-ui);max-width:70ch">
This is a <b>specification</b>, not an implementation. Each page renders one release-law state from one
named golden-corpus case. Screenshots at 1440 / 820 / 390 are in <code>shots/</code>.</p>
<p class="civ-sheetnote"><span>corpus <code>{e(g["corpus_generated_utc"])}</code></span>
<span>manifest sha256 <code>{e(g["manifest_sha256"][:16])}…</code></span>
<span>{g["counts"]["cases"]} cases / {g["counts"]["issuers_with_cases"]} issuers</span></p>
<div class="ci-panel"><div class="civ-index-scroll"><table class="civ-index" style="width:100%;border-collapse:collapse;font:530 11.5px/1.5 var(--font-ui)">
<thead><tr style="color:var(--muted);font:700 9.5px/1 var(--font-ui);letter-spacing:.1em;text-transform:uppercase">
<th style="text-align:left;padding:8px">page</th><th style="text-align:left;padding:8px">state</th>
<th style="text-align:left;padding:8px">case</th><th style="text-align:left;padding:8px">sym</th>
<th style="text-align:left;padding:8px">issuer</th><th style="text-align:left;padding:8px">difficulty</th>
<th style="text-align:left;padding:8px">v2 outcome</th><th style="text-align:left;padding:8px">spans</th></tr></thead>
<tbody>{"".join(rows)}</tbody></table></div></div>
<style>.civ-index-scroll{{overflow-x:auto;-webkit-overflow-scrolling:touch}}.civ-index{{min-width:720px}}.civ-index td{{padding:9px 8px;border-top:1px solid var(--line-2)}}.civ-index a{{color:var(--brand-2)}}
.civ-index code{{font:500 9.5px/1.4 var(--font-code);color:var(--text-2)}}</style>
</div></body></html>
"""


def build_copy_table() -> str:
    lines = ["| Key | English | 中文 |", "|---|---|---|"]
    for key, (en, cn) in COPY.items():
        lines.append(f"| `{key}` | {en.replace('|', '\\|')} | {cn.replace('|', '\\|')} |")
    return "\n".join(lines) + "\n"


def main() -> None:
    for slug, fn in BUILDERS.items():
        (HERE / f"{slug}.html").write_text(fn(False))
        (HERE / f"{slug}.zh.html").write_text(fn(True))
    (HERE / "index.html").write_text(build_index())
    (HERE / "copy_table.md").write_text(build_copy_table())
    print(f"built {len(BUILDERS) * 2} pages + index.html + copy_table.md ({len(COPY)} copy keys)")


if __name__ == "__main__":
    main()
