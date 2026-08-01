import SwiftUI

/// TV's **Add-Symbol** surface (`TV_PARITY_MASTER_SPEC` §3.2 · `spec-search` §2.2/§3):
/// a `Theme.panel2` sheet carrying a filled 36 pt search field with a trailing "Close"
/// text button, a horizontally-scrollable `TVChip` category row, and a flat list of
/// 60 pt `TVSymbolRow.symbol2` results separated by 1 pt `#414141` rules — with **no**
/// rule above row 1.
///
/// Vertical rhythm is the measured one (§2.2 "Vertical rhythm"): safe-area top → field
/// 31.7 pt, field → chips 19.3 pt, chips → row 1 8.7 pt.
///
/// Behaviour is unchanged from the pre-restyle sheet: an empty query still resolves to a
/// non-empty default (recents, else the active list), a selected chip with an empty query
/// still BROWSES that category (search-row law), row taps still beacon `SearchTracker`,
/// and `.add` mode still toggles membership rather than navigating away. The one addition
/// is the §3.2.7 `TVToast` confirmation on a successful add.
struct SearchSheet: View {
    enum Mode { case go, add }
    let mode: Mode
    let onClose: () -> Void

    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var manifest: ManifestStore
    @EnvironmentObject private var watchlists: WatchlistStore
    @State private var query = ""
    @State private var category: String?
    /// Cached so the O(universe) category fold doesn't re-run three times per keystroke.
    @State private var categories: [String] = []
    @State private var toast: TVToastContent?
    @FocusState private var fieldFocused: Bool
    @AppStorage("mm.recents.v1") private var recentsRaw = ""

    var body: some View {
        VStack(spacing: 0) {
            // §3.2.1/§3.2.2 — filled 36 pt `Theme.control` capsule, trailing "Close" TEXT
            // button (17 pt white), never an `×`.
            TVSearchField(
                // §3.2.3 / spec-search §3.1: the Add-symbol field's copy is literally
                // "Use = to do math" because the field doubles as a calculator. It ships
                // WITH `TVCalc` below — ledger A33's rule is that a placeholder may never
                // advertise a capability the field does not have.
                placeholder: L10n.t("Use = to do math", model.lang),
                text: $query,
                variant: .filled,
                trailing: .label(L10n.t("Close", model.lang)),
                autocapitalization: .characters,
                focus: $fieldFocused,
                onTrailing: onClose
            )
            .padding(.top, 31.7)

            chipRow
                .padding(.top, 19.3)

            resultsList
                .padding(.top, 8.7)
        }
        .background(Theme.panel2.ignoresSafeArea())
        .tvToast($toast)
        .task(id: manifest.rows.count) { categories = manifest.categories }
        .onAppear { fieldFocused = true }
    }

    // MARK: - Category chips (§3.2.4)

    /// Data-driven from the manifest's own category buckets — "All" is index 0 and maps to
    /// a `nil` filter, so the category-browse law keeps working untouched.
    private var chipRow: some View {
        TVChipRow(
            titles: [L10n.t("All", model.lang)] + categories,
            selectedIndex: selectedChipIndex
        ) { index in
            guard index > 0, index - 1 < categories.count else {
                category = nil
                return
            }
            category = categories[index - 1]
        }
    }

    private var selectedChipIndex: Int {
        guard let category, let index = categories.firstIndex(of: category) else { return 0 }
        return index + 1
    }

    // MARK: - Results (§3.2.5–§3.2.8)

    private var results: [String] {
        let q = query.trimmingCharacters(in: .whitespaces)
        if q.isEmpty && category == nil {
            // §3.2.8 non-empty default: recents first, else the user's own list — never an
            // alphabetical wall of the whole universe, and never a blank pane.
            let recents = recentsRaw.split(separator: ",").map(String.init).filter { manifest.rows[$0] != nil }
            return recents.isEmpty ? watchlists.active.symbols : recents
        }
        return manifest.search(query: q, category: category, lang: model.lang)
    }

