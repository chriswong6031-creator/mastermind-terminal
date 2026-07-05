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
  // rail
  symbol: ["Symbol", "代码"],
  last: ["Last", "最新"],
  change: ["Chg%", "涨跌%"],
  recentSignals: ["Recent signals", "近期信号"],
  macroIntel: ["Macro intel", "宏观情报"],
  // copilot
  askAbout: ["Ask about", "询问"],
  // misc
  uptrendRegime: ["Uptrend regime", "上升趋势"],
  open: ["Open", "开盘"],
  dayRange: ["Day Range", "当日区间"],
  volume: ["Volume", "成交量"],
  // flow desk / options hub
  flow: ["Options", "期权"],
  asOf: ["as of", "更新于"],
  loadingHeat: ["Loading group data…", "加载分组数据中…"],
  minPrem: ["Min prem", "最低保费"],
  anyPrem: ["Any", "不限"],
  dte: ["DTE", "到期天"],
  mny: ["Mny", "价性"],
  colTime: ["Time", "时间"],
  colTicker: ["Ticker", "代码"],
  colSide: ["Side", "方向"],
  colCP: ["C/P", "认沽购"],
  colContract: ["Contract", "合约"],
  colDte: ["DTE", "到期"],
  colMny: ["Mny", "价性"],
  colSize: ["Size", "数量"],
  colPrem: ["Prem", "保费"],
  colFlags: ["Flags", "标记"],
  colSector: ["Sector", "板块"],
  // Options Hub tabs
  tabTape: ["Tape", "逐笔"],
  tabTide: ["Tide", "资金潮"],
  tabTickers: ["Tickers", "个股"],
  tabScreener: ["Screener", "筛选"],
  tabVol: ["Vol", "波动率"],
  tabGex: ["GEX", "敞口"],
  // Tide tab
  tideTitle: ["Market Tide", "市场资金潮"],
  tideMethodNote: ["Method note", "方法说明"],
  tideNcpLabel: ["Net Call Prem (~cumulative)", "净认购保费（~累计）"],
  tideNppLabel: ["Net Put Prem (~cumulative)", "净认沽保费（~累计）"],
  tideSpyLabel: ["SPY", "SPY"],
  tideSectorTitle: ["Sector Tide", "板块资金潮"],
  tideImpactTitle: ["Top Net Impact", "最大净影响"],
  tideDteTitle: ["DTE Buckets", "到期分组"],
  tideMethodText: [
    "NCP / NPP show the running intraday cumulative net call / net put premium. Direction is ~-soft (heuristic tape-signing, multi-session calibration pending). SPY overlay uses option tape underlying refs. All figures are display-only and not investment advice.",
    "NCP / NPP 显示当日盘中累计净认购/净认沽保费。方向为~软性标注（启发式签约，多会话校准待完成）。SPY叠加层使用期权行情底层参考价。所有数据仅供展示，不构成投资建议。",
  ],
  // Tickers tab
  tickersTitle: ["Ticker Drill", "个股详情"],
  tickersSearch: ["Search ticker…", "搜索代码…"],
  tickersSelectPrompt: ["Select a ticker from the list or search above", "从列表选择或搜索代码"],
  tickersDayGross: ["Day Gross", "当日总保费"],
  tickersNetSoft: ["Net (~soft)", "净值（~软性）"],
  tickersCallShare: ["Call Share", "认购占比"],
  tickersPremZ: ["Prem z-score", "保费z值"],
  tickersBaselineWarm: ["baseline warming", "基线积累中"],
  tickersMinChart: ["Minute Net Prem", "分钟净保费"],
  tickersStrikeLadder: ["Strike Ladder", "行权价梯度"],
  tickersExpBars: ["By Expiry", "按到期日"],
  tickersTopContracts: ["Top Contracts", "主力合约"],
  tickersVolGtOi: ["vol > OI", "量超持仓"],
  // Screener tab
  screenerTitle: ["Screener", "筛选器"],
  screenerComingSoon: ["Screener coming in next build (H2 analytics)", "筛选器将在下一版本推出（H2分析）"],
  // Vol tab
  volTitle: ["Volatility", "波动率"],
  volComingSoon: ["Volatility analytics coming in next build (H2)", "波动率分析将在下一版本推出（H2）"],
  // GEX tab
  gexTitle: ["Dealer Exposure", "庄家敞口"],
  gexComingSoon: ["GEX analytics coming in next build (H2)", "敞口分析将在下一版本推出（H2）"],
  // Presets dropdown
  presets: ["Presets", "预设视图"],
  presetLargeBuys: ["Large ~buys", "大额~买入"],
  presetRepeat: ["Repeat hits", "重复命中"],
  preset0DTE: ["0DTE", "当日到期"],
  presetPutsOnStrength: ["Puts on strength", "强势认沽"],
  // Flags
  flagSwept: ["swept (heuristic)", "扫单（启发式）"],
  // Coverage
  coverageExpanding: ["Coverage expanding", "覆盖扩展中"],
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
