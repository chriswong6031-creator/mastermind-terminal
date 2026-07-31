import Foundation

/// Named watchlists, device-local for the guest alpha (S5 syncs the signed-in user's
/// Supabase lists through the same shape). Mirrors the web's model: multiple named
/// lists, one active, ordered symbols.
@MainActor
final class WatchlistStore: ObservableObject {
    struct WatchList: Codable, Equatable {
        var name: String
        var symbols: [String]
    }

    @Published private(set) var lists: [WatchList] {
        didSet { persist() }
    }
    @Published var activeIndex: Int {
        didSet { UserDefaults.standard.set(activeIndex, forKey: Self.activeKey) }
    }

    private static let listsKey = "mm.watchlists.v1"
    private static let activeKey = "mm.activeList.v1"

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.listsKey),
           let saved = try? JSONDecoder().decode([WatchList].self, from: data), !saved.isEmpty {
            lists = saved
        } else {
            lists = [WatchList(name: "Default", symbols: AppConfig.guestWatchlist.map(\.symbol))]
        }
        let idx = UserDefaults.standard.integer(forKey: Self.activeKey)
        activeIndex = idx
        if idx >= lists.count { activeIndex = 0 }
    }

    var active: WatchList { lists[min(activeIndex, lists.count - 1)] }

    func contains(_ symbol: String) -> Bool { active.symbols.contains(symbol) }

    func toggle(_ symbol: String) {
        var list = active
        if let at = list.symbols.firstIndex(of: symbol) {
            list.symbols.remove(at: at)
        } else {
            list.symbols.append(symbol)
        }
        lists[min(activeIndex, lists.count - 1)] = list
    }

    func remove(_ symbol: String) {
        var list = active
        list.symbols.removeAll { $0 == symbol }
        lists[min(activeIndex, lists.count - 1)] = list
    }

    func moveToTop(_ symbol: String) {
        var list = active
        list.symbols.removeAll { $0 == symbol }
        list.symbols.insert(symbol, at: 0)
        lists[min(activeIndex, lists.count - 1)] = list
    }

    func createList(named name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, !lists.contains(where: { $0.name == trimmed }) else { return }
        lists.append(WatchList(name: trimmed, symbols: []))
        activeIndex = lists.count - 1
    }

    func deleteActiveList() {
        guard lists.count > 1 else { return }
        lists.remove(at: activeIndex)
        activeIndex = max(0, activeIndex - 1)
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(lists) {
            UserDefaults.standard.set(data, forKey: Self.listsKey)
        }
    }
}
