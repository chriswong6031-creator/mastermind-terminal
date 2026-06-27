import { createClient } from "@/lib/supabase/server";
import { BrandLockup } from "@/components/BrandMark";
import ChartPanel from "@/components/ChartPanel";

export const dynamic = "force-dynamic";

// demo display metadata (live prices arrive with the market-data feed; DB stores the symbol list)
const SYM: Record<string, { name: string; sec: string; col: string; price: number; chg: number }> = {
  "BTC-USD": { name: "Bitcoin", sec: "Crypto", col: "#f7931a", price: 67727.5, chg: -1.71 },
  "ETH-USD": { name: "Ethereum", sec: "Crypto", col: "#627eea", price: 2041.91, chg: -2.09 },
  NVDA: { name: "NVIDIA Corp", sec: "Equities", col: "#76b900", price: 210.69, chg: 2.95 },
  AAPL: { name: "Apple Inc", sec: "Equities", col: "#a2aaad", price: 247.99, chg: -0.39 },
  MSFT: { name: "Microsoft Corp", sec: "Equities", col: "#3b82f6", price: 381.87, chg: -1.84 },
  QQQ: { name: "Invesco QQQ", sec: "Equities", col: "#4d82ff", price: 582.06, chg: -1.85 },
};
const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export default async function Terminal() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // load or seed the user's first watchlist (idempotent: a unique (user_id,name)
  // index makes a racing duplicate insert a no-op rather than a second list)
  const { data: lists0 } = await supabase.from("watchlists").select("id,name").order("position");
  let lists = lists0;
  if (!lists || lists.length === 0) {
    const { data: wl } = await supabase
      .from("watchlists").insert({ user_id: user!.id, name: "Default", position: 0 })
      .select("id").single();
    if (wl) {
      const seed = [["Crypto", "BTC-USD"], ["Crypto", "ETH-USD"], ["Equities", "NVDA"], ["Equities", "AAPL"], ["Equities", "MSFT"], ["Equities", "QQQ"]];
      await supabase.from("watchlist_symbols").insert(seed.map(([section, symbol], i) => ({ watchlist_id: wl.id, section, symbol, position: i })));
    }
    ({ data: lists } = await supabase.from("watchlists").select("id,name").order("position"));
  }
  const active = lists?.[0];
  if (!active) {
    // first paint right after signup can race the session cookie — render a calm shell
    return <main className="center"><div className="hero"><h1 style={{ fontSize: 20 }}>Setting up your workspace…</h1><p className="tag">One moment — provisioning your default watchlist.</p></div></main>;
  }
  const { data: syms } = await supabase
    .from("watchlist_symbols").select("symbol,section,position").eq("watchlist_id", active.id).order("position");

  const sections: Record<string, { symbol: string; section: string }[]> = {};
  (syms || []).forEach((s: any) => { (sections[s.section] ||= []).push(s); });
  const nv = SYM.NVDA;

  return (
    <div className="app">
      {/* TOP BAR */}
      <header className="topbar">
        <BrandLockup />
        <div className="tdiv" />
        <div className="pair"><span className="dual"><i>N</i><i>$</i></span><b>NVDA</b>
          <svg className="car" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></div>
        <div className="stats">
          <div className="stat"><span className="l">Last Price</span><span className="v big num">{fmt(nv.price)}</span></div>
          <div className="stat"><span className="l">24h Change</span><span className="v num up">+{fmt(nv.chg)}%</span></div>
          <div className="stat"><span className="l">24h Volume</span><span className="v num">$11.4B</span></div>
          <div className="stat"><span className="l">24h High</span><span className="v num">211.39</span></div>
          <div className="stat"><span className="l">24h Low</span><span className="v num">204.65</span></div>
        </div>
        <div className="spacer" />
        <button className="ai"><svg viewBox="0 0 24 24"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg>Mastermind AI</button>
        <form action="/auth/signout" method="post">
          <button className="avatar" title={`${user?.email} · sign out`}>{(user?.email || "U")[0].toUpperCase()}</button>
        </form>
      </header>

      {/* APP NAV */}
      <nav className="appnav">
        <button className="navbtn on"><svg viewBox="0 0 24 24"><path d="M3 17l5-6 4 3 4-7 5 9" /><path d="M3 21h18" /></svg><span>Chart</span></button>
        <button className="navbtn"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" /></svg><span>Markets</span></button>
        <button className="navbtn"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg><span>Screener</span></button>
        <button className="navbtn"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9v9z" /></svg><span>Portfolio</span></button>
        <button className="navbtn"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg><span>Alerts</span></button>
        <div className="gap" />
        <button className="navbtn"><svg viewBox="0 0 24 24"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg><span>AI</span></button>
      </nav>

      {/* WORKSPACE */}
      <section className="workspace">
        <div className="chart-tabs">
          <div className="ct on">Price chart</div><div className="ct">Depth</div><div className="ct">Market info</div>
          <div className="tools">
            <div className="seg"><button>1H</button><button className="on">D</button><button className="on" style={{ color: "var(--brand-2)" }}>3D</button><button>W</button></div>
            <button className="tbtn"><svg viewBox="0 0 24 24" style={{ strokeWidth: 2 }}><path d="M5 12h14M12 5v14" /></svg>Indicators</button>
          </div>
        </div>
        <div className="chart-body">
          <div className="tooldock">
            {["M12 2v20M2 12h20", "M4 20L20 4", "M3 12h18", "M3 5h18M3 9h18M3 15h18M3 19h18", "M5 5h14M12 5v14"].map((d, i) => (
              <button key={i} className={i === 0 ? "on" : ""}><svg viewBox="0 0 24 24"><path d={d} /></svg></button>
            ))}
          </div>
          <ChartPanel />
        </div>
      </section>

      {/* RIGHT RAIL */}
      <aside className="rail">
        <div className="rail-tabs"><div className="t on">Watchlist</div><div className="t">Details</div><div className="t">Signals</div></div>
        <div className="rail-body">
          <div className="board wl-board">
            <div className="wl-bar">
              <button className="wl-select">{active.name} <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></button>
              <div className="wl-acts">
                <button title="Add symbol"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></button>
                <button title="Settings"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></button>
              </div>
            </div>
            <div className="wl-cols"><span>Symbol</span><span>Last</span><span>Chg%</span></div>
            <div className="wl-list">
              {Object.entries(sections).map(([sec, rows]) => (
                <div key={sec}>
                  <div className="wl-sec">{sec}</div>
                  {rows.map((r) => { const m = SYM[r.symbol] || { name: r.symbol, col: "#888", price: 0, chg: 0 }; const u = m.chg >= 0;
                    return (
                      <div key={r.symbol} className={`wl-row${r.symbol === "NVDA" ? " on" : ""}`}>
                        <div className="s"><span className="ic" style={{ background: m.col }}>{r.symbol[0]}</span>
                          <span className="nm"><span className="tk">{r.symbol}</span><span className="sub">{m.name}</span></span></div>
                        <span className="c num">{fmt(m.price, m.price < 10 ? 4 : 2)}</span>
                        <span className={`c num ${u ? "up" : "down"}`}>{u ? "+" : ""}{fmt(m.chg)}%</span>
                      </div>
                    ); })}
                </div>
              ))}
            </div>
          </div>

          <div className="board detail-board">
            <div className="card">
              <div className="hd"><span className="ic">N</span><div><div className="nm">NVIDIA Corp</div><div className="ex">Semiconductors · NASDAQ</div></div>
                <div className="px"><b className="num">{fmt(nv.price)}</b><div className="cg num up">+6.04 (+2.95%)</div></div></div>
              <div className="regime"><i />Uptrend regime · above 200-EMA</div>
              <div className="kv"><span className="k">Open</span><span className="v">204.65</span></div>
              <div className="kv"><span className="k">Day Range</span><span className="v">204.65 – 211.39</span></div>
              <div className="kv"><span className="k">Market Cap</span><span className="v">$1.21T</span></div>
              <div className="kv"><span className="k">52W High</span><span className="v">236.26 <span className="down">−10.8%</span></span></div>
              <div className="kv"><span className="k">52W Low</span><span className="v">163.85 <span className="up">+28.6%</span></span></div>
              <div className="mmcard">
                <div className="t"><svg viewBox="0 0 24 24"><path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" /></svg>Golden Oracle · Confluence</div>
                <div className="verdict"><b>BUY</b><span className="conf">conviction 0.82 · 2 bars ago</span></div>
                <div className="s2"><div>Win rate<b>64%</b></div><div>Profit factor<b>7.02</b></div><div>CAGR<b>24.9%</b></div></div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* TICKER */}
      <div className="ticker">
        <span className="lbl">Movers</span>
        {[["NVDA", 210.69, 2.95], ["AMD", 162.3, 3.2], ["TSLA", 242.8, -2.4], ["BTC", 67727, -1.71], ["MSTR", 1620, 4.8], ["COIN", 221.5, -1.1], ["ARM", 138.2, 2.9], ["PLTR", 62.4, 1.4]].map(([s, p, ch]: any) => {
          const u = ch >= 0; return (
            <span key={s} className="tk"><span className="s">{s}</span><span className="p num">{fmt(p, p < 10 ? 3 : 2)}</span><span className={`c num ${u ? "up" : "down"}`}>{u ? "+" : ""}{fmt(ch)}%</span></span>
          );
        })}
      </div>
    </div>
  );
}
