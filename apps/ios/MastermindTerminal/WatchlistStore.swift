import Foundation

/// Named watchlists, device-local storage of record. Mirrors the web's model: multiple
/// named lists, one active, ordered symbols. Signed-in users additionally get the list
/// named "Default" mirrored to Supabase by WatchlistSyncService — every other list stays
/// on the device, exactly like the web terminal.
@MainActor
final class WatchlistStore: ObservableObject {
    struct WatchList: Codable, Equatable {
        var name: String
        var symbols: [String]
    }

    /// One membership mutation the cloud mirror cares about. `moveToTop` is deliberately
    /// absent: order is local-only, and the web never syncs it either.
    struct Change {
        enum Kind { case add, remove }
        let list: String
        let symbol: String
        let kind: Kind
    }

    /// The only list name that round-trips to the cloud (web parity law).
    static let cloudListName = "Default"

    /// Write-through seam for WatchlistSyncService, wired in `init`. Fired AFTER the local
    /// mutation is committed — the cloud never gates or reverts an optimistic local edit.
    var onChange: ((Change) -> Void)?

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
            lists = [WatchList(name: Self.cloudListName, symbols: AppConfig.guestWatchlist.map(\.symbol))]
        }
        let idx = UserDefaults.standard.integer(forKey: Self.activeKey)
        activeIndex = idx
        if idx >= lists.count { activeIndex = 0 }
        // Sync wires itself to the store, so no App-level plumbing is needed and a guest
        // session stays entirely offline.
        WatchlistSyncService.shared.attach(self)
    }

    var active: WatchList { lists[min(activeIndex, lists.count - 1)] }

    func contains(_ symbol: String) -> Bool { active.symbols.contains(symbol) }

    func toggle(_ symbol: String) {
        var list = active
        let kind: Change.Kind
        if let at = list.symbols.firstIndex(of: symbol) {
            list.symbols.remove(at: at)
            kind = .remove
        } else {
            list.symbols.append(symbol)
            kind = .add
        }
        lists[min(activeIndex, lists.count - 1)] = list
        onChange?(Change(list: list.name, symbol: symbol, kind: kind))
    }

    func remove(_ symbol: String) {
        var list = active
        guard list.symbols.contains(symbol) else { return }
        list.symbols.removeAll { $0 == symbol }
        lists[min(activeIndex, lists.count - 1)] = list
        onChange?(Change(list: list.name, symbol: symbol, kind: .remove))
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

    /// List creation and deletion are device-local on purpose: the web terminal has no
    /// multi-list UI, so only symbol membership of "Default" is mirrored to the cloud.
    func deleteActiveList() {
        guard lists.count > 1 else { return }
        lists.remove(at: activeIndex)
        activeIndex = max(0, activeIndex - 1)
    }

    // MARK: - cloud seams (WatchlistSyncService)

    /// Symbols of the synced list, or nil when this device has no "Default" list (the user
    /// deleted it) — sync then stays a no-op rather than recreating something they removed.
    var cloudListSymbols: [String]? {
        lists.first(where: { $0.name == Self.cloudListName })?.symbols
    }

    /// Appends server-only symbols to the synced list, keeping local order intact.
    /// Reconcile-only path: it does NOT fire `onChange`, so healing down can never bounce
    /// back up as fresh cloud writes.
    func appendFromCloud(_ symbols: [String]) {
        guard let idx = lists.firstIndex(where: { $0.name == Self.cloudListName }) else { return }
        var seen = Set(lists[idx].symbols)
        var additions: [String] = []
        for symbol in symbols where !seen.contains(symbol) {
            seen.insert(symbol)
            additions.append(symbol)
        }
        guard !additions.isEmpty else { return }
        lists[idx].symbols.append(contentsOf: additions)
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(lists) {
            UserDefaults.standard.set(data, forKey: Self.listsKey)
        }
    }
}