    private var resultsList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                mathRow
                ForEach(Array(results.enumerated()), id: \.element) { index, sym in
                    // §3.2.5 — 1 pt `#414141` between rows, content-aligned at 16 pt and
                    // flush right; deliberately absent above row 1. (A math row, when one
                    // is showing, IS row 0 — so row 1 takes its divider from it.)
                    if index > 0 || mathValue != nil {
                        TVHairline.sheet(tone: .sheetRow, inset: TVSpace.s4)
                    }
                    resultRow(sym)
                }
            }
        }
        .scrollDismissesKeyboard(.immediately)
    }

    private func resultRow(_ sym: String) -> some View {
        let row = manifest.rows[sym]
        let name = manifest.displayName(sym, lang: model.lang)
        // §2.6 `.symbol2` grid — the trailing column is TWO lines (exchange over category),
        // right-aligned and baseline-matched to the leading stack, not a single centred
        // label. Our manifest publishes no `mkt` venue string to the app, so `venue()`
        // derives the one the SYMBOL itself encodes; nothing here is invented.
        let data = TVSymbolRowData(
            symbol: sym,
            name: name,
            colorHex: row?.col,
            market: row?.sec,
            trailingTop: venue(sym, sec: row?.sec),
            trailingBottom: row?.sec
        )
        let isAdded = watchlists.contains(sym)
        return TVSymbolRow(data, variant: .symbol2) {
            // §3.2.6 accessory zone: the 18 pt venue badge, then the 18 pt add glyph —
            // both pinned to the row's vertical centre, independent of the text stack.
            // 8.7 pt spacing lands the badge on its measured x-band (328–346 of 402) given
            // the add glyph's 30 pt hit frame (spec-search §2.2 row anatomy).
            HStack(spacing: 8.7) {
                TVExchangeBadge(kind: .exchange)
                TVAddGlyph(
                    isAdded: isAdded,
                    accessibilityLabel: isAdded
                        ? L10n.t("Remove", model.lang)
                        : L10n.t("Add", model.lang)
                ) {
                    commitAdd(sym)
                }
            }
        }
        .onTapGesture { pick(sym) }
    }

    /// Venue label for the trailing line 1 (§2.6 `.symbol2`, spec-search §2.2).
    ///
    /// Mirrors `terminal/lib/markets.ts groupFromSymbol()`'s suffix routing so the app can
    /// never name a venue the web would classify differently. Where the suffix names an
    /// exchange we print that exchange; where it doesn't, we print the venue group we
    /// actually know (`US`) rather than guessing NYSE-vs-NASDAQ. Presentation only — no
    /// classification decision is made here that the web doesn't already make.
    private func venue(_ sym: String, sec: String?) -> String {
        let upper = sym.uppercased()
        if upper.hasSuffix("-USD") { return "COINBASE" }   // the crypto lane's actual feed
        if sec == "Crypto" { return "CRYPTO" }
        guard let dot = upper.lastIndex(of: "."), dot < upper.index(before: upper.endIndex) else {
            return "US"
        }
        let suffix = String(upper[upper.index(after: dot)...])
        switch suffix {
        case "SS": return "SSE"
        case "SZ": return "SZSE"
        case "BJ": return "BSE"
        case "HK": return "HKEX"
        case "TO": return "TSX"
        case "V": return "TSXV"
        case "NE": return "NEO"
        // Any other 2–3 letter suffix is a foreign venue; the suffix IS its code, so
        // printing it is honest where inventing a full exchange name would not be. A
        // single unmapped letter is a US share class (`BRK.B`), never a venue.
        default: return suffix.count >= 2 ? suffix : "US"
        }
    }

    // MARK: - Inline calculator (§3.2.3 · spec-search §5 · ledger A32)

    /// The `=`-prefixed expression, sans the `=`.
    private var mathExpression: String {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.hasPrefix("=") else { return "" }
        return String(q.dropFirst()).trimmingCharacters(in: .whitespaces)
    }

    private var mathValue: String? {
        guard !mathExpression.isEmpty, let v = TVCalc.evaluate(mathExpression) else { return nil }
        return TVCalc.format(v)
    }

    /// A 60 pt row on the same grid as a result row: expression left, value right. Not
    /// tappable — it is an answer, not a destination.
    @ViewBuilder private var mathRow: some View {
        if let value = mathValue {
            HStack(spacing: TVSpace.s2) {
                Text("= \(mathExpression)")
                    .font(TVType.rowSecondary)
                    .foregroundStyle(Theme.text2)
                    .lineLimit(1)
                Spacer(minLength: TVSpace.s2)
                Text(value)
                    .font(TVType.rowPrimary.monospacedDigit())
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
            }
            .padding(.leading, TVSymbolRowMetrics.leftInset)
            .padding(.trailing, TVSymbolRowMetrics.trailingInset)
            .frame(height: TVSymbolRowMetrics.symbolHeight)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("search-math-result")
        }
    }

    // MARK: - Actions

    /// Row `+` — membership toggle (unchanged), plus the §3.2.7 toast on a successful add.
    /// TV's checkmark never reverts; ours stays a toggle so an accidental add is undoable
    /// from the sheet that made it. Restyle, don't refunction.
    private func commitAdd(_ sym: String) {
        let wasInList = watchlists.contains(sym)
        // Add-only beacon: a toggle that removes is not a search commit.
        if !wasInList {
            SearchTracker.track(sym, source: "ios-watchlist-add", query: query)
        }
        watchlists.toggle(sym)
        guard !wasInList, mode == .add else { return }
        toast = TVToastContent(
            title: sym,
            subtitle: String(format: L10n.t("Added to \"%@\"", model.lang), watchlists.active.name)
        )
    }

    /// A committed search: the row tap is the signal the web's search log measures, so it
    /// beacons here exactly as the web modal does (dedupe lives in SearchTracker).
    private func pick(_ sym: String) {
        recordRecent(sym)
        switch mode {
        case .go:
            SearchTracker.track(sym, source: "ios-search", query: query)
            model.openChart(symbol: sym)
            onClose()
        case .add:
            commitAdd(sym)
        }
    }

    private func recordRecent(_ sym: String) {
        var recents = recentsRaw.split(separator: ",").map(String.init).filter { $0 != sym }
        recents.insert(sym, at: 0)
        recentsRaw = recents.prefix(8).joined(separator: ",")
    }
}

