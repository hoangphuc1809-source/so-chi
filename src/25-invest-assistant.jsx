/* ============================ Đầu tư ============================ */

function Invest({ flash }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    api("/portfolio")
      .then((d) => { setData(d); setErr(""); })
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  }, []);

  useEffect(load, [load]);

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
            Sổ Chi không tự tính danh mục. Số liệu do <b>portfolio-bot</b> trên máy chủ
            hermes-gateway tính từ sổ giao dịch FIFO rồi đẩy sang đây theo lịch.
            Nếu tab này trống, kiểm tra dịch vụ <span className="num">portfolio-bot</span> và
            timer <span className="num">portfolio-snapshot</span> bên đó.
          </p>
        </div>
      </div>
    );
  }

  const stale = data.age_minutes > 60;
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

      <section style={{ marginBottom: 24 }}>
        <div className="num label">Tổng tài sản ròng</div>
        <div className="num" style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-.02em", marginTop: 3 }}>
          {s.nav != null ? money(s.nav) : "—"}
        </div>
        {!s.degraded && (
          <div className="num" style={{ fontSize: 12, marginTop: 4, color: plColor(s.unrealized_pl) }}>
            {sign(s.unrealized_pl)}{money(s.unrealized_pl)} chưa thực hiện
            {s.unrealized_pct != null && ` (${sign(s.unrealized_pct)}${s.unrealized_pct.toFixed(2)}%)`}
          </div>
        )}
        <div className="num" style={{ fontSize: 11, color: stale ? cssVar("--amber") : cssVar("--muted"), marginTop: 6 }}>
          cập nhật {data.age_minutes < 1 ? "vừa xong" : `${data.age_minutes} phút trước`}
          {stale && " — số liệu đã cũ"}
          {"  ·  "}
          <button onClick={load} style={{ color: cssVar("--blue"), fontSize: 11 }}>tải lại</button>
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
        </div>
      </section>

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
              <span>{nf.format(p.qty)} cp · vốn {nf.format(p.avg_cost)} · giá {p.market_price != null ? nf.format(p.market_price) : "—"}</span>
              <span>{p.weight != null ? `${p.weight.toFixed(1)}%` : ""}</span>
            </div>
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

      <p style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 24, lineHeight: 1.6 }}>
        Số liệu ghi chép từ sổ giao dịch FIFO của portfolio-bot, không phải số liệu chính thức
        từ công ty chứng khoán và không phải khuyến nghị đầu tư. Đối chiếu với app TCBS trước khi
        ra quyết định.
      </p>
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
