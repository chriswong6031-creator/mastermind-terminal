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
  // flow desk
  flow: ["Flow", "资金流"],
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
