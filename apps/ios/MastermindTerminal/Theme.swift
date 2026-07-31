import SwiftUI

/// Terminal v5 palette — hand-mirrored from terminal/app/globals.css :root tokens.
/// Native chrome must read as the same product as the web terminal; when the web
/// palette changes, update these hex values in the same PR.
enum Theme {
    static let bg = Color(hex: 0x0A0B0E)        // --bg
    static let panel = Color(hex: 0x0D0F13)     // --panel
    static let panel2 = Color(hex: 0x15171D)    // --panel-2
    static let panel3 = Color(hex: 0x1F222B)    // --panel-3
    static let chartBg = Color(hex: 0x131722)   // --chart-bg
    static let line = Color(hex: 0x23262F)      // --line
    static let text = Color(hex: 0xD6DAE3)      // --text
    static let text2 = Color(hex: 0x9BA3B4)     // --text-2
    static let muted = Color(hex: 0x717A8E)     // --muted
    static let up = Color(hex: 0x26C281)        // --up
    static let down = Color(hex: 0xF0566B)      // --down
    static let brand = Color(hex: 0x2962FF)     // --brand
    static let brand2 = Color(hex: 0x4D82FF)    // --brand-2
    static let signal = Color(hex: 0xE8B339)    // --signal
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
