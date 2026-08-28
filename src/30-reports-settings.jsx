/* ============================ Báo cáo ============================ */

function Reports({ month, setMonth, flash }) {
  const [rep, setRep] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setRep(null);
    api(`/analytics?month=${month}&months=12`).then(setRep).catch((e) => setErr(e.message));
  }, [month]);

  if (err) return <div className="pad" style={{ paddingTop: 30, color: cssVar("--red"), fontSize: 14 }}>{err}</div>;
  if (!rep) return <div className="pad" style={{ paddingTop: 40, textAlign: "center", color: cssVar("--muted"), fontSize: 14 }}>Đang tính…</div>;

  const maxTrend = Math.max(...rep.trend.map((t) => t.total), 1);
  const maxCat = Math.max(...rep.byCategory.map((c) => c.total), 1);
  const maxWd = Math.max(...rep.byWeekday.map((w) => w.total), 1);
  const totalType = rep.byType.reduce((s, t) => s + t.total, 0);
  const avgPerDay = rep.totals.n ? rep.totals.total / new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() : 0;

  return (
    <div className="pad" style={{ paddingTop: 22 }}>
      <section style={{ marginBottom: 26 }}>
        <div className="num label">Tổng chi {MONTH_VN(month).toLowerCase()}</div>
        <div className="num" style={{ fontSize: 30, fontWeight: 700, marginTop: 4 }}>{money(rep.totals.total)}</div>
        <div className="num" style={{ fontSize: 12, color: cssVar("--muted"), marginTop: 3 }}>
          {rep.totals.n} giao dịch · trung bình {short(avgPerDay)}/ngày
        </div>
      </section>

      <section style={{ marginBottom: 30 }}>
        <SectionLabel>12 tháng gần nhất</SectionLabel>
        <div className="row" style={{ alignItems: "flex-end", gap: 4, height: 110, marginTop: 14 }}>
          {rep.trend.map((t) => (
            <button key={t.month} onClick={() => setMonth(t.month)} title={`${t.month} — ${money(t.total)}`}
              style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
              <div style={{
                height: Math.max((t.total / maxTrend) * 84, t.total > 0 ? 3 : 1),
                background: t.month === month ? cssVar("--ink") : cssVar("--track"),
                borderRadius: "2px 2px 0 0",
              }} />
              <div className="num" style={{ fontSize: 9, marginTop: 5, color: t.month === month ? cssVar("--ink") : cssVar("--muted") }}>
                {Number(t.month.slice(5, 7))}
              </div>
            </button>
          ))}
        </div>
      </section>

      {rep.byCategory.length > 0 && (
        <section style={{ marginBottom: 30 }}>
          <SectionLabel>Theo danh mục</SectionLabel>
          <div style={{ marginTop: 12 }}>
            {rep.byCategory.map((c) => (
              <div key={c.category_id} style={{ marginBottom: 12 }}>
                <div className="between" style={{ alignItems: "baseline", marginBottom: 6 }}>
                  <span style={{ fontSize: 14 }}>
                    <span style={{ marginRight: 8 }}>{c.icon}</span>{c.name}
                    <span className="num" style={{ fontSize: 11, color: cssVar("--muted"), marginLeft: 6 }}>×{c.n}</span>
                  </span>
                  <span className="num" style={{ fontSize: 13, fontWeight: 500 }}>
                    {money(c.total)}
                    <span style={{ color: cssVar("--muted"), fontWeight: 400 }}>
                      {" "}{Math.round((c.total / rep.totals.total) * 100)}%
                    </span>
                  </span>
                </div>
                <Bar value={c.total} max={maxCat} color={c.color} />
              </div>
            ))}
          </div>
        </section>
      )}

      {totalType > 0 && (
        <section style={{ marginBottom: 30 }}>
          <SectionLabel>Cá nhân và công ty</SectionLabel>
          <div style={{ marginTop: 12 }}>
            {TYPES.map((t) => {
              const row = rep.byType.find((x) => x.type === t.id);
              if (!row) return null;
              return (
                <div key={t.id} className="between" style={{ padding: "8px 0", fontSize: 14 }}>
                  <span className="row" style={{ gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: cssVar(t.varname) }} />
                    {t.label}
                  </span>
                  <span className="num" style={{ fontWeight: 500 }}>
                    {money(row.total)}
                    <span style={{ color: cssVar("--muted"), fontWeight: 400 }}>
                      {" "}{Math.round((row.total / totalType) * 100)}%
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {rep.byMethod.length > 0 && (
        <section style={{ marginBottom: 30 }}>
          <SectionLabel>Theo phương thức</SectionLabel>
          <div style={{ marginTop: 12 }}>
            {rep.byMethod.map((m) => (
              <div key={m.method} className="between" style={{ padding: "7px 0", fontSize: 14 }}>
                <span>{methodLabel(m.method)}</span>
                <span className="num" style={{ fontWeight: 500 }}>{money(m.total)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {rep.byWeekday.length > 0 && (
        <section style={{ marginBottom: 30 }}>
          <SectionLabel>Theo thứ trong tuần</SectionLabel>
          <div className="row" style={{ alignItems: "flex-end", gap: 8, height: 82, marginTop: 14 }}>
            {Array.from({ length: 7 }, (_, i) => {
              const row = rep.byWeekday.find((w) => w.wd === i) || { total: 0 };
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                  <div style={{
                    height: Math.max((row.total / maxWd) * 58, row.total > 0 ? 3 : 1),
                    background: cssVar("--track"), borderRadius: "3px 3px 0 0",
                  }} />
                  <div className="num" style={{ fontSize: 10, marginTop: 5, color: cssVar("--muted"), textAlign: "center" }}>
                    {DAY_NAMES[i]}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {rep.top.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <SectionLabel>5 khoản lớn nhất</SectionLabel>
          <div style={{ marginTop: 10 }}>
            {rep.top.map((t) => (
              <div key={t.id} className="tape between" style={{ padding: "11px 0" }}>
                <span className="truncate" style={{ fontSize: 14, minWidth: 0 }}>{t.note || "Khoản chi"}</span>
                <span className="row" style={{ gap: 10 }}>
                  <span className="num" style={{ fontSize: 11, color: cssVar("--muted") }}>{t.date}</span>
                  <span className="num" style={{ fontSize: 14, fontWeight: 500 }}>{short(t.amount)}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ============================ Cài đặt ============================ */

function Settings({ data, reload, flash, theme, setTheme, onLogout, lockCfg, onOpenLock }) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const setBudget = async (c, value) => {
    try {
      await api("/categories/" + c.id, {
        method: "PUT",
        body: { name: c.name, icon: c.icon, color: c.color, budget: Number(value) || 0, subs: c.subs },
      });
      reload();
    } catch (e) {
      flash(e.message);
    }
  };

  const addCat = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api("/categories", { method: "POST", body: { name, icon: "📌", color: "#6B7280" } });
      setNewName("");
      reload();
      flash("Đã thêm danh mục");
    } catch (e) {
      flash(e.message);
    }
    setBusy(false);
  };

  const download = async (path, filename) => {
    try {
      const res = await api(path, { raw: true });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      flash("Không tải được: " + e.message);
    }
  };

  const importLocal = async () => {
    let raw;
    try {
      raw = JSON.parse(localStorage.getItem("sochi:v1") || "null");
    } catch {
      raw = null;
    }
    if (!raw || !Array.isArray(raw.txs) || !raw.txs.length) {
      return flash("Không tìm thấy dữ liệu bản GĐ1 trên thiết bị này");
    }
    const catNames = Object.fromEntries((raw.cats || []).map((c) => [c.id, c.name]));
    const payload = raw.txs.map((t) => ({
      amount: t.amount, category_name: catNames[t.categoryId] || "Khác",
      sub: t.sub, type: t.type, method: t.method, note: t.note, date: t.date,
    }));
    try {
      const r = await api("/import", { method: "POST", body: { transactions: payload } });
      flash(`Đã nhập ${r.imported} khoản${r.skipped ? `, bỏ qua ${r.skipped}` : ""}`);
      reload();
    } catch (e) {
      flash(e.message);
    }
  };

  const totalBudget = data.categories.reduce((s, c) => s + (c.budget || 0), 0);

  return (
    <div className="pad" style={{ paddingTop: 22 }}>
      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Giao diện</SectionLabel>
        <div style={{ marginTop: 12 }}>
          <Chips
            options={[{ id: "light", label: "Sáng" }, { id: "dark", label: "Tối" }, { id: "auto", label: "Theo hệ thống" }]}
            value={theme} onChange={setTheme} />
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Khóa màn hình</SectionLabel>
        <button onClick={onOpenLock} className="box between"
          style={{ padding: 14, marginTop: 12, width: "100%", textAlign: "left" }}>
          <div>
            <div style={{ fontSize: 14 }}>
              {lockCfg && lockCfg.co_pin ? "Đang bật" : "Chưa đặt mã PIN"}
            </div>
            <div style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 3 }}>
              {lockCfg && lockCfg.co_pin
                ? (lockCfg.phut_cho
                    ? `Khóa sau ${lockCfg.phut_cho} phút không dùng` + (lockCfg.khoa_khi_an ? ", và khi thoát ra" : "")
                    : (lockCfg.khoa_khi_an ? "Chỉ khóa khi thoát ra" : "Không tự khóa"))
                : "Che số dư khi bạn rời máy"}
            </div>
          </div>
          <span style={{ color: cssVar("--muted") }}>›</span>
        </button>
      </section>

      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Danh mục và ngân sách</SectionLabel>
        {totalBudget > 0 && (
          <div className="num" style={{ fontSize: 12, color: cssVar("--muted"), marginTop: 8 }}>
            Tổng ngân sách tháng: {money(totalBudget)}
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          {data.categories.map((c) => (
            <div key={c.id} className="tape row" style={{ gap: 12, padding: "12px 0" }}>
              <span style={{ fontSize: 18, width: 24 }}>{c.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="truncate" style={{ display: "block", fontSize: 14 }}>{c.name}</span>
                {c.subs.length > 0 && (
                  <span className="truncate" style={{ display: "block", fontSize: 11, color: cssVar("--muted") }}>
                    {c.subs.join(" · ")}
                  </span>
                )}
              </span>
              <input className="field num" type="number" inputMode="numeric" placeholder="ngân sách"
                defaultValue={c.budget || ""} style={{ width: 116, textAlign: "right", padding: "6px 8px" }}
                onBlur={(e) => Number(e.target.value || 0) !== c.budget && setBudget(c, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <input className="field" value={newName} placeholder="Tên danh mục mới"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCat()} />
          <Button onClick={addCat} disabled={busy || !newName.trim()}
            style={{ borderRadius: 8, padding: "10px 18px", fontSize: 14 }}>Thêm</Button>
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Dữ liệu</SectionLabel>
        <div className="wrap" style={{ marginTop: 12 }}>
          <Button kind="outline" onClick={() => download("/export.csv", `so-chi-${todayISO()}.csv`)}>Xuất CSV</Button>
          <Button kind="outline" onClick={() => download("/export.json", `so-chi-${todayISO()}.json`)}>Sao lưu JSON</Button>
          <Button kind="outline" onClick={importLocal}>Nhập từ bản GĐ1</Button>
        </div>
        <p style={{ fontSize: 12, color: cssVar("--muted"), marginTop: 12, lineHeight: 1.6 }}>
          Dữ liệu nằm trong SQLite trên máy chủ riêng của bạn, đồng bộ giữa các thiết bị.
          "Nhập từ bản GĐ1" đọc dữ liệu cũ còn lưu trong trình duyệt của chính thiết bị này.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Đọc hóa đơn</SectionLabel>
        <p style={{ fontSize: 13, color: cssVar("--muted"), marginTop: 10, lineHeight: 1.6 }}>
          {data.ocr_enabled
            ? "Đang bật. Nút 📷 Quét hóa đơn nằm trong màn hình thêm khoản chi."
            : "Đang tắt. Thêm GEMINI_API_KEY vào file .env trên máy chủ rồi khởi động lại dịch vụ để bật."}
        </p>
      </section>

      <section style={{ paddingTop: 20, borderTop: `1px solid ${cssVar("--line")}` }}>
        <div className="between">
          <span style={{ fontSize: 14 }}>
            Đang đăng nhập: <b>{data.user.username}</b>
          </span>
          <Button kind="danger" onClick={onLogout}>Đăng xuất</Button>
        </div>
      </section>

      <section style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${cssVar("--line")}` }}>
        <div className="num label" style={{ color: cssVar("--red") }}>Vùng nguy hiểm</div>
        <ResetData flash={flash} reload={reload} />
      </section>
    </div>
  );
}

/* ============================ App ============================ */

const TABS = [
  { id: "home", label: "Tổng quan" },
  { id: "bills", label: "Hóa đơn" },
  { id: "cards", label: "Thẻ" },
  { id: "invest", label: "Đầu tư" },
  { id: "reports", label: "Báo cáo" },
  { id: "assistant", label: "Trợ lý" },
];
const ALL_SCREENS = [...TABS, { id: "settings", label: "Cài đặt" }];

function App() {
  const [phase, setPhase] = useState("loading"); // loading | login | ready
  const [needsSetup, setNeedsSetup] = useState(false);
  const [data, setData] = useState(null);
  const [txs, setTxs] = useState([]);
  const [tab, setTab] = useState("home");
  const [month, setMonth] = useState(monthOf(todayISO()));
  const [entry, setEntry] = useState(null); // {initial} | {prefill} | null
  const [toast, setToast] = useState("");
  const [theme, setThemeState] = useState(localStorage.getItem("sochi:theme") || "auto");
  const [showLock, setShowLock] = useState(false);
  const { cfg: lockCfg, locked, unlock, reloadLock } = useScreenLock(phase === "ready");

  const flash = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }, []);

  /* --- giao diện sáng/tối --- */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "auto" && mq.matches);
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", dark ? "#10131A" : "#FAFAF7");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = (t) => {
    setThemeState(t);
    localStorage.setItem("sochi:theme", t);
  };

  /* --- nạp dữ liệu --- */
  const loadAll = useCallback(async () => {
    const [boot, tx] = await Promise.all([
      api("/bootstrap"),
      api("/transactions?limit=2000"),
    ]);
    setData(boot);
    setTxs(tx.transactions);
    setPhase("ready");
  }, []);

  const reload = useCallback(() => {
    loadAll().catch((e) => flash(e.message));
  }, [loadAll, flash]);

  useEffect(() => {
    const onLogout = () => {
      setPhase("login");
      setData(null);
      setTxs([]);
    };
    window.addEventListener("sochi:logout", onLogout);
    return () => window.removeEventListener("sochi:logout", onLogout);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const st = await api("/status");
        setNeedsSetup(st.needs_setup);
        if (st.needs_setup || !localStorage.getItem("sochi:token")) return setPhase("login");
        await loadAll();
      } catch (e) {
        setPhase("login");
      }
    })();
  }, [loadAll]);

  const logout = () => {
    setToken("");
    setPhase("login");
    setData(null);
    setTxs([]);
  };

  const onSaved = (tx, wasEdit) => {
    setTxs((prev) => (wasEdit ? prev.map((t) => (t.id === tx.id ? tx : t)) : [tx, ...prev]));
    setMonth(monthOf(tx.date));
    setEntry(null);
    setTab("home");
    flash(wasEdit ? "Đã cập nhật" : "Đã lưu khoản chi");
    api("/bootstrap").then(setData).catch(() => {});
  };

  const onDeleted = (id) => {
    setTxs((prev) => prev.filter((t) => t.id !== id));
    setEntry(null);
    flash("Đã xóa");
    api("/bootstrap").then(setData).catch(() => {});
  };

  const payBillQuick = async (b) => {
    try {
      await api(`/bills/${b.id}/pay`, { method: "POST", body: { amount: b.amount } });
      flash(`Đã ghi nhận thanh toán ${b.name}`);
      reload();
    } catch (e) {
      flash(e.message);
    }
  };

  if (phase === "loading") return <div id="boot">Đang mở sổ…</div>;
  if (phase === "login") {
    return <Login needsSetup={needsSetup} onDone={() => { setPhase("loading"); loadAll().catch(() => setPhase("login")); }} />;
  }

  const showMonthNav = tab === "home" || tab === "reports";

  // Man khoa che truoc toan bo phan con lai. Dat o day chu khong long ben
  // trong: neu ve chong len noi dung thi chi can mot loi CSS la so du lo ra.
  if (locked) return <LockScreen onUnlock={unlock} />;

  return (
    <div>
      <div className="shell">
        <header className="between" style={{ padding: "22px 20px 14px", borderBottom: `1px solid ${cssVar("--line")}` }}>
          <div>
            <div className="num label">Sổ chi</div>
            {showMonthNav ? (
              <div className="row" style={{ gap: 8, marginTop: 4 }}>
                <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Tháng trước"
                  style={{ padding: "0 8px", color: cssVar("--muted"), fontSize: 20, lineHeight: 1 }}>‹</button>
                <span style={{ fontSize: 19, fontWeight: 600 }}>{MONTH_VN(month)}</span>
                <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Tháng sau"
                  style={{ padding: "0 8px", color: cssVar("--muted"), fontSize: 20, lineHeight: 1 }}>›</button>
              </div>
            ) : (
              <div style={{ fontSize: 19, fontWeight: 600, marginTop: 4 }}>
                {(ALL_SCREENS.find((t) => t.id === tab) || {}).label}
              </div>
            )}
          </div>
          <div className="row" style={{ gap: 10 }}>
            {tab === "home" && (
              <Button onClick={() => setEntry({})} style={{ padding: "9px 18px", fontSize: 14 }}>+ Thêm</Button>
            )}
            <button onClick={() => setTab(tab === "settings" ? "home" : "settings")}
              aria-label="Cài đặt" title="Cài đặt"
              style={{ fontSize: 20, lineHeight: 1, padding: "4px 2px",
                color: tab === "settings" ? cssVar("--ink") : cssVar("--muted") }}>
              {tab === "settings" ? "×" : "⚙"}
            </button>
          </div>
        </header>

        {tab === "home" && (
          <Home data={data} month={month} setMonth={setMonth} txs={txs}
            onEdit={(t) => setEntry({ initial: t })} onAdd={() => setEntry({})}
            onPayBill={payBillQuick} goTab={setTab} />
        )}
        {tab === "bills" && <Bills data={data} reload={reload} flash={flash} />}
        {tab === "cards" && <Cards data={data} reload={reload} flash={flash} />}
        {tab === "invest" && <Invest flash={flash} />}
        {tab === "reports" && <Reports month={month} setMonth={setMonth} flash={flash} />}
        {tab === "assistant" && <Assistant data={data} month={month} flash={flash} />}
        {tab === "settings" && (
          <Settings data={data} reload={reload} flash={flash}
            lockCfg={lockCfg} onOpenLock={() => setShowLock(true)}
            theme={theme} setTheme={setTheme} onLogout={logout} />
        )}
      </div>

      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, background: cssVar("--card"),
        borderTop: `1px solid ${cssVar("--line")}`, paddingBottom: "env(safe-area-inset-bottom)", zIndex: 40,
      }}>
        <div className="row" style={{ maxWidth: 620, margin: "0 auto" }}>
          {TABS.map((n) => {
            const on = tab === n.id;
            return (
              <button key={n.id} onClick={() => setTab(n.id)}
                style={{
                  flex: 1, padding: "14px 2px", fontSize: 11, fontWeight: on ? 600 : 400, whiteSpace: "nowrap",
                  color: on ? cssVar("--ink") : cssVar("--muted"),
                  borderTop: `2px solid ${on ? cssVar("--ink") : "transparent"}`, marginTop: -1,
                }}>
                {n.label}
              </button>
            );
          })}
        </div>
      </nav>

      {entry && (
        <Entry data={data} initial={entry.initial} prefill={entry.prefill} flash={flash}
          onSaved={onSaved} onDeleted={onDeleted} onClose={() => setEntry(null)} />
      )}

      {showLock && (
        <LockSettings cfg={lockCfg} flash={flash} onClose={() => setShowLock(false)}
          onSaved={reloadLock} />
      )}
      <Toast msg={toast} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);


/* ============================ Xóa sạch dữ liệu ============================ */

const RESET_SCOPES = [
  { id: "all", label: "Toàn bộ", desc: "Chi tiêu, hóa đơn, thẻ, sổ chứng khoán, danh mục. Danh mục quay về mặc định." },
  { id: "spending", label: "Chỉ chi tiêu", desc: "Khoản chi, hóa đơn, thẻ tín dụng. Giữ nguyên sổ chứng khoán." },
  { id: "stock", label: "Chỉ chứng khoán", desc: "Sổ giao dịch chứng khoán. Giữ nguyên phần chi tiêu." },
];

function ResetData({ flash, reload }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("all");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [backedUp, setBackedUp] = useState(false);
  const [err, setErr] = useState("");

  const spec = RESET_SCOPES.find((r) => r.id === scope);

  const backup = async () => {
    try {
      const res = await api("/export.json", { raw: true });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `so-chi-sao-luu-${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackedUp(true);
      flash("Đã tải file sao lưu về máy");
    } catch (e) {
      flash("Không tải được sao lưu: " + e.message);
    }
  };

  const wipe = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api("/reset", { method: "POST", body: { password, scope } });
      const n = Object.values(r.deleted).reduce((a, b) => a + b, 0);
      flash(`Đã xóa ${n} bản ghi`);
      setOpen(false);
      setPassword("");
      setBackedUp(false);
      reload();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div style={{ marginTop: 12 }}>
        <button onClick={() => setOpen(true)}
          style={{ fontSize: 14, fontWeight: 500, color: cssVar("--red"),
            border: `1px solid ${cssVar("--red")}`, borderRadius: 99, padding: "10px 18px" }}>
          Xóa sạch dữ liệu
        </button>
        <p style={{ fontSize: 12, color: cssVar("--muted"), marginTop: 10, lineHeight: 1.6 }}>
          Đưa app về trạng thái mới hoàn toàn. Tài khoản đăng nhập vẫn giữ nguyên.
        </p>
      </div>
    );
  }

  return (
    <div className="box" style={{ padding: 16, marginTop: 12, borderColor: cssVar("--red") }}>
      <Field label="Xóa phần nào">
        <Chips options={RESET_SCOPES.map((r) => ({ id: r.id, label: r.label }))}
          value={scope} onChange={(v) => { setScope(v); setBackedUp(false); }} />
        <p style={{ fontSize: 12, color: cssVar("--muted"), marginTop: 10, lineHeight: 1.6 }}>
          {spec.desc}
        </p>
      </Field>

      <div style={{ marginBottom: 18 }}>
        <div className="between" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: cssVar("--muted") }}>Bước 1 — sao lưu</span>
          {backedUp && <span style={{ fontSize: 12, color: cssVar("--green") }}>đã tải về</span>}
        </div>
        <Button kind="outline" onClick={backup} style={{ width: "100%" }}>
          {backedUp ? "Tải lại file sao lưu" : "Tải file sao lưu về máy"}
        </Button>
        <p style={{ fontSize: 12, color: cssVar("--muted"), marginTop: 8, lineHeight: 1.6 }}>
          Xóa xong là không khôi phục được. Nên tải file này trước, phòng khi bấm nhầm.
        </p>
      </div>

      <Field label="Bước 2 — nhập mật khẩu đăng nhập để xác nhận">
        <input className="field" type="password" value={password} autoComplete="current-password"
          placeholder="mật khẩu của bạn"
          onChange={(e) => { setPassword(e.target.value); setErr(""); }}
          onKeyDown={(e) => e.key === "Enter" && password && wipe()} />
      </Field>

      {err && <div style={{ fontSize: 13, color: cssVar("--red"), marginBottom: 14 }}>{err}</div>}

      <div className="row" style={{ gap: 12 }}>
        <Button kind="ghost" onClick={() => { setOpen(false); setPassword(""); setErr(""); }}>
          Hủy
        </Button>
        <button onClick={wipe} disabled={busy || !password}
          style={{ flex: 1, padding: "12px 0", borderRadius: 99, fontSize: 15, fontWeight: 600,
            color: "#fff", background: busy || !password ? cssVar("--track") : cssVar("--red"),
            cursor: busy || !password ? "not-allowed" : "pointer" }}>
          {busy ? "Đang xóa…" : `Xóa ${spec.label.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}
