/* ============================ Tổng quan ============================ */

function Home({ data, month, setMonth, txs, onEdit, onAdd, onPayBill, goTab }) {
  const { categories, cards, bills } = data;
  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);

  const monthTxs = useMemo(
    () => txs.filter((t) => monthOf(t.date) === month).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [txs, month]
  );
  const total = monthTxs.reduce((s, t) => s + t.amount, 0);
  const prevTotal = useMemo(
    () => txs.filter((t) => monthOf(t.date) === shiftMonth(month, -1)).reduce((s, t) => s + t.amount, 0),
    [txs, month]
  );
  const diff = prevTotal ? ((total - prevTotal) / prevTotal) * 100 : 0;

  const byType = useMemo(() => {
    const o = {};
    monthTxs.forEach((t) => (o[t.type] = (o[t.type] || 0) + t.amount));
    return o;
  }, [monthTxs]);

  const byCat = useMemo(() => {
    const o = {};
    monthTxs.forEach((t) => (o[t.category_id] = (o[t.category_id] || 0) + t.amount));
    return Object.entries(o)
      .map(([id, v]) => ({ id, total: v, cat: catMap[id] }))
      .filter((r) => r.cat)
      .sort((a, b) => b.total - a.total);
  }, [monthTxs, catMap]);
  const maxCat = Math.max(...byCat.map((r) => r.total), 1);

  const trend = useMemo(() => {
    const out = [];
    for (let i = 5; i >= 0; i--) {
      const ym = shiftMonth(month, -i);
      out.push({ ym, label: "T" + Number(ym.split("-")[1]),
        total: txs.filter((t) => monthOf(t.date) === ym).reduce((s, t) => s + t.amount, 0) });
    }
    return out;
  }, [txs, month]);
  const maxTrend = Math.max(...trend.map((t) => t.total), 1);

  const alerts = bills.filter((b) => b.active && (b.status === "overdue" || b.status === "due_soon"));
  const debt = cards.reduce((s, c) => s + Math.max(0, c.balance), 0);

  const grouped = useMemo(() => {
    const g = {};
    monthTxs.forEach((t) => (g[t.date] = g[t.date] || []).push(t));
    return Object.entries(g);
  }, [monthTxs]);

  return (
    <div className="pad">
      <section style={{ padding: "24px 0 18px" }}>
        <div style={{ fontSize: 12, color: cssVar("--muted") }}>Đã chi trong tháng</div>
        <div className="num" style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-.02em", marginTop: 2 }}>
          {money(total)}
        </div>
        {prevTotal > 0 && (
          <div className="num" style={{ fontSize: 12, marginTop: 4, color: diff > 0 ? cssVar("--red") : cssVar("--green") }}>
            {diff > 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(0)}% so với tháng trước ({short(prevTotal)})
          </div>
        )}
      </section>

      {(alerts.length > 0 || debt > 0) && (
        <section className="grid2" style={{ marginBottom: 24 }}>
          <button className="box" onClick={() => goTab("bills")} style={{ padding: 14, textAlign: "left" }}>
            <div style={{ fontSize: 11, color: cssVar("--muted") }}>Hóa đơn cần trả</div>
            <div className="num" style={{ fontSize: 20, fontWeight: 600, marginTop: 3,
              color: alerts.some((a) => a.status === "overdue") ? cssVar("--red") : cssVar("--ink") }}>
              {alerts.length}
            </div>
            <div className="num truncate" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 2 }}>
              {alerts.length ? short(alerts.reduce((s, a) => s + a.amount, 0)) : "không có"}
            </div>
          </button>
          <button className="box" onClick={() => goTab("cards")} style={{ padding: 14, textAlign: "left" }}>
            <div style={{ fontSize: 11, color: cssVar("--muted") }}>Dư nợ thẻ</div>
            <div className="num" style={{ fontSize: 20, fontWeight: 600, marginTop: 3 }}>{short(debt)}</div>
            <div className="num truncate" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 2 }}>
              {cards.length} thẻ
            </div>
          </button>
        </section>
      )}

      {alerts.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <SectionLabel>Sắp đến hạn</SectionLabel>
          <div style={{ marginTop: 10 }}>
            {alerts.slice(0, 4).map((b) => (
              <div key={b.id} className="tape between" style={{ padding: "11px 0", gap: 10 }}>
                <span style={{ minWidth: 0 }}>
                  <span className="truncate" style={{ display: "block", fontSize: 14 }}>{b.name}</span>
                  <span className="num" style={{ fontSize: 11, color: b.status === "overdue" ? cssVar("--red") : cssVar("--amber") }}>
                    {b.status === "overdue"
                      ? `quá hạn ${Math.abs(b.days_left)} ngày`
                      : b.days_left === 0 ? "đến hạn hôm nay" : `còn ${b.days_left} ngày`}
                  </span>
                </span>
                <span className="row" style={{ gap: 10 }}>
                  <span className="num" style={{ fontSize: 13, fontWeight: 500 }}>{short(b.amount)}</span>
                  <Button kind="outline" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => onPayBill(b)}>
                    Đã trả
                  </Button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {trend.some((t) => t.total > 0) && (
        <section style={{ marginBottom: 26 }}>
          <div className="row" style={{ alignItems: "flex-end", gap: 8, height: 80 }}>
            {trend.map((t) => (
              <button key={t.ym} onClick={() => setMonth(t.ym)} title={`${MONTH_VN(t.ym)} — ${money(t.total)}`}
                style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                <div style={{
                  height: Math.max((t.total / maxTrend) * 62, t.total > 0 ? 3 : 1),
                  background: t.ym === month ? cssVar("--ink") : cssVar("--track"),
                  borderRadius: "3px 3px 0 0",
                }} />
                <div className="num" style={{ fontSize: 11, marginTop: 6, color: t.ym === month ? cssVar("--ink") : cssVar("--muted") }}>
                  {t.label}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {total > 0 && (
        <section style={{ marginBottom: 26 }}>
          <div className="row" style={{ height: 8, borderRadius: 8, overflow: "hidden" }}>
            {TYPES.map((t) => byType[t.id]
              ? <div key={t.id} title={t.label} style={{ background: cssVar(t.varname), flex: byType[t.id] }} />
              : null)}
          </div>
          <div className="wrap" style={{ marginTop: 8, gap: 16 }}>
            {TYPES.map((t) => byType[t.id] ? (
              <div key={t.id} className="row" style={{ gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: cssVar(t.varname) }} />
                <span style={{ fontSize: 12, color: cssVar("--muted") }}>{t.label}</span>
                <span className="num" style={{ fontSize: 12, fontWeight: 500 }}>{short(byType[t.id])}</span>
              </div>
            ) : null)}
          </div>
        </section>
      )}

      {byCat.length > 0 && (
        <section style={{ marginBottom: 26 }}>
          <SectionLabel>Theo danh mục</SectionLabel>
          <div style={{ marginTop: 12 }}>
            {byCat.map((r) => (
              <div key={r.id} style={{ marginBottom: 12 }}>
                <div className="between" style={{ alignItems: "baseline", marginBottom: 6 }}>
                  <span style={{ fontSize: 14 }}><span style={{ marginRight: 8 }}>{r.cat.icon}</span>{r.cat.name}</span>
                  <span className="num" style={{ fontSize: 13, fontWeight: 500 }}>{money(r.total)}</span>
                </div>
                <Bar value={r.total} max={maxCat} color={r.cat.color} />
                {r.cat.budget > 0 && (
                  <div className="num" style={{ fontSize: 11, marginTop: 4, color: r.total > r.cat.budget ? cssVar("--red") : cssVar("--muted") }}>
                    {Math.round((r.total / r.cat.budget) * 100)}% ngân sách {short(r.cat.budget)}
                    {r.total > r.cat.budget && " — vượt"}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <SectionLabel>Nhật ký</SectionLabel>
      {grouped.length === 0 ? (
        <Empty text={`Chưa có khoản chi nào trong ${MONTH_VN(month).toLowerCase()}.`}
          action={<Button onClick={onAdd}>Thêm khoản chi đầu tiên</Button>} />
      ) : (
        <div style={{ marginTop: 12 }}>
          {grouped.map(([date, items]) => (
            <div key={date} style={{ marginBottom: 18 }}>
              <div className="between" style={{ alignItems: "baseline", marginBottom: 8 }}>
                <span className="num" style={{ fontSize: 11, letterSpacing: ".08em", color: cssVar("--muted") }}>
                  {DAY_VN(date).toUpperCase()}
                </span>
                <span className="num" style={{ fontSize: 11, color: cssVar("--muted") }}>
                  {short(items.reduce((s, t) => s + t.amount, 0))}
                </span>
              </div>
              {items.map((t) => {
                const c = catMap[t.category_id];
                const ty = TYPES.find((x) => x.id === t.type) || {};
                return (
                  <button key={t.id} onClick={() => onEdit(t)} className="tape row"
                    style={{ width: "100%", gap: 12, padding: "12px 0", textAlign: "left" }}>
                    <span style={{ fontSize: 18, width: 24 }}>{(c && c.icon) || "•"}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="truncate" style={{ display: "block", fontSize: 14 }}>
                        {t.note || (c && c.name) || "Khoản chi"}
                      </span>
                      <span style={{ fontSize: 11, color: cssVar("--muted") }}>
                        {c && c.name}{t.sub ? ` · ${t.sub}` : ""} · <span style={{ color: cssVar(ty.varname) }}>{ty.label}</span>
                        {t.source === "ocr" ? " · 📷" : ""}
                      </span>
                    </span>
                    <span className="num" style={{ fontSize: 14, fontWeight: 500 }}>{money(t.amount)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================ Nhập khoản chi ============================ */

function Entry({ data, initial, prefill, onSaved, onDeleted, onClose, flash }) {
  const cats = data.categories;
  const src = initial || prefill || {};
  const [amount, setAmount] = useState(src.amount ? String(src.amount) : "");
  const [categoryId, setCategoryId] = useState(src.category_id || cats[0].id);
  const [sub, setSub] = useState(src.sub || "");
  const [type, setType] = useState(src.type || "personal");
  const [method, setMethod] = useState(src.method || "cash");
  const [cardId, setCardId] = useState(src.card_id || (data.cards[0] || {}).id || "");
  const [note, setNote] = useState(src.note || "");
  const [date, setDate] = useState(src.date || todayISO());
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [receipt, setReceipt] = useState(src.receipt || null);
  const fileRef = useRef(null);

  const cat = cats.find((c) => c.id === categoryId);
  const amountNum = Number(amount) || 0;

  const scan = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    try {
      const b64 = await compressImage(file);
      const { receipt: r } = await api("/ocr", { method: "POST", body: { image: b64, mime: "image/jpeg" } });
      if (r.total > 0) setAmount(String(r.total));
      if (r.date) setDate(r.date);
      if (r.merchant) setNote(r.merchant);
      const matched = cats.find((c) => c.name.toLowerCase() === String(r.suggested_category).toLowerCase());
      if (matched) setCategoryId(matched.id);
      setReceipt(r);
      flash(r.confidence < 0.5
        ? "Ảnh hơi khó đọc — kiểm tra lại số tiền"
        : `Đã đọc hóa đơn${r.items.length ? ` · ${r.items.length} món` : ""}`);
    } catch (err) {
      flash(err.message);
    }
    setScanning(false);
  };

  const submit = async () => {
    if (amountNum <= 0) return;
    setBusy(true);
    try {
      const body = {
        amount: amountNum, category_id: categoryId, sub: cat && cat.subs.length ? sub : "",
        type, method, card_id: method === "card" ? cardId : null,
        note: note.trim(), date, source: receipt ? "ocr" : initial ? initial.source : "manual",
        receipt,
      };
      const res = initial
        ? await api("/transactions/" + initial.id, { method: "PUT", body })
        : await api("/transactions", { method: "POST", body });
      onSaved(res.transaction, Boolean(initial));
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api("/transactions/" + initial.id, { method: "DELETE" });
      onDeleted(initial.id);
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  return (
    <Sheet title={initial ? "Sửa khoản chi" : "Thêm khoản chi"} onClose={onClose}>
      {!initial && data.ocr_enabled && (
        <div style={{ marginBottom: 22 }}>
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            onChange={scan} style={{ display: "none" }} />
          <Button kind="outline" onClick={() => fileRef.current.click()} disabled={scanning}
            style={{ width: "100%", padding: "14px 0" }}>
            {scanning ? <span className="row" style={{ gap: 8, justifyContent: "center" }}>
              <span className="spin" /> Đang đọc hóa đơn…
            </span> : "📷  Quét hóa đơn"}
          </Button>
        </div>
      )}

      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 12, color: cssVar("--muted") }}>Số tiền</div>
        <div className="row" style={{ alignItems: "baseline", gap: 8, marginTop: 4 }}>
          <input type="number" inputMode="numeric" value={amount} placeholder="0" autoFocus={!initial}
            onChange={(e) => setAmount(e.target.value)} className="num"
            style={{ flex: 1, width: "100%", fontSize: 34, fontWeight: 700, border: "none",
              background: "transparent", outline: "none", letterSpacing: "-.02em", padding: 0 }} />
          <span className="num" style={{ fontSize: 20, color: cssVar("--muted") }}>₫</span>
        </div>
        <div style={{ height: 1, background: cssVar("--ink"), marginTop: 4 }} />
        <div className="num" style={{ fontSize: 12, color: cssVar("--muted"), marginTop: 8, minHeight: 16 }}>
          {amountNum > 0 && money(amountNum)}
        </div>
        <div className="wrap" style={{ marginTop: 8 }}>
          {[10000, 50000, 100000, 500000].map((k) => (
            <button key={k} className="num" onClick={() => setAmount(String(amountNum + k))}
              style={{ fontSize: 12, background: cssVar("--chip"), padding: "6px 12px", borderRadius: 99 }}>
              +{short(k)}
            </button>
          ))}
          {amount && <button onClick={() => setAmount("")} style={{ fontSize: 12, color: cssVar("--muted"), padding: "6px 12px" }}>Xóa</button>}
        </div>
      </div>

      {receipt && receipt.items && receipt.items.length > 0 && (
        <div className="box" style={{ padding: 12, marginBottom: 18 }}>
          <div className="num label">Món trên hóa đơn</div>
          <div style={{ marginTop: 8 }}>
            {receipt.items.slice(0, 8).map((it, i) => (
              <div key={i} className="between" style={{ fontSize: 12, padding: "3px 0" }}>
                <span className="truncate" style={{ color: cssVar("--muted") }}>{it.qty > 1 ? `${it.qty}× ` : ""}{it.name}</span>
                <span className="num">{short(it.price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Field label="Danh mục">
        <div className="grid4">
          {cats.map((c) => {
            const on = c.id === categoryId;
            return (
              <button key={c.id} onClick={() => { setCategoryId(c.id); setSub(""); }}
                style={{ padding: "12px 0", borderRadius: 12,
                  background: on ? cssVar("--ink") : cssVar("--card"),
                  color: on ? cssVar("--onink") : cssVar("--ink"),
                  border: `1px solid ${on ? cssVar("--ink") : cssVar("--line")}` }}>
                <div style={{ fontSize: 18 }}>{c.icon}</div>
                <div className="truncate" style={{ fontSize: 11, marginTop: 2, padding: "0 2px" }}>{c.name}</div>
              </button>
            );
          })}
        </div>
      </Field>

      {cat && cat.subs.length > 0 && (
        <Field label="Chi tiết">
          <Chips options={cat.subs.map((s) => ({ id: s, label: s }))} value={sub} onChange={setSub} />
        </Field>
      )}

      <Field label="Loại chi">
        <Chips options={TYPES} value={type} onChange={setType} accent />
      </Field>

      <Field label="Thanh toán">
        <Chips options={METHODS} value={method} onChange={setMethod} />
      </Field>

      {method === "card" && data.cards.length > 0 && (
        <Field label="Thẻ">
          <Chips options={data.cards.map((c) => ({ id: c.id, label: `${c.bank}${c.last4 ? " ••" + c.last4 : ""}` }))}
            value={cardId} onChange={setCardId} />
        </Field>
      )}
      {method === "card" && data.cards.length === 0 && (
        <div style={{ fontSize: 12, color: cssVar("--muted"), marginBottom: 18 }}>
          Chưa có thẻ nào. Thêm thẻ ở tab Thẻ để theo dõi dư nợ.
        </div>
      )}

      <Field label="Ghi chú">
        <input className="field" value={note} placeholder="Ăn trưa với khách DGW…"
          onChange={(e) => setNote(e.target.value)} />
      </Field>

      <Field label="Ngày">
        <input className="field num" type="date" value={date} style={{ width: "auto" }}
          onChange={(e) => setDate(e.target.value)} />
      </Field>

      <div className="row" style={{ gap: 12, marginTop: 26 }}>
        <Button kind="ghost" onClick={onClose}>Hủy</Button>
        <Button onClick={submit} disabled={busy || amountNum <= 0} style={{ flex: 1 }}>
          {busy ? "Đang lưu…" : initial ? "Cập nhật" : "Lưu khoản chi"}
        </Button>
      </div>

      {initial && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          {confirmDel ? (
            <span style={{ fontSize: 13 }}>
              Xóa khoản này?{" "}
              <button onClick={remove} style={{ color: cssVar("--red"), fontWeight: 600 }}>Xóa</button>
              {" · "}
              <button onClick={() => setConfirmDel(false)} style={{ color: cssVar("--muted") }}>Giữ lại</button>
            </span>
          ) : (
            <Button kind="danger" onClick={() => setConfirmDel(true)}>Xóa khoản chi</Button>
          )}
        </div>
      )}
    </Sheet>
  );
}
