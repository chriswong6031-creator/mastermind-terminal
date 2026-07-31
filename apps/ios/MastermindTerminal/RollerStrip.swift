import SwiftUI
import UIKit

/// The TV signature interaction: symbol and timeframe live in compact wheel pickers —
/// drag rolls with the OS picker physics (the date-picker mechanic) and the chart
/// hot-swaps on every detent via the bridge. Ghost prev/next chambers show above and
/// below the selection; a haptic tick fires per detent.
struct RollerStrip: View {
    let symbols: [String]
    let timeframes: [String]
    @Binding var symbolIndex: Int
    @Binding var timeframeIndex: Int
    let onSymbol: (String) -> Void
    let onTimeframe: (String) -> Void
    let onSearch: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            WheelColumn(items: symbols, selection: $symbolIndex, width: 116, bold: true) {
                onSymbol($0)
            }
            Rectangle().fill(Theme.line).frame(width: 0.5, height: 30)
            WheelColumn(items: timeframes, selection: $timeframeIndex, width: 74, bold: false) {
                onTimeframe($0)
            }
            Rectangle().fill(Theme.line).frame(width: 0.5, height: 30)
            Button(action: onSearch) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.text2)
                    .frame(width: 48, height: 44)
            }
            Spacer(minLength: 0)
        }
        .frame(height: 64)
        .background(Theme.panel.opacity(0.96))
        .overlay(alignment: .top) { Hairline() }
    }
}

private struct WheelColumn: View {
    let items: [String]
    @Binding var selection: Int
    let width: CGFloat
    let bold: Bool
    let onPick: (String) -> Void

    var body: some View {
        CompactWheel(items: items, selection: $selection, bold: bold, onPick: onPick)
            .frame(width: width, height: 92)
            .clipped()
            .frame(height: 64)
    }
}

/// UIPickerView wrapped for a compact transparent wheel: OS drag physics and snap,
/// custom dark labels, no selection chrome, selection-changed haptics.
private struct CompactWheel: UIViewRepresentable {
    let items: [String]
    @Binding var selection: Int
    let bold: Bool
    let onPick: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UIPickerView {
        let picker = UIPickerView()
        picker.dataSource = context.coordinator
        picker.delegate = context.coordinator
        picker.backgroundColor = .clear
        return picker
    }

    func updateUIView(_ picker: UIPickerView, context: Context) {
        context.coordinator.parent = self
        if context.coordinator.itemCount != items.count {
            context.coordinator.itemCount = items.count
            picker.reloadAllComponents()
        }
        let clamped = max(0, min(selection, items.count - 1))
        if !items.isEmpty, picker.selectedRow(inComponent: 0) != clamped {
            picker.selectRow(clamped, inComponent: 0, animated: true)
        }
        // The OS selection bar reads as a gray pill over the chart strip — keep it clear.
        for sub in picker.subviews where sub.bounds.height < 44 && sub.bounds.height > 0 {
            sub.backgroundColor = .clear
        }
    }

    final class Coordinator: NSObject, UIPickerViewDataSource, UIPickerViewDelegate {
        var parent: CompactWheel
        var itemCount = 0
        private let haptic = UISelectionFeedbackGenerator()

        init(_ parent: CompactWheel) {
            self.parent = parent
            self.itemCount = parent.items.count
        }

        func numberOfComponents(in pickerView: UIPickerView) -> Int { 1 }

        func pickerView(_ pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int {
            parent.items.count
        }

        func pickerView(_ pickerView: UIPickerView, rowHeightForComponent component: Int) -> CGFloat { 30 }

        func pickerView(_ pickerView: UIPickerView, viewForRow row: Int, forComponent component: Int, reusing view: UIView?) -> UIView {
            let label = (view as? UILabel) ?? UILabel()
            label.text = parent.items.indices.contains(row) ? parent.items[row] : ""
            label.font = .systemFont(ofSize: 15, weight: parent.bold ? .bold : .semibold)
            label.textColor = UIColor(Theme.text)
            label.textAlignment = .center
            return label
        }

        func pickerView(_ pickerView: UIPickerView, didSelectRow row: Int, inComponent component: Int) {
            guard parent.items.indices.contains(row) else { return }
            haptic.selectionChanged()
            parent.selection = row
            parent.onPick(parent.items[row])
        }
    }
}
