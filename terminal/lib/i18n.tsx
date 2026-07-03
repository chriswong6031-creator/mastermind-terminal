"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Lang = "en" | "zh";

// UI-chrome lexicon: key -> [English, 中文]. Dynamic data (prices, symbols, AI prose) is handled
// elsewhere (the copilot is told to answer in the active language); this covers the static shell.
const LEX: Record<string, [string, string]> = {
  // settings
  settings: ["Settings", "设置"],
  updownColors: ["Up / Down colors", "涨跌颜色"],
  greenUp: ["Green up", "绿涨红跌"],
  redUp: ["Red up", "红涨绿跌"],
  language: ["Language", "语言"],
  signOut: ["Sign out", "退出登录"],
  // nav
  chart: ["Chart", "图表"],
  screener: ["Screener", "选股"],
  scripts: ["Scripts", "脚本"],
  portfolio: ["Portfolio", "投资组合"],
  alerts: ["Alerts", "提醒"],
  ai: ["Mastermind AI", "智脑 AI"],
  // chart toolbar
  priceChart: ["Price chart", "价格图表"],
  strategyTester: ["Strategy tester", "策略回测"],
  indicators: ["Indicators", "指标"],
  compare: ["Compare", "对比"],
  detect: ["Detect", "智能识别"],
  layouts: ["Layouts", "布局"],
  sync: ["Sync", "同步"],
  mtf: ["MTF", "多周期"],
  // chart types
  ctCandles: ["Candles", "蜡烛图"],
  ctHeikin: ["Heikin Ashi", "平均K线"],
  ctBars: ["Bars", "美国线"],
  ctLine: ["Line", "线形图"],
  ctArea: ["Area", "面积图"],
  // timeframe groups
  tfMinutes: ["Minutes", "分钟"],
  tfHours: ["Hours", "小时"],
  tfDays: ["Days", "日线"],
  tfWeeks: ["Weeks", "周线"],
  tfMonths: ["Months", "月线"],
  liveFeed: ["live feed", "实时行情"],
  // detectors
  autoTrendlines: ["Auto trendlines", "自动趋势线"],
  autoFib: ["Auto Fibonacci", "自动斐波那契"],
  srHeatmap: ["S/R strength heatmap", "支撑阻力强度热图"],
  mtfSR: ["Multi-timeframe S/R", "多周期支撑阻力"],
  clearDetected: ["Clear detected", "清除识别"],
  // layouts popover
  saveCurrentAs: ["Save current as…", "保存当前为…"],
  save: ["Save", "保存"],
  noSavedLayouts: ["No saved layouts", "暂无已存布局"],
  // toolbar tooltips / drawing tools
  fullscreenChart: ["Fullscreen chart", "全屏图表"],
  exitFullscreen: ["Exit fullscreen", "退出全屏"],
  snapshot: ["Snapshot", "截图"],
  splitLayout: ["Split layout", "分屏布局"],
  mtfTip: ["Multi-timeframe — the active symbol at D / 3D / W / 1M", "多周期 — 当前标的的 日/3日/周/月 图"],
  syncTip: ["Sync crosshair & time-axis across panes", "跨窗格同步十字光标与时间轴"],
  magnetTip: ["Magnet — snap to OHLC", "磁吸 — 吸附到OHLC"],
  clearDrawings: ["Clear detected", "清除识别"],
  toolCursor: ["Cursor", "光标"],
  toolTrendline: ["Trend line", "趋势线"],
  toolRay: ["Ray", "射线"],
  toolHline: ["Horizontal line", "水平线"],
  toolRect: ["Rectangle", "矩形"],
  toolFib: ["Fibonacci", "斐波那契"],
  toolText: ["Text", "文字"],
  toolMeasure: ["Measure", "测量"],
  toolArrow: ["Arrow", "箭头"],
  toolVline: ["Vertical line", "垂直线"],
  toolErase: ["Erase", "擦除"],
  // topbar stats
  lastPrice: ["Last Price", "最新价"],
  change24h: ["24h Change", "24h涨跌"],
  volume: ["Volume", "成交量"],
  dayHigh: ["Day High", "当日最高"],
  dayLow: ["Day Low", "当日最低"],
  dayRange: ["Day Range", "当日区间"],
  live: ["Live", "实时"],
  historical: ["Historical", "历史"],
  delayed15m: ["15-min delayed", "延迟15分钟"],
  delayed15mShort: ["15-min", "延迟15分"],
  liveTip: ["Live feed activates with a real-time Polygon key (NEXT_PUBLIC_LIVE=1)", "配置实时 Polygon 密钥后启用实时行情 (NEXT_PUBLIC_LIVE=1)"],
  movers: ["Movers", "异动"],
  dashboard: ["Dashboard", "仪表盘"],
  backToDashboard: ["Back to the Macro Dashboard", "返回宏观仪表盘"],
  remove: ["Remove", "移除"],
  // watchlist
  defaultList: ["Default", "默认"],
  addSymbol: ["Add symbol", "添加代码"],
  tableViewLabel: ["Table view", "表格视图"],
  columns: ["Columns", "列"],
  colLast: ["Last", "最新"],
  colChange: ["Change", "涨跌"],
  colChangePct: ["Change %", "涨跌%"],
  colVolume: ["Volume", "成交量"],
  colChgShort: ["Chg", "涨跌"],
  colChgPctShort: ["Chg%", "涨跌%"],
  colVolShort: ["Vol", "成交"],
  symbolDisplay: ["Symbol display", "代码显示"],
  logo: ["Logo", "图标"],
  dispSymbol: ["Symbol", "代码"],
  dispName: ["Name", "名称"],
  dispBoth: ["Both", "代码+名称"],
  resizeCol: ["Drag to resize column", "拖动调整列宽"],
  inWatchlist: ["In watchlist", "已在自选"],
  addToWatchlist: ["Add to watchlist", "加入自选"],
  // detail board
  symbol: ["Symbol", "代码"],
  last: ["Last", "最新"],
  change: ["Chg%", "涨跌%"],
  recentSignals: ["Recent signals", "近期信号"],
  macroIntel: ["Macro intel", "宏观情报"],
  goldenOracle: ["Golden Oracle · Confluence", "黄金神谕 · 共振"],
  backtestedNote: ["backtested · 6yr daily→3D", "回测 · 6年 日线→3日"],
  winRate: ["Win rate", "胜率"],
  profitFactor: ["Profit factor", "盈亏比"],
  cagr: ["CAGR", "年化收益"],
  askAIabout: ["Ask Mastermind AI about", "向智脑 AI 询问"],
  openFullAnalysis: ["Open full analysis", "打开完整分析"],
  signalHistory: ["Signal history", "信号历史"],
  moreSeasonals: ["More seasonals", "更多季节性"],
  // search
  searchPlaceholder: ["Search symbol or company…", "搜索代码或公司…"],
  noSymbolMatch: ["No supported symbol matches", "没有匹配的代码"],
  // indicators modal
  indicatorsTitle: ["Indicators, metrics & strategies", "指标、度量与策略"],
  library: ["Library", "指标库"],
  alwaysOnProprietary: ["Always on (proprietary)", "始终开启（专有）"],
  catMastermind: ["Mastermind", "智脑"],
  catTrend: ["Trend", "趋势"],
  catMomentum: ["Momentum", "动量"],
  catVolume: ["Volume", "成交量"],
  // copilot
  askAbout: ["Ask about", "询问"],
  analyzing: ["Analyzing", "分析中"],
  copilotUnavailable: ["Copilot unavailable right now.", "AI 助手暂时不可用。"],
  sugWhyVerdict: ["Why is {sym} a {v}?", "为什么 {sym} 是 {v}？"],
  sugMarkSR: ["Mark the key support & resistance on the chart", "在图表上标出关键支撑与阻力"],
  sugBacktest: ["How has this signal backtested?", "这个信号的回测表现如何？"],
  sugFindBuys: ["Find BUY setups in an uptrend regime", "在上升趋势中寻找买入机会"],
  // misc
  uptrendRegime: ["Uptrend regime", "上升趋势"],
  open: ["Open", "开盘"],
  // seasonality
  seasonalityTitle: ["Seasonality · avg monthly return", "季节性 · 月均收益"],
  seasonalityFoot: ["Current month highlighted · hover a bar for its avg return & win rate · from {sym} history (display-only context).", "高亮为当前月份 · 悬停查看月均收益与胜率 · 基于 {sym} 历史（仅供参考）。"],
  noSamples: ["no samples", "无样本"],
  avgShort: ["avg", "均值"],
  winRateShort: ["WR", "胜率"],
  // watchlist management
  watchlists: ["Watchlists", "自选列表"],
  newWatchlist: ["New watchlist", "新建自选列表"],
  newWatchlistPrompt: ["Name your new watchlist", "为新的自选列表命名"],
  renameWatchlist: ["Rename", "重命名"],
  renameWatchlistPrompt: ["Rename watchlist", "重命名自选列表"],
  deleteWatchlist: ["Delete list", "删除列表"],
  deleteWatchlistConfirm: ["Delete this watchlist?", "确定删除这个自选列表？"],
  emptyWatchlist: ["No symbols yet — use + to add.", "暂无标的 —— 点击 + 添加。"],
  // compare
  compareTitle: ["Compare — overlay symbols", "对比 —— 叠加标的"],
  comparePlaceholder: ["Symbol or company to overlay…", "要叠加的代码或公司…"],
  addToCompare: ["Overlay on chart", "叠加到图表"],
  comparing: ["Overlaid", "已叠加"],
  compareHint: ["Add up to 4 symbols to overlay on the active chart.", "最多可叠加 4 个标的到当前图表。"],
  comparingNow: ["On chart", "图表中"],
  // screener
  pageScreener: ["Screener", "选股"],
  matches: ["matches", "个匹配"],
  buyLc: ["buy", "买入"],
  sellLc: ["sell", "卖出"],
  avgWR: ["avg WR", "平均胜率"],
  scanByOracle: ["This scan is powered by the Golden Oracle confluence", "本扫描由黄金神谕共振驱动"],
  anySignal: ["Any signal", "任意信号"],
  equities: ["Equities", "股票"],
  crypto: ["Crypto", "加密货币"],
  scanAsOf: ["Scan as of {d} · Polygon · backtested 6yr→3D", "扫描截至 {d} · Polygon · 回测 6年→3日"],
  signalCol: ["Signal", "信号"],
  regime: ["Regime", "趋势"],
  uptrend: ["Uptrend", "上升"],
  mixed: ["Mixed", "震荡"],
  loadingScan: ["Loading scan…", "正在加载扫描…"],
  scanLoadErr: ["Could not load the scan.", "无法加载扫描。"],
  noFilterMatch: ["No symbols match these filters.", "没有符合筛选条件的标的。"],
  goldenOracleScan: ["Golden Oracle scan", "黄金神谕扫描"],
  scanFootClick: ["{nBuy} BUY · {nSell} SELL · {n} symbols · click a row to open it in the chart", "{nBuy} 买入 · {nSell} 卖出 · {n} 个标的 · 点击行可在图表中打开"],
  // portfolio
  pagePortfolio: ["Portfolio", "投资组合"],
  convictionBook: ["Conviction Book", "信念账本"],
  convictionSub: ["Display-only · paper. Your watchlist ranked by the Golden-Oracle confluence + regime — a suggested tilt, not advice.", "仅供展示 · 模拟。你的自选按黄金神谕共振 + 趋势排序 —— 仅为建议倾向，非投资建议。"],
  names: ["Names", "标的数"],
  bullishSignals: ["Bullish signals", "看多信号"],
  avgWinRate: ["Avg win rate", "平均胜率"],
  avgDayMove: ["Avg day move", "平均日涨跌"],
  positions: ["Positions", "持仓"],
  clickRowOpen: ["click a row to open it in the chart", "点击行可在图表中打开"],
  day: ["Day", "当日"],
  suggestedTilt: ["Suggested tilt", "建议权重"],
  loadingBook: ["Loading book…", "正在加载账本…"],
  noNamesYet: ["No names in your watchlist yet.", "你的自选中暂无标的。"],
  convictionFoot: ["{n} bullish · tilt weighted by backtested win-rate · paper / display-only", "{n} 看多 · 按回测胜率加权 · 模拟 / 仅供展示"],
  // alerts
  pageAlerts: ["Alerts", "提醒"],
  signalRegimeAlerts: ["Signal & regime alerts", "信号与趋势提醒"],
  alertsSub: ["Alert me when MY confluence aligns. Evaluated on each data refresh (historical feed).", "当我的共振条件满足时提醒我。每次数据刷新时评估（历史行情）。"],
  newAlert: ["New alert", "新建提醒"],
  createAlert: ["Create alert", "创建提醒"],
  creating: ["Creating…", "创建中…"],
  activeAlerts: ["Active alerts", "已激活提醒"],
  total: ["total", "条"],
  loadingAlerts: ["Loading alerts…", "正在加载提醒…"],
  noAlertsYet: ["No alerts yet — create one above. Try “Golden Oracle flips to BUY” on NVDA.", "暂无提醒 —— 在上方创建一个。试试对 NVDA 设置“黄金神谕翻转为买入”。"],
  armed: ["Armed", "已启用"],
  paused: ["Paused", "已暂停"],
  alertValue: ["value", "数值"],
  couldNotCreateAlert: ["Could not create alert.", "无法创建提醒。"],
  alertNetErr: ["Network error — could not create alert.", "网络错误 —— 无法创建提醒。"],
  couldNotDeleteAlert: ["Could not delete that alert.", "无法删除该提醒。"],
  condSignalBuy: ["Golden Oracle flips to BUY", "黄金神谕翻转为买入"],
  condSignalSell: ["Golden Oracle flips to SELL", "黄金神谕翻转为卖出"],
  condRegimeUp: ["Regime flips to Uptrend", "趋势翻转为上升"],
  condPriceAbove: ["Price crosses above", "价格上穿"],
  condPriceBelow: ["Price crosses below", "价格下穿"],
  condRsiBelow: ["RSI crosses below", "RSI 下穿"],
  // strategy tester
  netReturn: ["Net return", "净收益"],
  sharpe: ["Sharpe", "夏普"],
  maxDD: ["Max DD", "最大回撤"],
  trades: ["Trades", "交易数"],
  vsBuyHold: ["vs Buy&Hold", "对比买入持有"],
  beats: ["beats", "跑赢"],
  trails: ["trails", "跑输"],
  equityCurve: ["Equity curve", "净值曲线"],
  thEntry: ["Entry", "入场"],
  thExit: ["Exit", "出场"],
  thEntryPx: ["Entry px", "入场价"],
  thExitPx: ["Exit px", "出场价"],
  thReturn: ["Return", "收益"],
  thBars: ["Bars", "持有"],
  thReason: ["Reason", "原因"],
  noStratData: ["No strategy-tester data for {sym}.", "{sym} 暂无策略回测数据。"],
  stratLoadErr: ["Could not load strategy data.", "无法加载策略数据。"],
};

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    const read = () => { const v = document.documentElement.getAttribute("data-lang"); if (v === "zh" || v === "en") setLangState(v); };
    read();
    window.addEventListener("mm:lang", read);
    return () => window.removeEventListener("mm:lang", read);
  }, []);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("mm.lang", l); } catch {}
    document.documentElement.setAttribute("data-lang", l);
    window.dispatchEvent(new CustomEvent("mm:lang"));
  }, []);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

export function useT() {
  const { lang } = useContext(Ctx);
  return useCallback((key: string, fallback?: string) => {
    const e = LEX[key];
    return e ? (lang === "zh" ? e[1] : e[0]) : (fallback ?? key);
  }, [lang]);
}
