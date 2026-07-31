import Foundation
import Security

/// The only place a Supabase token is allowed to rest. Never UserDefaults, never a
/// file, never a log line — a refresh token is a long-lived credential and everything
/// else on iOS is readable from a backup or a jailbroken device.
///
/// `afterFirstUnlock` (not `whenUnlocked`) so a token refresh triggered while the
/// screen is locked still succeeds; nothing is readable before the first unlock after
/// boot. Deliberately not `ThisDeviceOnly`: matching the web's "stay signed in across
/// devices" expectation is worth the encrypted-backup exposure for a session that the
/// server can revoke.
enum KeychainStore {
    static let service = "com.mastermindx.terminal"
    static let sessionAccount = "supabase.session"

    /// Delete-then-add rather than add-or-update: one code path, and a corrupt or
    /// duplicated item can never survive a save.
    @discardableResult
    static func save(_ data: Data, account: String) -> Bool {
        delete(account: account)
        let attributes: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        return SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess
    }

    static func load(account: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess else { return nil }
        return item as? Data
    }

    static func delete(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