/// The arithmetic behind the search field's "Use = to do math" affordance (spec-search §5,
/// gap-ledger A32 — "build now natively, pure presentation, zero backend").
///
/// Hand-rolled on purpose: `NSExpression(format:)` raises an **Objective-C** exception on
/// malformed input, which Swift cannot catch, and a search field that evaluates on every
/// keystroke would turn a stray `(` into a crash. This parser returns `nil` instead.
///
/// This is arithmetic on characters the user typed — no market data, no indicator, no
/// signal. The native-code law (AGENTS.md) bars analysis math, not a four-function
/// calculator.
enum TVCalc {
    /// `nil` for anything that isn't a complete, finite expression — a partial expression
    /// mid-typing simply shows no answer rather than a wrong one.
    static func evaluate(_ raw: String) -> Double? {
        let cleaned = raw.replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: ",", with: "")
        guard !cleaned.isEmpty, cleaned.count <= 128 else { return nil }
        var parser = Parser(Array(cleaned))
        guard let value = parser.expression(), parser.atEnd, value.isFinite else { return nil }
        return value
    }

    /// Integers print bare; fractions trim to at most 6 places with no trailing zeros.
    static func format(_ value: Double) -> String {
        if value == value.rounded() && abs(value) < 1e15 {
            return String(format: "%.0f", value)
        }
        var s = String(format: "%.6f", value)
        while s.hasSuffix("0") { s.removeLast() }
        if s.hasSuffix(".") { s.removeLast() }
        return s
    }

    /// Recursive descent over `+ - * / ( )` with unary sign. Total: every path either
    /// consumes input or returns `nil`, so it terminates on any string.
    private struct Parser {
        private let chars: [Character]
        private var index = 0

        init(_ chars: [Character]) { self.chars = chars }

        var atEnd: Bool { index >= chars.count }

        private func peek() -> Character? { index < chars.count ? chars[index] : nil }

        mutating func expression() -> Double? {
            guard var lhs = term() else { return nil }
            while let c = peek(), c == "+" || c == "-" {
                index += 1
                guard let rhs = term() else { return nil }
                lhs = (c == "+") ? lhs + rhs : lhs - rhs
            }
            return lhs
        }

        private mutating func term() -> Double? {
            guard var lhs = factor() else { return nil }
            while let c = peek(), c == "*" || c == "/" || c == "×" || c == "÷" {
                index += 1
                guard let rhs = factor() else { return nil }
                if c == "*" || c == "×" {
                    lhs *= rhs
                } else {
                    guard rhs != 0 else { return nil }
                    lhs /= rhs
                }
            }
            return lhs
        }

        private mutating func factor() -> Double? {
            guard let c = peek() else { return nil }
            if c == "-" {
                index += 1
                guard let v = factor() else { return nil }
                return -v
            }
            if c == "+" {
                index += 1
                return factor()
            }
            if c == "(" {
                index += 1
                guard let v = expression(), peek() == ")" else { return nil }
                index += 1
                return v
            }
            return number()
        }

        private mutating func number() -> Double? {
            var s = ""
            while let c = peek(), c.isNumber || c == "." {
                s.append(c)
                index += 1
            }
            return s.isEmpty ? nil : Double(s)
        }
    }
}
