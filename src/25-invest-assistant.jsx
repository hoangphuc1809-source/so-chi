/* ============================ Đầu tư ============================ */

const TRADE_TYPES = [
  { id: "BUY", label: "Mua", needs: ["symbol", "qty", "priceVND"] },
  { id: "SELL", label: "Bán", needs: ["symbol", "qty", "priceVND"] },
  { id: "DEPOSIT", label: "Nạp tiền", needs: ["cash"] },
  { id: "WITHDRAW", label: "Rút tiền", needs: ["cash"] },
  { id: "DIVIDEND_CASH", label: "Cổ tức tiền", needs: ["cash"] },
  { id: "INTEREST", label: "Lãi/phí margin", needs: ["cash"] },
  { id: "STOCK_BONUS", label: "CP thưởng", needs: ["symbol", "qty"] },
  { id: "ADJUSTMENT", label: "Điều chỉnh", needs: ["cash"] },
  { id: "INIT_CASH", label: "Khởi tạo", needs: ["cash"] },
];

function Invest({ flash }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [trade, setTrade] = useState(null);
  const [hist, setHist] = useState(null);
  const [showHist, setShowHist] = useState(false);
  const [showVoided, setShowVoided] = useState(false);
  const [tool, setTool] = useState(null);      // reconcile | batch | report | alerts
  const [flow, setFlow] = useState(null);      // tien T+2

  const load = useCallback(() => {
    setBusy(true);
    api("/portfolio")
      .then((d) => { setData(d); setErr(""); })
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
    api(`/stock/history?limit=200${showVoided ? "&voided=1" : ""}`).then(setHist).catch(() => {});
    api("/stock/cashflow").then(setFlow).catch(() => {});
  }, [showVoided]);

  useEffect(load, [load]);

  // Trong phien thi tu lam moi gia, ngoai phien thi thoi cho do ton pin.
  useEffect(() => {
    if (!data || !data.price_info || !data.price_info.market_open) return;
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [data, load]);

  if (err) return <div className="pad" style={{ paddingTop: 30, color: cssVar("--red"), fontSize: 14 }}>{err}</div>;
  if (busy && !data) return <div className="pad" style={{ paddingTop: 40, textAlign: "center", color: cssVar("--muted"), fontSize: 14 }}>Đang tải…</div>;

  const s = data && data.snapshot;
  if (!s) {
    return (
      <div className="pad">
        <Empty text="Chưa nhận được dữ liệu danh mục." />
        <div className="box" style={{ padding: 16 }}>
          <div className="num label">Cách hoạt động</div>
          <p style={{ fontSize: 13, color: cssVar("--muted"), lineHeight: 1.7, marginTop: 10, marginBottom: 0 }}>
            Sổ giao dịch nằm ngay trong Sổ Chi và được tính lại bằng phương pháp FIFO mỗi lần
            mở. Chưa có gì ở đây nghĩa là sổ còn trống — bấm <b>+ Giao dịch</b> để nhập lệnh
            đầu tiên, hoặc <b>Nhập nhiều</b> nếu muốn dán cả danh mục vào một lần.
          </p>
        </div>
      </div>
    );
  }

  const plColor = (v) => (v == null ? cssVar("--muted") : v > 0 ? cssVar("--green") : v < 0 ? cssVar("--red") : cssVar("--ink"));
  const sign = (v) => (v > 0 ? "+" : "");

  return (
    <div className="pad" style={{ paddingTop: 22 }}>
      {s.degraded && (
        <div className="box" style={{ padding: 12, marginBottom: 18, borderColor: cssVar("--amber") }}>
          <div style={{ fontSize: 13, color: cssVar("--amber") }}>
            Thiếu giá thị trường của {(s.price_missing || []).join(", ") || "một số mã"} nên NAV và lãi/lỗ
            chưa tính được. Giá vốn và số lượng vẫn chính xác.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", marginBottom: 8 }}>
        <Button kind="outline" onClick={() => setTool("report")} style={{ padding: "6px 12px", fontSize: 12 }}>Báo cáo</Button>
        <Button kind="outline" onClick={() => setTool("alerts")} style={{ padding: "6px 12px", fontSize: 12 }}>Mốc giá</Button>
        <Button kind="outline" onClick={() => setTool("reconcile")} style={{ padding: "6px 12px", fontSize: 12 }}>Đối chiếu</Button>
        <Button kind="outline" onClick={() => setTool("batch")} style={{ padding: "6px 12px", fontSize: 12 }}>Nhập nhiều</Button>
        <Button kind="outline" onClick={() => setTrade({})} style={{ padding: "6px 12px", fontSize: 12 }}>+ Giao dịch</Button>
      </div>

      <section style={{ marginBottom: 24 }}>
        <div className="num label">Tổng tài sản ròng</div>
        <div className="num" style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-.02em", marginTop: 3 }}>
          {s.nav != null ? money(s.nav) : "—"}
        </div>
        <div className="num" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 6 }}>
          {s.live_prices ? (
            <span style={{ color: cssVar("--green") }}>
              giá {data.price_info && data.price_info.market_open ? "trực tiếp" : "đóng cửa"}
              {data.price_info && ` lúc ${new Date(data.price_info.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`}
            </span>
          ) : (
            <span style={{ color: cssVar("--amber") }}>
              {data.price_error ? `không lấy được giá: ${data.price_error}` : "đang dùng giá của lần đẩy gần nhất"}
            </span>
          )}
          {"  ·  vị thế "}{data.age_minutes < 1 ? "vừa cập nhật" : `cập nhật ${data.age_minutes} phút trước`}
          {"  ·  "}
          <button onClick={load} style={{ color: cssVar("--blue"), fontSize: 11 }}>tải lại</button>
        </div>
      </section>

      <section className="grid2" style={{ marginBottom: 12 }}>
        <div className="box" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: cssVar("--muted") }}>Lãi/lỗ tạm tính</div>
          <div className="num" style={{ fontSize: 18, fontWeight: 600, marginTop: 3,
            color: plColor(s.unrealized_pl) }}>
            {s.unrealized_pl != null ? `${sign(s.unrealized_pl)}${short(s.unrealized_pl)}` : "—"}
          </div>
          <div className="num" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 2 }}>
            {s.unrealized_pct != null ? `${sign(s.unrealized_pct)}${s.unrealized_pct.toFixed(2)}% · chưa bán` : "chưa có giá"}
          </div>
        </div>
        <div className="box" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: cssVar("--muted") }}>Lãi/lỗ đã chốt</div>
          <div className="num" style={{ fontSize: 18, fontWeight: 600, marginTop: 3,
            color: plColor(s.realized_pl) }}>
            {s.realized_pl ? `${sign(s.realized_pl)}${short(s.realized_pl)}` : "0"}
          </div>
          <div className="num" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 2 }}>
            {hist && hist.realized ? `${hist.realized.length} lần bán` : "đã bán"}
          </div>
        </div>
      </section>

      <section className="grid2" style={{ marginBottom: 24 }}>
        <div className="box" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: cssVar("--muted") }}>Giá trị cổ phiếu</div>
          <div className="num" style={{ fontSize: 18, fontWeight: 600, marginTop: 3 }}>
            {s.stock_value != null ? short(s.stock_value) : "—"}
          </div>
        </div>
        <div className="box" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: cssVar("--muted") }}>
            {s.margin_debt > 0 ? "Dư nợ margin" : "Tiền mặt"}
          </div>
          <div className="num" style={{ fontSize: 18, fontWeight: 600, marginTop: 3,
            color: s.margin_debt > 0 ? cssVar("--red") : cssVar("--ink") }}>
            {short(s.margin_debt > 0 ? s.margin_debt : s.cash)}
          </div>
          {flow && flow.pending_in > 0 && (
            <div className="num" style={{ fontSize: 11, color: cssVar("--amber"), marginTop: 4 }}>
              {short(flow.pending_in)} chưa về
            </div>
          )}
        </div>
      </section>

      {flow && flow.pending_in > 0 && (
        <section className="box" style={{ padding: 14, marginBottom: 20 }}>
          <div className="between">
            <span style={{ fontSize: 13 }}>Tiền bán đang về</span>
            <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>
              dùng được {short(flow.available)}
            </span>
          </div>
          {flow.pending.map((p, i) => (
            <div key={i} className="num" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 6 }}>
              {p.symbol} {nf.format(p.qty)} cp bán {p.sell_date} · về {p.settle_date} · {short(p.amount)}
            </div>
          ))}
          <div style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 8, lineHeight: 1.6 }}>
            Sổ đã ghi nhận số tiền này ngay lúc bán, nhưng phải chờ T+2 mới rút hay mua tiếp được.
          </div>
        </section>
      )}

      {s.margin_debt > 0 && s.stock_value > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div className="between" style={{ alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 13 }}>Tỷ lệ nợ trên tài sản</span>
            <span className="num" style={{ fontSize: 13, fontWeight: 500 }}>
              {((s.margin_debt / s.stock_value) * 100).toFixed(1)}%
            </span>
          </div>
          <Bar value={s.margin_debt} max={s.stock_value} height={5}
            color={s.margin_debt / s.stock_value > 0.5 ? cssVar("--red") : cssVar("--amber")} />
        </section>
      )}

      <SectionLabel>Vị thế đang giữ</SectionLabel>
      <div style={{ marginTop: 12 }}>
        {(s.positions || []).map((p) => (
          <div key={p.symbol} className="tape" style={{ padding: "14px 0" }}>
            <div className="between" style={{ alignItems: "baseline" }}>
              <span className="num" style={{ fontSize: 16, fontWeight: 600, letterSpacing: ".02em" }}>{p.symbol}</span>
              <span className="num" style={{ fontSize: 15, fontWeight: 600, color: plColor(p.pl) }}>
                {p.pl != null ? `${sign(p.pl)}${short(p.pl)}` : "—"}
                {p.pl_pct != null && (
                  <span style={{ fontSize: 12, fontWeight: 400 }}> {sign(p.pl_pct)}{p.pl_pct.toFixed(2)}%</span>
                )}
              </span>
            </div>
            <div className="between num" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 4 }}>
              <span>
                {nf.format(p.qty)} cp · vốn {nf.format(p.avg_cost)} · giá {p.market_price != null ? nf.format(p.market_price) : "—"}
                {p.day_change_pct != null && (
                  <span style={{ color: plColor(p.day_change) }}>
                    {" "}({sign(p.day_change_pct)}{p.day_change_pct.toFixed(2)}% hôm nay)
                  </span>
                )}
              </span>
              <span>{p.weight != null ? `${p.weight.toFixed(1)}%` : ""}</span>
            </div>
            {p.pending_qty > 0 ? (
              <div className="num" style={{ fontSize: 11, marginTop: 4, color: cssVar("--amber") }}>
                bán được {nf.format(p.sellable)} cp · còn {nf.format(p.pending_qty)} cp chờ về
                {p.pending && p.pending[0] ? ` ngày ${p.pending[0].settle_date}` : ""}
              </div>
            ) : (
              <div className="num" style={{ fontSize: 11, marginTop: 4, color: cssVar("--green") }}>
                đã về tài khoản, bán được toàn bộ
              </div>
            )}
            {p.weight != null && (
              <div style={{ marginTop: 7 }}>
                <Bar value={p.weight} max={100} color={p.weight > 40 ? cssVar("--amber") : cssVar("--blue")} height={3} />
              </div>
            )}
            {p.weight > 40 && (
              <div className="num" style={{ fontSize: 11, color: cssVar("--amber"), marginTop: 5 }}>
                tỷ trọng trên 40%, danh mục đang tập trung vào mã này
              </div>
            )}
          </div>
        ))}
      </div>

      {hist && hist.realized && hist.realized.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <SectionLabel>Đã chốt lời lỗ</SectionLabel>
          <div style={{ marginTop: 10 }}>
            {hist.realized.slice(0, 8).map((r, i) => (
              <div key={i} className="tape between" style={{ padding: "11px 0" }}>
                <span style={{ minWidth: 0 }}>
                  <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>{r.symbol}</span>
                  <span className="num" style={{ fontSize: 11, color: cssVar("--muted") }}>
                    {" "}{nf.format(r.qty)} cp · {r.date} · giữ {r.holdDays} ngày
                  </span>
                </span>
                <span className="num" style={{ fontSize: 14, fontWeight: 500, color: plColor(r.pl) }}>
                  {sign(r.pl)}{short(r.pl)}
                  <span style={{ fontSize: 11, fontWeight: 400 }}> {sign(r.plPct)}{r.plPct.toFixed(1)}%</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {hist && hist.history && hist.history.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <SectionLabel right={
            <button onClick={() => setShowHist(!showHist)} style={{ fontSize: 12, color: cssVar("--blue") }}>
              {showHist ? "thu gọn" : `xem tất cả (${hist.history.length})`}
            </button>
          }>Sổ giao dịch</SectionLabel>
          <div style={{ marginTop: 10 }}>
            {(showHist ? hist.history : hist.history.slice(0, 5)).map((h) => (
              <div key={h.id} className="tape between" style={{ padding: "10px 0",
                alignItems: "flex-start", opacity: h.voided ? 0.45 : 1 }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 13 }}>
                    {h.label}
                    {h.symbol && <span className="num" style={{ fontWeight: 600 }}> {h.symbol}</span>}
                    {h.voided && <span style={{ color: cssVar("--red"), fontSize: 11 }}> · đã hủy</span>}
                  </span>
                  <span className="num" style={{ display: "block", fontSize: 11, color: cssVar("--muted") }}>
                    {h.date}
                    {h.qty ? ` · ${nf.format(h.qty)} cp` : ""}
                    {h.price_vnd ? ` · ${nf.format(h.price_vnd)}` : ""}
                    {h.note ? ` · ${h.note}` : ""}
                  </span>
                  {h.type === "INIT_CASH" && (
                    <span style={{ display: "block", fontSize: 11, color: cssVar("--muted"), marginTop: 2 }}>
                      số dư khai lúc bắt đầu ghi sổ — các lệnh mua trước ngày này không trừ tiền lại
                    </span>
                  )}
                </span>
                <span className="num" style={{ fontSize: 13, flexShrink: 0, marginLeft: 12,
                  color: h.cash != null && h.cash < 0 ? cssVar("--red") : cssVar("--ink") }}>
                  {h.cash != null ? money(h.cash) : h.qty && h.price_vnd ? short(h.qty * h.price_vnd) : ""}
                </span>
              </div>
            ))}
          </div>
          {hist.undoable && (
            <div style={{ marginTop: 12 }}>
              <UndoLast flash={flash} onDone={load} last={hist.undoable} />
            </div>
          )}
          {hist.voided_count > 0 && (
            <div style={{ marginTop: 10 }}>
              <button onClick={() => setShowVoided(!showVoided)}
                style={{ fontSize: 12, color: cssVar("--muted") }}>
                {showVoided
                  ? "ẩn giao dịch đã hủy"
                  : `hiện ${hist.voided_count} giao dịch đã hủy`}
              </button>
            </div>
          )}
        </section>
      )}

      <p style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 24, lineHeight: 1.6 }}>
        Số liệu tính từ sổ giao dịch FIFO của chính bạn, không phải số liệu chính thức từ công ty
        chứng khoán và không phải khuyến nghị đầu tư. Đối chiếu với app TCBS trước khi ra quyết định.
      </p>

      {trade && (
        <TradeForm flash={flash} onClose={() => setTrade(null)}
          onSaved={() => { setTrade(null); load(); }} />
      )}
      {tool === "reconcile" && (
        <Reconcile flash={flash} onClose={() => setTool(null)} onSaved={load} />
      )}
      {tool === "batch" && (
        <BatchEntry flash={flash} onClose={() => setTool(null)} onSaved={load} />
      )}
      {tool === "report" && <InvestReport onClose={() => setTool(null)} />}
      {tool === "alerts" && <PriceAlerts flash={flash} onClose={() => setTool(null)} />}
    </div>
  );
}

