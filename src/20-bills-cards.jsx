/* ============================ Hóa đơn ============================ */

function Bills({ data, reload, flash }) {
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const bills = data.bills;

  const pay = async (b) => {
    try {
      await api(`/bills/${b.id}/pay`, { method: "POST", body: { amount: b.amount } });
      flash(`Đã ghi nhận thanh toán ${b.name}`);
      reload();
    } catch (e) {
      flash(e.message);
    }
  };

  const groups = [
    { key: "overdue", title: "Quá hạn", color: "--red" },
    { key: "due_soon", title: "Sắp đến hạn", color: "--amber" },
    { key: "upcoming", title: "Sắp tới", color: "--muted" },
    { key: "paused", title: "Đã tạm dừng", color: "--muted" },
  ];

  return (
    <div className="pad" style={{ paddingTop: 22 }}>
      <div className="between" style={{ marginBottom: 18 }}>
        <div>
          <div className="num label">Hóa đơn</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 600, marginTop: 3 }}>
            {short(bills.filter((b) => b.active).reduce((s, b) => s + b.amount, 0))}
            <span style={{ fontSize: 12, color: cssVar("--muted"), fontWeight: 400 }}> / chu kỳ</span>
          </div>
        </div>
        <Button kind="outline" onClick={() => setAdding(true)}>+ Thêm</Button>
      </div>

      {bills.length === 0 && (
        <Empty text="Chưa có hóa đơn nào. Thêm tiền điện, internet, bảo hiểm… để được nhắc trước hạn."
          action={<Button onClick={() => setAdding(true)}>Thêm hóa đơn</Button>} />
      )}

      {groups.map((g) => {
        const list = bills.filter((b) => b.status === g.key);
        if (!list.length) return null;
        return (
          <section key={g.key} style={{ marginBottom: 24 }}>
            <div className="num label" style={{ color: cssVar(g.color) }}>{g.title}</div>
            <div style={{ marginTop: 10 }}>
              {list.map((b) => (
                <div key={b.id} className="tape between" style={{ padding: "13px 0", gap: 10 }}>
                  <button onClick={() => setEditing(b)} style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <span className="truncate" style={{ display: "block", fontSize: 14 }}>{b.name}</span>
                    <span className="num" style={{ fontSize: 11, color: cssVar("--muted") }}>
                      {b.next_due} · {(RECURRENCE.find((r) => r.id === b.recurrence) || {}).label}
                      {b.status === "overdue" && <span style={{ color: cssVar("--red") }}> · quá hạn {Math.abs(b.days_left)} ngày</span>}
                      {b.status === "due_soon" && <span style={{ color: cssVar("--amber") }}> · còn {b.days_left} ngày</span>}
                    </span>
                  </button>
                  <span className="row" style={{ gap: 10 }}>
                    <span className="num" style={{ fontSize: 14, fontWeight: 500 }}>{short(b.amount)}</span>
                    {b.active && (
                      <Button kind="outline" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => pay(b)}>
                        Đã trả
                      </Button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {(adding || editing) && (
        <BillForm data={data} initial={editing} flash={flash}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function BillForm({ data, initial, onClose, onSaved, flash }) {
  const b = initial || {};
  const [name, setName] = useState(b.name || "");
  const [amount, setAmount] = useState(b.amount ? String(b.amount) : "");
  const [categoryId, setCategoryId] = useState(b.category_id || (data.categories.find((c) => c.name === "Hóa đơn") || data.categories[0]).id);
  const [nextDue, setNextDue] = useState(b.next_due || todayISO());
  const [recurrence, setRecurrence] = useState(b.recurrence || "monthly");
  const [reminderDays, setReminderDays] = useState(b.reminder_days ?? 3);
  const [method, setMethod] = useState(b.method || "bank");
  const [cardId, setCardId] = useState(b.card_id || "");
  const [active, setActive] = useState(b.active === undefined ? true : Boolean(b.active));
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    if (!initial) return;
    api(`/bills/${initial.id}/payments`).then((r) => setHistory(r.payments)).catch(() => {});
  }, [initial]);

  const submit = async () => {
    if (!name.trim()) return flash("Cần có tên hóa đơn");
    setBusy(true);
    try {
      const body = {
        name: name.trim(), amount: Number(amount) || 0, category_id: categoryId,
        next_due: nextDue, recurrence, reminder_days: Number(reminderDays) || 0,
        method, card_id: method === "card" ? cardId : null, active,
      };
      if (initial) await api("/bills/" + initial.id, { method: "PUT", body });
      else await api("/bills", { method: "POST", body });
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api("/bills/" + initial.id, { method: "DELETE" });
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  return (
    <Sheet title={initial ? "Sửa hóa đơn" : "Thêm hóa đơn"} onClose={onClose}>
      <Field label="Tên hóa đơn">
        <input className="field" value={name} placeholder="Tiền điện, Internet, Bảo hiểm…"
          autoFocus={!initial} onChange={(e) => setName(e.target.value)} />
      </Field>

      <Field label="Số tiền mỗi kỳ" hint="Để 0 nếu số tiền thay đổi mỗi tháng">
        <input className="field num" type="number" inputMode="numeric" value={amount}
          onChange={(e) => setAmount(e.target.value)} />
      </Field>

      <Field label="Hạn thanh toán kế tiếp">
        <input className="field num" type="date" value={nextDue} style={{ width: "auto" }}
          onChange={(e) => setNextDue(e.target.value)} />
      </Field>

      <Field label="Chu kỳ lặp">
        <Chips options={RECURRENCE} value={recurrence} onChange={setRecurrence} />
      </Field>

      <Field label="Nhắc trước" hint="Nhắc trong app và qua Telegram nếu đã cấu hình">
        <Chips options={[0, 1, 3, 5, 7].map((d) => ({ id: d, label: d === 0 ? "Đúng hạn" : `${d} ngày` }))}
          value={Number(reminderDays)} onChange={setReminderDays} />
      </Field>

      <Field label="Danh mục ghi nhận">
        <Chips options={data.categories.map((c) => ({ id: c.id, label: `${c.icon} ${c.name}` }))}
          value={categoryId} onChange={setCategoryId} />
      </Field>

      <Field label="Thanh toán bằng">
        <Chips options={METHODS} value={method} onChange={setMethod} />
      </Field>

      {method === "card" && data.cards.length > 0 && (
        <Field label="Thẻ">
          <Chips options={data.cards.map((c) => ({ id: c.id, label: `${c.bank}${c.last4 ? " ••" + c.last4 : ""}` }))}
            value={cardId} onChange={setCardId} />
        </Field>
      )}

      {initial && (
        <Field label="Trạng thái">
          <Chips options={[{ id: true, label: "Đang theo dõi" }, { id: false, label: "Tạm dừng" }]}
            value={active} onChange={setActive} />
        </Field>
      )}

      {history && history.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div className="num label">Lịch sử thanh toán</div>
          <div style={{ marginTop: 8 }}>
            {history.slice(0, 8).map((p) => (
              <div key={p.id} className="between num" style={{ fontSize: 12, padding: "4px 0", color: cssVar("--muted") }}>
                <span>{p.paid_date}</span>
                <span>{money(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 12, marginTop: 24 }}>
        <Button kind="ghost" onClick={onClose}>Hủy</Button>
        <Button onClick={submit} disabled={busy || !name.trim()} style={{ flex: 1 }}>
          {busy ? "Đang lưu…" : initial ? "Cập nhật" : "Thêm hóa đơn"}
        </Button>
      </div>

      {initial && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          {confirmDel ? (
            <span style={{ fontSize: 13 }}>
              Xóa hóa đơn và toàn bộ lịch sử?{" "}
              <button onClick={remove} style={{ color: cssVar("--red"), fontWeight: 600 }}>Xóa</button>
              {" · "}
              <button onClick={() => setConfirmDel(false)} style={{ color: cssVar("--muted") }}>Giữ lại</button>
            </span>
          ) : (
            <Button kind="danger" onClick={() => setConfirmDel(true)}>Xóa hóa đơn</Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ============================ Thẻ tín dụng ============================ */

function Cards({ data, reload, flash }) {
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(null);
  const cards = data.cards;
  const totalDebt = cards.reduce((s, c) => s + Math.max(0, c.balance), 0);
  const totalLimit = cards.reduce((s, c) => s + c.limit_amount, 0);

  return (
    <div className="pad" style={{ paddingTop: 22 }}>
      <div className="between" style={{ marginBottom: 18 }}>
        <div>
          <div className="num label">Tổng dư nợ</div>
          <div className="num" style={{ fontSize: 26, fontWeight: 700, marginTop: 3 }}>{money(totalDebt)}</div>
          {totalLimit > 0 && (
            <div className="num" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 2 }}>
              {Math.round((totalDebt / totalLimit) * 100)}% trên tổng hạn mức {short(totalLimit)}
            </div>
          )}
        </div>
        <Button kind="outline" onClick={() => setAdding(true)}>+ Thêm</Button>
      </div>

      {cards.length === 0 && (
        <Empty text="Chưa có thẻ nào. Thêm thẻ để mỗi khoản chi bằng thẻ tự cộng vào dư nợ."
          action={<Button onClick={() => setAdding(true)}>Thêm thẻ</Button>} />
      )}

      {cards.map((c) => {
        const util = c.utilization;
        const color = util > 0.8 ? "--red" : util > 0.5 ? "--amber" : "--green";
        return (
          <div key={c.id} className="box" style={{ padding: 16, marginBottom: 12 }}>
            <div className="between">
              <button onClick={() => setEditing(c)} style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                <div className="truncate" style={{ fontSize: 15, fontWeight: 600 }}>
                  {c.bank} {c.last4 && <span className="num" style={{ color: cssVar("--muted"), fontWeight: 400 }}>•• {c.last4}</span>}
                </div>
                <div className="num" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 2 }}>
                  Sao kê ngày {c.statement_day} · Hạn trả ngày {c.due_day}
                  {!c.active && " · đã đóng"}
                </div>
              </button>
              <Button kind="outline" style={{ padding: "6px 14px", fontSize: 13 }} onClick={() => setPaying(c)}>
                Trả nợ
              </Button>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="between" style={{ alignItems: "baseline", marginBottom: 6 }}>
                <span className="num" style={{ fontSize: 20, fontWeight: 600 }}>{money(c.balance)}</span>
                <span className="num" style={{ fontSize: 12, color: cssVar("--muted") }}>
                  còn {short(c.available)}
                </span>
              </div>
              <Bar value={c.balance} max={c.limit_amount || 1} color={cssVar(color)} height={5} />
              <div className="num" style={{ fontSize: 11, color: cssVar(color), marginTop: 5 }}>
                dùng {Math.round(util * 100)}% hạn mức {short(c.limit_amount)}
                {util > 0.8 && " — nên trả bớt trước ngày sao kê"}
              </div>
            </div>
          </div>
        );
      })}

      {(adding || editing) && (
        <CardForm initial={editing} flash={flash}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); reload(); }} />
      )}
      {paying && (
        <PayCard card={paying} flash={flash}
          onClose={() => setPaying(null)}
          onSaved={() => { setPaying(null); reload(); }} />
      )}
    </div>
  );
}

function CardForm({ initial, onClose, onSaved, flash }) {
  const c = initial || {};
  const [bank, setBank] = useState(c.bank || "");
  const [last4, setLast4] = useState(c.last4 || "");
  const [limitAmount, setLimitAmount] = useState(c.limit_amount ? String(c.limit_amount) : "");
  const [statementDay, setStatementDay] = useState(c.statement_day || 5);
  const [dueDay, setDueDay] = useState(c.due_day || 25);
  const [opening, setOpening] = useState(c.opening ? String(c.opening) : "");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const submit = async () => {
    if (!bank.trim()) return flash("Cần có tên ngân hàng");
    setBusy(true);
    try {
      const body = {
        bank: bank.trim(), last4: last4.replace(/\D/g, "").slice(0, 4),
        limit_amount: Number(limitAmount) || 0,
        statement_day: Number(statementDay), due_day: Number(dueDay),
        opening: Number(opening) || 0,
      };
      if (initial) await api("/cards/" + initial.id, { method: "PUT", body });
      else await api("/cards", { method: "POST", body });
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api("/cards/" + initial.id, { method: "DELETE" });
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  const days = Array.from({ length: 28 }, (_, i) => i + 1);

  return (
    <Sheet title={initial ? "Sửa thẻ" : "Thêm thẻ"} onClose={onClose}>
      <Field label="Ngân hàng">
        <input className="field" value={bank} placeholder="Techcombank, VIB, Sacombank…"
          autoFocus={!initial} onChange={(e) => setBank(e.target.value)} />
      </Field>
      <Field label="4 số cuối" hint="Chỉ để phân biệt các thẻ, không lưu số thẻ đầy đủ">
        <input className="field num" value={last4} inputMode="numeric" maxLength={4}
          style={{ width: 110 }} onChange={(e) => setLast4(e.target.value)} />
      </Field>
      <Field label="Hạn mức">
        <input className="field num" type="number" inputMode="numeric" value={limitAmount}
          onChange={(e) => setLimitAmount(e.target.value)} />
      </Field>
      <div className="grid2" style={{ marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, color: cssVar("--muted"), marginBottom: 8 }}>Ngày sao kê</div>
          <select className="field num" value={statementDay} onChange={(e) => setStatementDay(e.target.value)}>
            {days.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 12, color: cssVar("--muted"), marginBottom: 8 }}>Ngày đến hạn</div>
          <select className="field num" value={dueDay} onChange={(e) => setDueDay(e.target.value)}>
            {days.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <Field label="Dư nợ hiện có" hint="Số đang nợ trước khi bắt đầu dùng app. Để 0 nếu thẻ đang sạch.">
        <input className="field num" type="number" inputMode="numeric" value={opening}
          onChange={(e) => setOpening(e.target.value)} />
      </Field>

      <div className="row" style={{ gap: 12, marginTop: 24 }}>
        <Button kind="ghost" onClick={onClose}>Hủy</Button>
        <Button onClick={submit} disabled={busy || !bank.trim()} style={{ flex: 1 }}>
          {busy ? "Đang lưu…" : initial ? "Cập nhật" : "Thêm thẻ"}
        </Button>
      </div>

      {initial && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          {confirmDel ? (
            <span style={{ fontSize: 13 }}>
              Xóa thẻ? Các khoản chi vẫn giữ nguyên, chỉ bỏ liên kết thẻ.{" "}
              <button onClick={remove} style={{ color: cssVar("--red"), fontWeight: 600 }}>Xóa</button>
              {" · "}
              <button onClick={() => setConfirmDel(false)} style={{ color: cssVar("--muted") }}>Giữ lại</button>
            </span>
          ) : (
            <Button kind="danger" onClick={() => setConfirmDel(true)}>Xóa thẻ</Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function PayCard({ card, onClose, onSaved, flash }) {
  const [amount, setAmount] = useState(String(Math.max(0, card.balance)));
  const [paidDate, setPaidDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const amountNum = Number(amount) || 0;

  useEffect(() => {
    api(`/cards/${card.id}/payments`).then((r) => setHistory(r.payments)).catch(() => {});
  }, [card.id]);

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/cards/${card.id}/pay`, { method: "POST", body: { amount: amountNum, paid_date: paidDate } });
      flash(`Đã trả ${money(amountNum)} cho ${card.bank}`);
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  return (
    <Sheet title={`Trả nợ ${card.bank}`} onClose={onClose}>
      <div className="num" style={{ fontSize: 12, color: cssVar("--muted") }}>Dư nợ hiện tại</div>
      <div className="num" style={{ fontSize: 26, fontWeight: 700, marginBottom: 22 }}>{money(card.balance)}</div>

      <Field label="Số tiền trả">
        <input className="field num" type="number" inputMode="numeric" value={amount} autoFocus
          onChange={(e) => setAmount(e.target.value)} />
        <div className="wrap" style={{ marginTop: 8 }}>
          <button className="num" onClick={() => setAmount(String(Math.max(0, card.balance)))}
            style={{ fontSize: 12, background: cssVar("--chip"), padding: "6px 12px", borderRadius: 99 }}>
            Toàn bộ {short(card.balance)}
          </button>
          <button className="num" onClick={() => setAmount(String(Math.round(card.balance * 0.05)))}
            style={{ fontSize: 12, background: cssVar("--chip"), padding: "6px 12px", borderRadius: 99 }}>
            Tối thiểu 5%
          </button>
        </div>
      </Field>

      <Field label="Ngày trả">
        <input className="field num" type="date" value={paidDate} style={{ width: "auto" }}
          onChange={(e) => setPaidDate(e.target.value)} />
      </Field>

      {history && history.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div className="num label">Đã trả gần đây</div>
          <div style={{ marginTop: 8 }}>
            {history.slice(0, 8).map((p) => (
              <div key={p.id} className="between num" style={{ fontSize: 12, padding: "4px 0", color: cssVar("--muted") }}>
                <span>{p.paid_date}</span>
                <span>{money(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 12, marginTop: 24 }}>
        <Button kind="ghost" onClick={onClose}>Hủy</Button>
        <Button onClick={submit} disabled={busy || amountNum <= 0} style={{ flex: 1 }}>
          {busy ? "Đang lưu…" : "Ghi nhận thanh toán"}
        </Button>
      </div>
    </Sheet>
  );
}
