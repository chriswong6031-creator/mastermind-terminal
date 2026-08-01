import Foundation
import OSLog
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

    /// `OSLog` at debug level rather than `print`: it is stripped from release logging by
    /// the system, carries the subsystem, and never reaches the shipped device console.
    /// The payload is a credential and is never an argument — status codes only.
    private static let log = Logger(subsystem: service, category: "keychain")

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
        let status = SecItemAdd(attributes as CFDictionary, nil)
        if status != errSecSuccess { log.debug("save failed: \(status, privacy: .public)") }
        return status == errSecSuccess
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
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status != errSecSuccess && status != errSecItemNotFound {
            log.debug("load failed: \(status, privacy: .public)")
        }
        guard status == errSecSuccess else { return nil }
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