/* ============================ Trợ lý ============================ */

const SUGGESTIONS = [
  "Tháng này tôi tiêu nhiều nhất vào đâu?",
  "So với tháng trước tôi tiêu tăng hay giảm?",
  "Có danh mục nào đang tăng bất thường không?",
  "Chi tiếp khách tháng này bao nhiêu?",
  "Tôi có khoản nào sắp phải trả không?",
];

function Assistant({ data, month, flash }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tips, setTips] = useState([]);
  const endRef = useRef(null);

  useEffect(() => {
    api(`/insights?month=${month}`).then((r) => setTips(r.insights || [])).catch(() => {});
  }, [month]);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (text) => {
    const question = (text || input).trim();
    if (!question || busy) return;
    setInput("");
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setBusy(true);
    try {
      const r = await api("/assistant", { method: "POST", body: { question, history, month } });
      setMessages((prev) => [...prev, { role: "model", text: r.answer }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "model", text: e.message, error: true }]);
    }
    setBusy(false);
  };

  if (!data.assistant_enabled) {
    return (
      <div className="pad" style={{ paddingTop: 30 }}>
        <Empty text="Trợ lý chưa bật." />
        <p style={{ fontSize: 13, color: cssVar("--muted"), lineHeight: 1.7 }}>
          Thêm <span className="num">GEMINI_API_KEY</span> vào file .env trên máy chủ rồi
          khởi động lại dịch vụ để bật.
        </p>
      </div>
    );
  }

  return (
    <div className="pad" style={{ paddingTop: 20 }}>
      {tips.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <SectionLabel>Đáng chú ý</SectionLabel>
          <div style={{ marginTop: 10 }}>
            {tips.map((t, i) => (
              <div key={i} className="row" style={{ gap: 8, padding: "6px 0", fontSize: 13 }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0,
                  background: cssVar(t.level === "red" ? "--red" : "--amber") }} />
                <span>{t.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {messages.length === 0 ? (
        <section style={{ marginBottom: 20 }}>
          <SectionLabel>Thử hỏi</SectionLabel>
          <div style={{ marginTop: 10 }}>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)}
                className="tape" style={{ width: "100%", textAlign: "left", padding: "12px 0", fontSize: 14 }}>
                {s}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 16, display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "86%", padding: "10px 14px", borderRadius: 14, fontSize: 14, lineHeight: 1.6,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
                background: m.role === "user" ? cssVar("--ink") : cssVar("--card"),
                color: m.role === "user" ? cssVar("--onink") : (m.error ? cssVar("--red") : cssVar("--ink")),
                border: m.role === "user" ? "none" : `1px solid ${cssVar("--line")}`,
              }}>
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="row" style={{ gap: 8, color: cssVar("--muted"), fontSize: 13, padding: "4px 0" }}>
              <span className="spin" /> đang xem số liệu…
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      <div className="row" style={{ gap: 8, position: "sticky", bottom: 96,
        background: cssVar("--paper"), paddingTop: 8, paddingBottom: 4 }}>
        <input className="field" value={input} placeholder="Hỏi về chi tiêu của bạn…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()} />
        <Button onClick={() => send()} disabled={busy || !input.trim()}
          style={{ borderRadius: 8, padding: "10px 18px", fontSize: 14 }}>Gửi</Button>
      </div>

      <p style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 12, lineHeight: 1.6 }}>
        Mọi con số do máy chủ tính bằng SQL, trợ lý chỉ diễn giải chứ không tự tính.
        Phần này không đưa khuyến nghị đầu tư.
      </p>
    </div>
  );
}

