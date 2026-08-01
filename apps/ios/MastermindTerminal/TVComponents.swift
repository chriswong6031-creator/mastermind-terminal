import SwiftUI

// Shared row anatomy for the TV-style lists: logo circle · symbol + one-language name ·
// right-aligned price stack (price over signed colored change%). Flat dark rows with
// hairline separators — never grouped-inset boxes.
//
// These primitives predate `TVKit.swift` and are retargeted to its measurements
// (docs/tv-parity/TV_PARITY_MASTER_SPEC.md §2.1/§2.4/§2.6). New screens should compose
// `TVSymbolRow` / `TVChipRow` / `TVHairline` directly; the types below stay so existing
// call sites keep working, and now render at the spec's sizes.

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

    var body: some View {
        AsyncImage(url: logoURL) { phase in
            if case .success(let image) = phase {
                image.resizable().scaledToFill()
            } else {
                Text(initial)
                    .font(.system(size: size * 0.44, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: size, height: size)
                    .background(Color(hexString: colorHex) ?? Theme.panel3)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
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

    var body: some View {
        VStack(alignment: alignment, spacing: 2) {
            // §2.6 row line 1 = 17 pt Semibold; §3.4.3 hero price = 28 pt Bold.
            Text(Self.price(last))
                .font(.system(size: prominent ? 28 : 17, weight: prominent ? .bold : .semibold).monospacedDigit())
                .foregroundStyle(Theme.text)
                .accessibilityIdentifier("regular-price")
            // §2.6 row line 2 = 15 pt Medium. Exactly 0.00 renders `Theme.text`, not green.
            Text(Self.change(chgPct))
                .font(.system(size: prominent ? 17 : 15, weight: prominent ? .semibold : .medium).monospacedDigit())
                .foregroundStyle(TVFormat.changeColor(chgPct))
                .accessibilityIdentifier("regular-change")
            if let extPrice, extPrice.isFinite, extPrice > 0 {
                ExtendedQuoteLine(price: extPrice, change: extChgPct, session: extSession)
                    .padding(.top, 2)
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
