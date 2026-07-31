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

    private var initial: String {
        if let first = symbol.first, first.isLetter { return String(first) }
        if let first = nameForInitial.first { return String(first) }
        return String(symbol.prefix(1))
    }

    var body: some View {
        Text(initial)
            .font(.system(size: size * 0.44, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Color(hexString: colorHex) ?? Theme.panel3, in: Circle())
    }
}

struct PriceStack: View {
    let last: Double?
    let chgPct: Double?

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text(Self.price(last))
                .font(.system(size: 15, weight: .semibold).monospacedDigit())
                .foregroundStyle(Theme.text)
            Text(Self.change(chgPct))
                .font(.system(size: 12, weight: .medium).monospacedDigit())
                .foregroundStyle((chgPct ?? 0) >= 0 ? Theme.up : Theme.down)
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
