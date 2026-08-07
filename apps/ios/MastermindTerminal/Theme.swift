import SwiftUI

/// TV-parity palette — every value is a measured hex from the lossless capture census
/// in `docs/tv-parity/TV_PARITY_MASTER_SPEC.md` §1.1, applied through the §1.7 retarget
/// table. Token names are kept from the previous Terminal-v5 mapping so existing call
/// sites keep compiling; the *values* are now TradingView's, not `globals.css`'s.
///
/// The single highest-impact edit is `bg`: TV's base is pure `#000000`, ours was
/// `0x0A0B0E`, and that 10-unit lift is what made every native screen read "washed"
/// next to TV on OLED (§1.7).
///
/// Surface-hierarchy law (§1.2): full-screen pages and symbol/list sheets are `bg`;
/// chart-tooling sheets are `panel2` with raised children at `panel3`; a raised child
/// on pure black steps to `pill` instead (the one-notch rule, C21).
enum Theme {
    // MARK: Surfaces (§1.1 — four tiers, never collapse them)

    /// `tvBlack` — canvas for full-screen pages, list sheets, symbol detail, chart bottom toolbar.
    static let bg = Color(hex: 0x000000)
    /// `tvChrome` — **tab bar only.** Imperceptibly-lighter black; reads as a material, not a fill.
    static let panel = Color(hex: 0x040404)
    /// `tvSheet` — tool sheets: Analysis hub, Chart type, Drawings, Layout, add-symbol search, context menus.
    static let panel2 = Color(hex: 0x1C1C1E)
    /// `tvTile` — filled tiles/cards **inside** a `panel2` sheet. One step up, never two.
    static let panel3 = Color(hex: 0x2C2C2E)
    /// `tvChartTop` — chart canvas gradient top. Already exact pre-retarget (C12); do not change.
    static let chartBg = Color(hex: 0x131722)
    /// `tvChartBottom` — chart canvas gradient bottom. The canvas is a vertical gradient, not a flat fill.
    static let chartBgBottom = Color(hex: 0x181B26)

    // MARK: Lines (§1.1 — two weights keyed to host surface, C19/C20)

    /// `tvHairline` / `tvRule` — structural rules, sheet-row dividers, ghost-button borders, tab-bar top rule.
    static let line = Color(hex: 0x4A4A4A)
    /// `tvHairlineList` — between flat list rows on a `panel2` sheet.
    static let lineSheetRow = Color(hex: 0x414141)
    /// `tvHairlineSoft` — between rows inside a `rowBlock` container.
    static let lineSoft = Color(hex: 0x3D3D3D)
    /// `tvRuleList` — between watchlist symbol rows on pure black (C20).
    static let lineList = Color(hex: 0x323235)

    // MARK: Text (§1.1 — TradingView uses no pure white for body text, C13)

    /// `tvText` — titles, tickers, prices, row labels, tab labels, icons.
    static let text = Color(hex: 0xDBDBDB)
    /// `tvTextSecondary` — subtitles, company names, placeholders, section captions, unselected chips.
    static let text2 = Color(hex: 0x8C8C8C)
    /// `tvTextTertiary` — timestamps, disabled rows, hint copy, plain-list chevrons (D9).
    static let muted = Color(hex: 0x6F6F6F)
    /// `tvTextInverse` — text/glyphs on an inverted (white) surface. New token (§1.7).
    static let inverseText = Color(hex: 0x0F0F0F)
    /// `tvInverse` (rows) — selected row / selected segmented-pill fill. New token (§1.7).
    static let inverseRow = Color(hex: 0xF2F2F2)
    /// `tvDismiss` — the `×` glyph inside a circular sheet-close button; deliberately dimmer than `text`.
    static let dismiss = Color(hex: 0xA0A0A8)

    // MARK: Raised-child fills (§1.2 one-notch rule)

    /// `tvPill` — chip/capsule/card fill on a **pure-black** host (C21). New token (§1.7).
    static let pill = Color(hex: 0x2E2E2E)
    /// `tvControl` — filled search field; close-button circle fill inside sheets. New token (§1.7).
    static let control = Color(hex: 0x313135)
    /// `tvRowBlock` — elevated grouped row container on a black sheet (Compare Symbols recents). New token (§1.7).
    static let rowBlock = Color(hex: 0x1F1F1F)

    // MARK: Scrims (§1.1)

    /// `tvScrim` — the dimmed presenting layer above a raised sheet (sheet top edge y = 62 pt).
    static let scrim = Color(hex: 0x141415)
    /// `tvScrimChart` — same, when a chart is the presenting layer (top edge y = 83 pt).
    static let scrimChart = Color(hex: 0x1D1D1D)

    // MARK: Semantic (§1.1 — the up/down split, C1/C2)

    /// `tvUpText` — positive change text, `+%`, range-slider fill, donut arc.
    static let upText = Color(hex: 0x22AB94)
    /// `tvUpFill` — up candles, filled bars, price badges, gauge arcs.
    static let upFill = Color(hex: 0x089981)
    /// `tvDownText` — negative change text, `−%`.
    static let downText = Color(hex: 0xF7525F)
    /// `tvDownFill` — down candles, price badges, and the universal red notification dot.
    /// Also the destructive-label red (Sign out, D5-menu).
    static let downFill = Color(hex: 0xF23645)
    /// Alias of `upText` — kept so pre-retarget call sites compile. Prefer `upText`/`upFill`.
    static let up = upText
    /// Alias of `downText` — kept so pre-retarget call sites compile. Prefer `downText`/`downFill`.
    static let down = downText

    // MARK: Accents (§1.1)

    /// `tvBrand` — links, bid numerals, "Buy" signal text, single-series bar charts. Already exact.
    static let brand = Color(hex: 0x2962FF)
    /// `tvSelectAccent` — border of the selected-indicator floating pill on the chart.
    static let brand2 = Color(hex: 0x3D7BFF)
    /// `tvExtHours` — the moon glyph on a watchlist extended-hours line; the only chromatic icon
    /// in the row system.
    static let extHours = Color(hex: 0x2456FF)
    /// `tvDelayD` — the orange "D" delayed-data glyph. Bare glyph, no background chip.
    static let delayed = Color(hex: 0xF57C00)
    /// `tvCtaDisabled` — disabled `TVPrimaryCTA` fill (flat mid-gray, label colour unchanged).
    static let ctaDisabled = Color(hex: 0x7F7F7F)
    /// `TVToast` card fill (§2.17).
    static let toast = Color(hex: 0x242424)
    /// No TV equivalent — kept for our own affordances (delayed-badge accents, sync chips).
    static let signal = Color(hex: 0xE8B339)
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}
