import SwiftUI

// Shared row anatomy for the TV-style lists: logo circle · symbol + one-language name ·
// right-aligned price stack (price over signed colored change%). Flat dark rows with
// hairline separators — never grouped-inset boxes.
//
// These primitives predate `TVKit.swift` and are retargeted to its measurements
// (docs/tv-parity/TV_PARITY_MASTER_SPEC.md §2.1/§2.4/§2.6). New screens should compose
// `TVSymbolRow` / `TVChipRow` / `TVHairline` directly; the types below stay so existing
// call sites keep working, and now render at the spec's sizes.

/// ANIM-16 — `AsyncImage` uses `URLCache.shared`, whose default 512 KB memory / 10 MB disk
/// budget evicts a scrolled list's logos almost immediately, so every tab return re-fetched
/// them and the fade played again. Sized here, as a one-shot, rather than in the app's
/// `init()`: the cache exists for this view and nothing else reads it.
private enum LogoCache {
    static let install: Void = {
        URLCache.shared = URLCache(memoryCapacity: 8 << 20, diskCapacity: 64 << 20)
    }()
}

struct LogoCircle: View {
    let symbol: String
    let colorHex: String?
    /// §2.6 avatar: 36 pt on the standard rows (was 34), 24 pt on `.compact`.
    var size: CGFloat = 36
    /// Numeric tickers (CN/HK) get the company name's initial — a "0" badge says nothing.
    var nameForInitial: String = ""
    /// Manifest `sec` (used for the crypto logo family, mirroring lib/assetLogos.ts).
    var market: String? = nil

    private var initial: String {
        if let first = symbol.first, first.isLetter { return String(first) }
        if let first = nameForInitial.first { return String(first) }
        return String(symbol.prefix(1))
    }

    /// Same contract as the web's assetLogoPath(): logo.dev image CDN, publishable token,
    /// crypto family for -USD pairs, 404 fallback → the initial circle below.
    private var logoURL: URL? {
        _ = LogoCache.install
        let isCrypto = (market?.localizedCaseInsensitiveContains("crypto") ?? false)
            || symbol.uppercased().hasSuffix("-USD")
        let lookup = isCrypto && symbol.uppercased().hasSuffix("-USD") ? String(symbol.dropLast(4)) : symbol
        let family = isCrypto ? "crypto" : "ticker"
        var components = URLComponents(string: "https://img.logo.dev/\(family)/\(lookup)")
        components?.queryItems = [
            URLQueryItem(name: "token", value: "pk_c5LwRfhZRCWZUm6KzpmDRQ"),
            URLQueryItem(name: "size", value: "64"),
            URLQueryItem(name: "format", value: "webp"),
            URLQueryItem(name: "retina", value: "true"),
            URLQueryItem(name: "fallback", value: "404"),
        ]
        return components?.url
    }

    /// C26 — the fetched mark is drawn inside the **inscribed square** of the plate, not
    /// across the plate's full box. logo.dev ships a square canvas whose artwork runs
    /// edge to edge; clipping that square to a circle cuts every mark whose silhouette
    /// reaches the corners — AAPL's apple was sliced flat on its left, right and bottom
    /// by the plate it is supposed to sit on. A square of side `d / √2 ≈ 0.707 d` is the
    /// largest that fits inside a circle of diameter `d`, so at this ratio no mark can
    /// escape the plate whatever its shape. Full-bleed brand artwork (BTC, TSLA, NVDA)
    /// simply shows a ring of the manifest's own brand colour around it, which is the
    /// same colour the artwork's own disc carries.
    static let markInset: CGFloat = 0.70

