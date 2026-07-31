import SwiftUI

// Shared row anatomy for the TV-style lists: logo circle · symbol + one-language name ·
// right-aligned price stack (price over signed colored change%). Flat dark rows with
// hairline separators — never grouped-inset boxes.

struct LogoCircle: View {
    let symbol: String
    let colorHex: String?
    var size: CGFloat = 34
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
            Text(Self.price(last))
                .font(.system(size: prominent ? 22 : 15, weight: prominent ? .bold : .semibold).monospacedDigit())
                .foregroundStyle(Theme.text)
                .accessibilityIdentifier("regular-price")
            Text(Self.change(chgPct))
                .font(.system(size: prominent ? 13 : 12, weight: prominent ? .semibold : .medium).monospacedDigit())
                .foregroundStyle((chgPct ?? 0) >= 0 ? Theme.up : Theme.down)
                .accessibilityIdentifier("regular-change")
            if let extPrice, extPrice.isFinite, extPrice > 0 {
                ExtendedQuoteLine(price: extPrice, change: extChgPct, session: extSession)
                    .padding(.top, 2)
            }
        }
    }

    static func price(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "—" }
        return String(format: value < 10 ? "%.4f" : "%.2f", value)
    }

    static func change(_ pct: Double?) -> String {
        guard let pct, pct.isFinite else { return "—" }
        return String(format: "%@%.2f%%", pct >= 0 ? "+" : "", pct)
    }
}

/// Compact third line for a pre/post/overnight print. It is intentionally a separate
/// labeled capsule so an extended-hours percentage can never be mistaken for the EOD move.
struct ExtendedQuoteLine: View {
    let price: Double
    let change: Double?
    let session: String?

    private var shortLabel: String {
        switch session {
        case "pre": return "PRE"
        case "post": return "AH"
        default: return "OVN"
        }
    }

    private var fullLabel: String {
        switch session {
        case "pre": return "Pre-market"
        case "post": return "After hours"
        default: return "Overnight"
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Text(shortLabel)
                .font(.system(size: 8, weight: .bold))
                .tracking(0.3)
                .foregroundStyle(Theme.signal)
                .padding(.horizontal, 4)
                .padding(.vertical, 2)
                .background(Theme.signal.opacity(0.13), in: RoundedRectangle(cornerRadius: 3))
            Text(PriceStack.price(price))
                .foregroundStyle(Theme.text2)
            if let change, change.isFinite {
                Text(PriceStack.change(change))
                    .foregroundStyle(change >= 0 ? Theme.up : Theme.down)
            }
        }
        .font(.system(size: 9, weight: .semibold).monospacedDigit())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(fullLabel), \(PriceStack.price(price)), \(PriceStack.change(change))")
        .accessibilityIdentifier("extended-quote")
    }
}

struct SymbolTitle: View {
    let symbol: String
    let name: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.text)
            Text(name)
                .font(.system(size: 11))
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
        }
    }
}

/// TV's named-list switcher: a horizontal row of pills, active one filled.
struct ListChipsRow: View {
    let names: [String]
    let activeIndex: Int
    let onPick: (Int) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(names.enumerated()), id: \.offset) { index, name in
                    Button {
                        onPick(index)
                    } label: {
                        Text(name.uppercased())
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(index == activeIndex ? Theme.text : Theme.muted)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(index == activeIndex ? Theme.panel3 : .clear, in: Capsule())
                    }
                }
            }
            .padding(.horizontal, 14)
        }
    }
}

struct Hairline: View {
    var body: some View {
        Rectangle().fill(Theme.line).frame(height: 0.5)
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
