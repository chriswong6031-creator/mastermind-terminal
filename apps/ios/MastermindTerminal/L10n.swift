import Foundation

/// Minimal native-string table for the EN/中文 toggle (S5). The web workspace
/// translates itself through the bridge's setLang; this table covers native
/// chrome only. Keys are the English strings, so any label can be wrapped in
/// `L10n.t("…", model.lang)` without waiting for a table entry — unknown keys
/// fall back to English.
enum L10n {
    static func t(_ en: String, _ lang: String) -> String {
        guard lang == "zh" else { return en }
        return zh[en] ?? en
    }

    private static let zh: [String: String] = [
        // Tabs / navigation
        "Watchlist": "自选",
        "Chart": "图表",
        "Markets": "行情",
        "Menu": "菜单",

        // Watchlist + lists
        "My watchlist": "我的自选",
        "New list": "新建列表",
        "Rename": "重命名",
        "Delete": "删除",
        "Remove": "移除",
        "Edit": "编辑",
        "Done": "完成",
        "Add": "添加",
        "Add symbol": "添加代码",

        // Search
        "Search": "搜索",
        "Search symbols": "搜索代码",
        "Recents": "最近",
        "Cancel": "取消",
        "No results": "无结果",
        "All": "全部",

        // Symbol preview
        "Open": "开盘",
        "High": "最高",
        "Low": "最低",
        "Volume": "成交量",
        "52W High": "52周最高",
        "52W Low": "52周最低",
        "Open full chart": "打开完整图表",
        "RESEARCH DESK READ — NOT A TRADE SIGNAL": "研究台解读 — 非交易信号",
        "Drivers": "驱动因素",
        "Cautions": "风险提示",
        "Conviction": "信心分",

        // Markets
        "Discover": "发现",
        "Analysis": "分析",

        // Menu / account
        "Account": "账户",
        "Guest": "访客",
        "Guest mode": "访客模式",
        "Sign in": "登录",
        "Sign out": "退出登录",
        "Signed in": "已登录",
        "Create account": "注册账户",
        "Language": "语言",
        "Version": "版本",
        "About": "关于",
        "Settings": "设置",

        // Sign-in screen
        "Email": "邮箱",
        "Password": "密码",
        "Signing in…": "正在登录…",
        "Sign-in failed": "登录失败",
        "Check your email or password.": "请检查邮箱或密码。",
        "Continue as guest": "以访客继续",
        "Forgot password?": "忘记密码？",

        // Cloud sync
        "Synced": "已同步",
        "Syncing…": "同步中…",
        "Sync failed — changes are saved on this device.": "同步失败 — 更改已保存在本机。",

        // Web covers / errors
        "Connecting…": "连接中…",
        "Can't reach the terminal": "无法连接终端",
        "Retry": "重试",
        "Not in this alpha": "不在此 Alpha 版本",
        "Open in browser": "在浏览器打开",
    ]
}