    var body: some View {
        ZStack {
            // The contrast plate. It is the tile's floor and is never removed — the mark
            // sits *on* it, and for a dark mark on a black page it is the only thing that
            // keeps the logo legible at all.
            plate
            AsyncImage(
                url: logoURL,
                transaction: Transaction(animation: .easeOut(duration: 0.18))
            ) { phase in
                ZStack {
                    // The monogram is the floor, not an alternative branch: it stays
                    // mounted for the whole load so nothing swaps mid-scroll (ANIM-16 —
                    // the hard swap is what made a list of rows flicker in sequence). It
                    // *fades* rather than unmounts once the mark lands, because a mark
                    // inset to 0.70 no longer covers the plate edge to edge and a letter
                    // left underneath it could show through the mark's own transparency.
                    monogram
                        .opacity(phase.image == nil ? 1 : 0)
                    if let image = phase.image {
                        // Aspect-**fit**, never fill: `scaledToFill` also let a non-square
                        // asset overflow on its long axis before the circle clipped it.
                        image
                            .resizable()
                            .scaledToFit()
                            .frame(width: size * Self.markInset, height: size * Self.markInset)
                    }
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var plate: some View {
        Color(hexString: colorHex) ?? Theme.panel3
    }

    private var monogram: some View {
        Text(initial)
            .font(.system(size: size * 0.44, weight: .bold))
            .foregroundStyle(.white)
    }
}

struct PriceStack: View {
    let last: Double?
    let chgPct: Double?
    var extPrice: Double? = nil
    var extChgPct: Double? = nil
    var extSession: String? = nil
    var alignment: HorizontalAlignment = .trailing
    var prominent = false

    /// ANIM-08 — `+1` up-tick, `-1` down-tick, `nil` at rest. The direction, not the size:
    /// the flash says a print landed and which way it went, and the number says how much.
    @State private var flash: Double?

    var body: some View {
        VStack(alignment: alignment, spacing: 2) {
            // §2.6 row line 1 = 17 pt Semibold; §3.4.3 hero price = 28 pt Bold.
            Text(Self.price(last))
                .font(.system(size: prominent ? 28 : 17, weight: prominent ? .bold : .semibold).monospacedDigit())
                .foregroundStyle(Theme.text)
                // The quote poller replaces values wholesale every 6 s; without a content
                // transition the list reads as a page that reloads, not a live surface.
                .contentTransition(.numericText())
                .animation(.easeOut(duration: 0.25), value: last)
                .background {
                    if let flash {
                        // Negative padding so the plate bleeds past the glyphs without
                        // moving them — the row's 17.3 pt trailing inset is measured.
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(flash > 0 ? Theme.upFill : Theme.downFill)
                            .opacity(0.18)
                            .padding(.horizontal, -4)
                            .padding(.vertical, -1)
                    }
                }
                .accessibilityIdentifier("regular-price")
            // §2.6 row line 2 = 15 pt Medium. Exactly 0.00 renders `Theme.text`, not green.
            Text(Self.change(chgPct))
                .font(.system(size: prominent ? 17 : 15, weight: prominent ? .semibold : .medium).monospacedDigit())
                .foregroundStyle(TVFormat.changeColor(chgPct))
                .contentTransition(.numericText())
                .animation(.easeOut(duration: 0.25), value: chgPct)
                .accessibilityIdentifier("regular-change")
            if let extPrice, extPrice.isFinite, extPrice > 0 {
                ExtendedQuoteLine(price: extPrice, change: extChgPct, session: extSession)
                    .padding(.top, 2)
            }
        }
        .onChange(of: last) { old, new in
            guard let old, let new, old.isFinite, new.isFinite, new != old else { return }
            flash = new > old ? 1 : -1
            Task { @MainActor in
                // One runloop hop before the fade: set-and-clear inside a single
                // transaction coalesces to "nil" and the lit frame never paints.
                withAnimation(.easeOut(duration: 0.32)) { flash = nil }
            }
        }
    }

    /// Canonical formatters now live in `TVFormat` (TVKit) so one symbol never formats
    /// two ways on two screens; these stay as the pre-existing call-site spelling.
    static func price(_ value: Double?) -> String { TVFormat.price(value) }

    static func change(_ pct: Double?) -> String { TVFormat.change(pct) }
}

/// Compact third line for a pre/post/overnight print, kept visually separate so an
/// extended-hours percentage can never be mistaken for the EOD move.
/// §3.1.14: the 8 pt `PRE`/`AH`/`OVN` text badge is replaced by TV's moon glyph
/// (`Theme.extHours` — the only chromatic icon in the row system) over a 13 pt line;
/// the VoiceOver label is kept because naming the session out loud beats TV's silence.
struct ExtendedQuoteLine: View {
    let price: Double
    let change: Double?
    let session: String?

    private var fullLabel: String {
        switch session {
        case "pre": return "Pre-market"
        case "post": return "After hours"
        default: return "Overnight"
        }
    }

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "moon.fill")
                .font(.system(size: 9))
                .foregroundStyle(Theme.extHours)
            Text(PriceStack.price(price))
                .foregroundStyle(Theme.text2)
            if let change, change.isFinite {
                Text(PriceStack.change(change))
                    .foregroundStyle(TVFormat.changeColor(change))
            }
        }
        .font(TVType.rowTertiary.monospacedDigit())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(fullLabel), \(PriceStack.price(price)), \(PriceStack.change(change))")
        .accessibilityIdentifier("extended-quote")
    }
}

/// §2.6 leading stack: ticker 17 pt Semibold `Theme.text` over name 15 pt Regular
/// `Theme.text2` (was 15/11 in `Theme.muted`).
struct SymbolTitle: View {
    let symbol: String
    let name: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(symbol)
                .font(TVType.rowPrimary)
                .foregroundStyle(Theme.text)
            Text(name)
                .font(TVType.rowSecondary)
                .foregroundStyle(Theme.text2)
                .lineLimit(1)
        }
    }
}

/// TV's named-list switcher. Now a thin wrapper over `TVChipRow` (§2.4): 33.7 pt capsules,
/// 18 pt Bold labels, 16 pt leading inset, and **no uppercasing** — TV does not uppercase
/// list names, and our old 12 pt uppercased chips were ~40 % too small.
struct ListChipsRow: View {
    let names: [String]
    let activeIndex: Int
    let onPick: (Int) -> Void

    var body: some View {
        TVChipRow(titles: names, selectedIndex: activeIndex, onSelect: onPick)
    }
}

/// Thin alias for `TVHairline`'s default (§2.1): a true single device pixel in
/// `Theme.line`, the correct rule for pure-black pages and the tab-bar top edge.
/// Sheet contexts want `TVHairline(weight: .sheet, tone: .sheetRow)`; watchlist rows on
/// black want `TVHairline(tone: .list)`.
struct Hairline: View {
    var body: some View {
        TVHairline()
    }
}

extension Color {
    /// Parses the manifest's per-symbol brand color ("#76b900").
    init?(hexString: String?) {
        guard var hex = hexString?.trimmingCharacters(in: .whitespaces), hex.hasPrefix("#") else { return nil }
        hex.removeFirst()
        guard hex.count == 6, let value = UInt32(hex, radix: 16) else { return nil }
        self.init(hex: value)
    }
}