/* ============================ Nhập giao dịch ============================ */

function UndoLast({ last, onDone, flash }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const undo = async () => {
    setBusy(true);
    try {
      await api("/stock/undo", { method: "POST", body: { reason: "huy tu app" } });
      flash("Đã hủy giao dịch cuối");
      onDone();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  if (!confirm) {
    return (
      <Button kind="danger" onClick={() => setConfirm(true)}>
        Hủy giao dịch cuối ({last.label}{last.symbol ? " " + last.symbol : ""} {last.date})
      </Button>
    );
  }
  return (
    <span style={{ fontSize: 13 }}>
      Hủy {last.label}{last.symbol ? " " + last.symbol : ""} ngày {last.date}?{" "}
      <button onClick={undo} disabled={busy} style={{ color: cssVar("--red"), fontWeight: 600 }}>
        {busy ? "đang hủy…" : "Hủy"}
      </button>
      {" · "}
      <button onClick={() => setConfirm(false)} style={{ color: cssVar("--muted") }}>Giữ lại</button>
    </span>
  );
}

function TradeForm({ onClose, onSaved, flash }) {
  const [type, setType] = useState("BUY");
  const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [cash, setCash] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const spec = TRADE_TYPES.find((t) => t.id === type) || TRADE_TYPES[0];
  const needs = (f) => spec.needs.includes(f);

  const qtyNum = Number(qty) || 0;
  const priceNum = Number(price) || 0;
  const cashNum = Number(cash) || 0;
  const gross = qtyNum * priceNum;

  const ready =
    (!needs("symbol") || /^[A-Za-z]{3}$/.test(symbol.trim())) &&
    (!needs("qty") || qtyNum > 0) &&
    (!needs("priceVND") || priceNum > 0) &&
    (!needs("cash") || cashNum !== 0);

  const submit = async () => {
    setBusy(true);
    try {
      const body = { type, date, note: note.trim() };
      if (needs("symbol")) body.symbol = symbol.trim().toUpperCase();
      if (needs("qty")) body.qty = qtyNum;
      if (needs("priceVND")) body.priceVND = priceNum;
      if (needs("cash")) body.cash = cashNum;
      await api("/stock/tx", { method: "POST", body });
      flash("Đã ghi vào sổ");
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  return (
    <Sheet title="Ghi giao dịch" onClose={onClose}>
      <Field label="Loại giao dịch">
        <Chips options={TRADE_TYPES.map((t) => ({ id: t.id, label: t.label }))} value={type} onChange={setType} />
      </Field>

      {needs("symbol") && (
        <Field label="Mã chứng khoán">
          <input className="field num" value={symbol} maxLength={3} autoFocus
            placeholder="HCM" style={{ width: 120, textTransform: "uppercase" }}
            onChange={(e) => setSymbol(e.target.value.replace(/[^A-Za-z]/g, ""))} />
        </Field>
      )}

      {needs("qty") && (
        <Field label="Số lượng">
          <input className="field num" type="number" inputMode="numeric" value={qty}
            placeholder="5000" onChange={(e) => setQty(e.target.value)} />
        </Field>
      )}

      {needs("priceVND") && (
        <Field label="Giá khớp" hint="Nhập theo ĐỒNG: 25900, không phải 25,9">
          <input className="field num" type="number" inputMode="numeric" value={price}
            placeholder="25900" onChange={(e) => setPrice(e.target.value)} />
          {priceNum > 0 && priceNum < 1000 && (
            <div style={{ fontSize: 12, color: cssVar("--red"), marginTop: 6 }}>
              {nf.format(priceNum)}đ một cổ phiếu — có phải bạn định nhập {nf.format(priceNum * 1000)}đ?
            </div>
          )}
        </Field>
      )}

      {needs("cash") && (
        <Field label="Số tiền"
          hint={type === "ADJUSTMENT" || type === "INTEREST" ? "Số âm để trừ tiền, ví dụ phí margin" : null}>
          <input className="field num" type="number" inputMode="numeric" value={cash} autoFocus
            placeholder="10000000" onChange={(e) => setCash(e.target.value)} />
          {cashNum !== 0 && (
            <div className="num" style={{ fontSize: 12, color: cssVar("--muted"), marginTop: 6 }}>
              {money(cashNum)}
            </div>
          )}
        </Field>
      )}

      {gross > 0 && (
        <div className="box" style={{ padding: 12, marginBottom: 18 }}>
          <div className="between num" style={{ fontSize: 13 }}>
            <span style={{ color: cssVar("--muted") }}>Giá trị lệnh</span>
            <span style={{ fontWeight: 600 }}>{money(gross)}</span>
          </div>
          {type === "SELL" && (
            <div className="between num" style={{ fontSize: 12, marginTop: 5, color: cssVar("--muted") }}>
              <span>Thuế bán 0,1%</span>
              <span>−{money(Math.round(gross * 0.001))}</span>
            </div>
          )}
        </div>
      )}

      <Field label="Ngày giao dịch">
        <input className="field num" type="date" value={date} style={{ width: "auto" }}
          onChange={(e) => setDate(e.target.value)} />
      </Field>

      <Field label="Ghi chú">
        <input className="field" value={note} placeholder="tuỳ chọn"
          onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="row" style={{ gap: 12, marginTop: 24 }}>
        <Button kind="ghost" onClick={onClose}>Hủy</Button>
        <Button onClick={submit} disabled={busy || !ready} style={{ flex: 1 }}>
          {busy ? "Đang ghi…" : "Ghi vào sổ"}
        </Button>
      </div>

      <p style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 16, lineHeight: 1.6 }}>
        Sổ chỉ ghi thêm, không sửa và không xóa. Nếu nhập nhầm, dùng nút hủy giao dịch cuối —
        giao dịch vẫn được lưu lại nhưng không còn tính vào số dư.
      </p>
    </Sheet>
  );
}
