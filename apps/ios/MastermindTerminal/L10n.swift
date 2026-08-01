import Foundation

/// Minimal native-string table for the EN/中文 toggle (S5). The web workspace
/// translates itself through the bridge's setLang; this table covers native
/// chrome only. Keys are the English strings, so any label can be wrapped in
/// `L10n.t("…", model.lang)` without waiting for a table entry — unknown keys
/// fall back to English. (The Logo.dev attribution stays English in both
/// languages on purpose: it is a brand credit, not product copy.)
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
        "New watchlist": "新建自选列表",
        "List name": "列表名称",
        "Create": "创建",
        "Rename": "重命名",
        "Delete": "删除",
        "Delete list": "删除列表",
        "Delete this list": "删除此列表",
        "Remove": "移除",
        "Edit": "编辑",
        "Done": "完成",
        "Add": "添加",
        "Add symbol": "添加代码",
        "Add symbols": "添加代码",
        "No symbols yet": "暂无代码",
        "Open chart": "打开图表",
        "Move to top": "置顶",

        // Search
        "Search": "搜索",
        "Search symbols": "搜索代码",
        "Recent": "最近",
        "Cancel": "取消",
        "Close": "关闭",
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
        "Screeners, heatmap & market movers": "筛选器、热力图与市场异动",
        "Research desk & deep dives": "研究台与深度分析",

        // Menu / account
        "Account": "账户",
        "Guest": "访客",
        "Guest mode": "访客模式",
        "Sign in": "登录",
        "Sign out": "退出登录",
        "Signed in": "已登录",
        "Sign in to sync your watchlists": "登录以同步自选列表",
        "Create account": "注册账户",
        "Language": "语言",
        "Version": "版本",
        "Bridge": "桥接",
        "About": "关于",
        "Settings": "设置",
        "Open the web Terminal": "打开网页版终端",
        "External pages always open in the system browser.": "外部页面始终在系统浏览器中打开。",

        // Sign-in screen
        "Email": "邮箱",
        "Password": "密码",
        "Signing in…": "正在登录…",
        "Sign-in failed": "登录失败",
        "Check your email or password.": "请检查邮箱或密码。",
        "Couldn't reach the server. Check your connection.": "无法连接服务器，请检查网络。",
        "Signing in is optional — the app works as a guest.": "登录为可选 — 应用可以访客身份使用。",
        "Continue as guest": "以访客继续",

        // Cloud sync
        "Synced": "已同步",
        "Syncing…": "同步中…",
        "Sync failed — changes are saved on this device.": "同步失败 — 更改已保存在本机。",

        // Tab bar / Explore / Community (TV-parity wave)
        "Explore": "探索",
        "Community": "社区",
        "Community arrives in a later alpha.": "社区将在后续 Alpha 版本推出。",
        "This part of Explore arrives in a later alpha.": "该功能将在后续 Alpha 版本推出。",
        "Top stories arrive in a later alpha.": "头条资讯将在后续 Alpha 版本推出。",
        "Top Stories": "头条",
        "News": "资讯",
        "Calendar": "日历",
        "Delayed": "延迟",
        "today": "今日",

        // Watchlist ••• menu / sort / context menu
        "Sort by": "排序",
        "News by watchlist": "自选新闻",
        "All watchlists": "全部自选列表",
        "Create new list": "新建自选列表",
        "Watchlists": "自选列表",
        "Open symbol screen": "打开品种页",
        "Add alert": "添加警报",
        "More": "更多",
        "Customized order": "自定义顺序",
        "Symbol": "代码",
        "Last price": "最新价",
        "Change": "涨跌",
        "Change (%)": "涨跌幅",
        "Flag": "标记",
        "Extended hours": "盘前盘后",
        "Market cap": "市值",

        // Search (add-symbol surface)
        "Use = to do math": "输入 = 可计算",
        "Added to \"%@\"": "已加入「%@」",

        // Chart toolbar / analysis hub
        "Interval": "周期",
        "Draw": "绘图",
        "Magnet": "磁吸",
        "Undo": "撤销",
        "Full screen": "全屏",
        "Rotate to full screen": "旋转以全屏",
        "Landscape hides the app chrome.": "横屏将隐藏应用界面。",
        "Analysis hub": "分析中心",
        "Indicators": "指标",
        "Templates": "模板",
        "Chart type": "图表类型",
        "Drawings": "绘图工具",
        "Alerts": "警报",
        "Object tree": "对象树",
        "Save": "保存",
        "Layout setup": "布局设置",
        "Manage layout": "管理布局",
        "Tools": "工具",
        "Info": "信息",
        "Financials": "财务",
        "Forecast": "预测",
        "Technicals": "技术面",
        "Symbol details": "品种详情",
        "Pine Editor": "Pine 编辑器",
        "Siri shortcut": "Siri 快捷指令",

        // Menu (TV-parity wave)
        "Messages": "消息",
        "Help Center": "帮助中心",
        "Manage subscription": "管理订阅",
        "Plans and billing on the web": "套餐与账单请在网页端管理",
        "Plan managed on the web": "套餐在网页端管理",

        // Symbol detail (TV-parity wave)
        "Key stats": "关键数据",
        "Day's range": "当日区间",
        "52-week range": "52周区间",
        "Research desk read": "研究台解读",
        "Overview": "概览",
        "Ideas": "观点",
        "Minds": "讨论",
        "Share": "分享",
        "Notes": "笔记",
        "Metrics": "指标数据",
        "More actions": "更多操作",
        "Switch symbol": "切换品种",
        "at close": "收盘",

        // Web covers / errors
        "Loading chart…": "图表加载中…",
        "The chart is taking too long to load.": "图表加载时间过长。",
        "Can't reach the Terminal": "无法连接终端",
        "Retry": "重试",
        "OK": "好",
        "Not in this alpha": "不在此 Alpha 版本",
        "That area of the Terminal isn't part of the app alpha yet. It remains available on the website.": "该功能尚未包含在 App Alpha 版中，网页版仍可正常使用。",
        "Open in browser": "在浏览器打开",
    ]
}
