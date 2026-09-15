/* ============================ Kế hoạch tiền: định kỳ, mục tiêu, tài sản ròng, đối soát, dòng tiền ============================ */

const mutedText = { fontSize: 12, color: "var(--muted)", lineHeight: 1.5 };

function IncomeRulesSection({ data, reload, flash, onReceive }) {
  const [rules, setRules] = useState([]);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    api("/income-rules").then((r) => setRules(r.rules)).catch(() => {});
  }, [data]);

  return (
    <section style={{ marginBottom: 26 }}>
      <SectionLabel right={
        <button onClick={() => setEditing({})} style={{ fontSize: 12, color: cssVar("--blue") }}>+ Định kỳ</button>
      }>Thu nhập định kỳ</SectionLabel>
      {rules.length === 0 ? (
        <div style={{ ...mutedText, marginTop: 10 }}>
          Thêm lương hay khoản thu hằng tháng để app nhắc khi tới ngày và ghi bằng một chạm.
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {rules.map((r) => (
            <div key={r.id} className="tape between" style={{ padding: "11px 0", gap: 10 }}>
              <button onClick={() => setEditing(r)} style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                <span className="truncate" style={{ display: "block", fontSize: 14 }}>{r.name}</span>
                <span className="num" style={{ fontSize: 11,
                  color: r.active && r.days_left <= 0 ? cssVar("--amber") : cssVar("--muted") }}>
                  {!r.active ? "tạm dừng"
                    : r.days_left < 0 ? `trễ ${-r.days_left} ngày so với ngày ${r.day}`
                    : r.days_left === 0 ? "dự kiến nhận hôm nay"
                    : `ngày ${r.day} hằng tháng, còn ${r.days_left} ngày`}
                </span>
              </button>
              <span className="row" style={{ gap: 10, flexShrink: 0 }}>
                <span className="num" style={{ fontSize: 13, fontWeight: 500 }}>{short(r.amount)}</span>
                {r.active && r.days_left <= 3 ? (
                  <Button kind="outline" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => onReceive(r)}>Đã nhận</Button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <RuleForm initial={editing.id ? editing : null} data={data} flash={flash}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </section>
  );
}

function RuleForm({ initial, data, onClose, onSaved, flash }) {
  const r = initial || {};
  const accounts = (data.accounts || []).filter((a) => !a.archived || a.id === r.account_id);
  const [name, setName] = useState(r.name || "Lương");
  const [amount, setAmount] = useState(r.amount ? String(r.amount) : "");
  const [source, setSource] = useState(r.source || "salary");
  const [day, setDay] = useState(r.day || 5);
  const [accountId, setAccountId] = useState(initial ? r.account_id || "" : defaultAccount(accounts, "bank"));
  const [active, setActive] = useState(initial ? Boolean(r.active) : true);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const body = { name: name.trim(), amount: Number(amount) || 0, source, day: Number(day), account_id: accountId || null, active };
      if (initial) await api("/income-rules/" + initial.id, { method: "PUT", body });
      else await api("/income-rules", { method: "POST", body });
      flash(initial ? "Đã cập nhật khoản thu định kỳ" : "Đã thêm khoản thu định kỳ");
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api("/income-rules/" + initial.id, { method: "DELETE" });
      flash("Đã xóa khoản thu định kỳ");
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  const days = Array.from({ length: 28 }, (_, i) => i + 1);

  return (
    <Sheet title={initial ? "Sửa thu nhập định kỳ" : "Thu nhập định kỳ"} onClose={onClose}>
      <Field label="Tên">
        <input className="field" value={name} placeholder="Lương MSI, tiền cho thuê nhà…" onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Số tiền dự kiến" hint="Khi tiền về, bạn sửa được số thực nhận trước khi lưu.">
        <input className="field num" type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        {Number(amount) > 0 && <div className="num" style={{ fontSize: 12, color: cssVar("--muted"), marginTop: 6 }}>{money(Number(amount))}</div>}
      </Field>
      <Field label="Nguồn thu">
        <Chips options={INCOME_SOURCES} value={source} onChange={setSource} />
      </Field>
      <Field label="Ngày nhận hằng tháng">
        <select className="field num" value={day} style={{ width: 110 }} onChange={(e) => setDay(e.target.value)}>
          {days.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </Field>
      {accounts.length > 0 && (
        <Field label="Vào tài khoản">
          <Chips options={[...accounts.map((a) => ({ id: a.id, label: a.name })), { id: "", label: "Không ghi vào tài khoản" }]}
            value={accountId} onChange={setAccountId} />
        </Field>
      )}
      {initial && (
        <Field label="Trạng thái">
          <Chips options={[{ id: "on", label: "Đang dùng" }, { id: "off", label: "Tạm dừng" }]}
            value={active ? "on" : "off"} onChange={(v) => setActive(v === "on")} />
        </Field>
      )}
      <div className="row" style={{ gap: 12, marginTop: 24 }}>
        <Button kind="ghost" onClick={onClose}>Hủy</Button>
        <Button onClick={submit} disabled={busy || !(Number(amount) > 0) || !name.trim()} style={{ flex: 1 }}>
          {busy ? "Đang lưu…" : initial ? "Cập nhật" : "Thêm khoản định kỳ"}
        </Button>
      </div>
      {initial && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          {confirmDel ? (
            <span style={{ fontSize: 13 }}>
              Xóa? Các khoản thu đã ghi vẫn giữ nguyên.{" "}
              <button onClick={remove} style={{ color: cssVar("--red"), fontWeight: 600 }}>Xóa</button>
              {"  "}
              <button onClick={() => setConfirmDel(false)} style={{ color: cssVar("--muted") }}>Giữ lại</button>
            </span>
          ) : (
            <Button kind="danger" onClick={() => setConfirmDel(true)}>Xóa khoản định kỳ</Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function GoalsSection({ data, reload, flash }) {
  const [goals, setGoals] = useState([]);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    api("/goals").then((r) => setGoals(r.goals)).catch(() => {});
  }, [data]);

  return (
    <section style={{ marginBottom: 26 }}>
      <SectionLabel right={
        <button onClick={() => setEditing({})} style={{ fontSize: 12, color: cssVar("--blue") }}>+ Mục tiêu</button>
      }>Mục tiêu tiết kiệm</SectionLabel>
      {goals.length === 0 ? (
        <div style={{ ...mutedText, marginTop: 10 }}>
          Đặt mục tiêu như quỹ dự phòng, mua xe, du lịch. Gắn với một tài khoản thì tiến độ tự chạy theo số dư.
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {goals.map((g) => (
            <button key={g.id} onClick={() => setEditing(g)} className="tape"
              style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 0" }}>
              <div className="between" style={{ gap: 10 }}>
                <span className="truncate" style={{ fontSize: 14, fontWeight: 500 }}>{g.name}</span>
                <span className="num" style={{ fontSize: 13, flexShrink: 0 }}>{short(g.current)} / {short(g.target)}</span>
              </div>
              <div style={{ margin: "8px 0 6px" }}>
                <Bar value={g.current} max={g.target || 1} color={g.pct >= 1 ? cssVar("--green") : cssVar("--primary")} height={4} />
              </div>
              <div className="num" style={{ fontSize: 11, color: cssVar("--muted") }}>
                {Math.round(g.pct * 100)}%
                {g.account_name ? `, theo số dư ${g.account_name}` : ""}
                {g.pct >= 1 ? ", đã đạt"
                  : g.months_left > 0 ? `, cần thêm ${short(g.monthly_needed)}/tháng, còn ${g.months_left} tháng`
                  : g.deadline ? `, hạn ${fmtDate(g.deadline)}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
      {editing && (
        <GoalForm initial={editing.id ? editing : null} data={data} flash={flash}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </section>
  );
}

function GoalForm({ initial, data, onClose, onSaved, flash }) {
  const g = initial || {};
  const accounts = (data.accounts || []).filter((a) => !a.archived || a.id === g.account_id);
  const [name, setName] = useState(g.name || "");
  const [target, setTarget] = useState(g.target ? String(g.target) : "");
  const [deadline, setDeadline] = useState(g.deadline || "");
  const [accountId, setAccountId] = useState(g.account_id || "");
  const [saved, setSaved] = useState(g.saved ? String(g.saved) : "");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const body = { name: name.trim(), target: Number(target) || 0, deadline: deadline || null,
        account_id: accountId || null, saved: accountId ? 0 : Number(saved) || 0 };
      if (initial) await api("/goals/" + initial.id, { method: "PUT", body });
      else await api("/goals", { method: "POST", body });
      flash(initial ? "Đã cập nhật mục tiêu" : "Đã thêm mục tiêu");
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api("/goals/" + initial.id, { method: "DELETE" });
      flash("Đã xóa mục tiêu");
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  return (
    <Sheet title={initial ? "Sửa mục tiêu" : "Mục tiêu tiết kiệm"} onClose={onClose}>
      <Field label="Tên mục tiêu">
        <input className="field" value={name} autoFocus={!initial} placeholder="Quỹ dự phòng 6 tháng, đổi xe…"
          onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Số tiền cần có">
        <input className="field num" type="number" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
        {Number(target) > 0 && <div className="num" style={{ fontSize: 12, color: cssVar("--muted"), marginTop: 6 }}>{money(Number(target))}</div>}
      </Field>
      <Field label="Hạn hoàn thành" hint="Để trống nếu không có hạn. Có hạn thì app tính cần để dành bao nhiêu mỗi tháng.">
        <input className="field num" type="date" value={deadline} style={{ width: "auto" }} onChange={(e) => setDeadline(e.target.value)} />
      </Field>
      {accounts.length > 0 && (
        <Field label="Theo dõi bằng">
          <Chips options={[...accounts.map((a) => ({ id: a.id, label: a.name })), { id: "", label: "Tự nhập số đã có" }]}
            value={accountId} onChange={setAccountId} />
        </Field>
      )}
      {!accountId && (
        <Field label="Đã để dành được">
          <input className="field num" type="number" inputMode="numeric" value={saved} onChange={(e) => setSaved(e.target.value)} />
        </Field>
      )}
      <div className="row" style={{ gap: 12, marginTop: 24 }}>
        <Button kind="ghost" onClick={onClose}>Hủy</Button>
        <Button onClick={submit} disabled={busy || !name.trim() || !(Number(target) > 0)} style={{ flex: 1 }}>
          {busy ? "Đang lưu…" : initial ? "Cập nhật" : "Thêm mục tiêu"}
        </Button>
      </div>
      {initial && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          {confirmDel ? (
            <span style={{ fontSize: 13 }}>
              Xóa mục tiêu này?{" "}
              <button onClick={remove} style={{ color: cssVar("--red"), fontWeight: 600 }}>Xóa</button>
              {"  "}
              <button onClick={() => setConfirmDel(false)} style={{ color: cssVar("--muted") }}>Giữ lại</button>
            </span>
          ) : (
            <Button kind="danger" onClick={() => setConfirmDel(true)}>Xóa mục tiêu</Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function NetworthTrend({ refreshKey }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api("/networth").then((r) => setRows(r.months)).catch(() => setRows([]));
  }, [refreshKey]);

  if (!rows) return null;
  if (rows.length < 2) {
    return (
      <div style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 8 }}>
        App lưu mỗi ngày một mốc tài sản ròng. Biểu đồ theo tháng sẽ hiện khi có từ 2 tháng dữ liệu.
      </div>
    );
  }
  const max = Math.max(...rows.map((r) => Math.max(0, r.net)), 1);
  return (
    <div className="row" style={{ alignItems: "flex-end", gap: 6, height: 72, marginTop: 14 }}>
      {rows.map((r, i) => (
        <div key={r.date} title={`${fmtDate(r.date)}: ${money(r.net)}`}
          style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
          <div style={{ height: Math.max(3, (Math.max(0, r.net) / max) * 52), borderRadius: "3px 3px 0 0",
            background: i === rows.length - 1 ? cssVar("--primary") : cssVar("--track") }} />
          <div className="num" style={{ fontSize: 10, marginTop: 5, color: cssVar("--muted"), textAlign: "center" }}>
            T{Number(r.date.slice(5, 7))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReconcileBox({ account, flash, onDone }) {
  const [actual, setActual] = useState("");
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState([]);

  useEffect(() => {
    api(`/accounts/${account.id}/adjustments`).then((r) => setHist(r.adjustments)).catch(() => {});
  }, [account.id]);

  const diff = actual === "" ? null : Number(actual) - account.balance;

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api(`/accounts/${account.id}/reconcile`, { method: "POST", body: { actual: Number(actual) } });
      flash(r.diff === 0 ? "Số dư khớp, không cần điều chỉnh" : `Đã điều chỉnh ${r.diff > 0 ? "+" : "−"}${money(Math.abs(r.diff))}`);
      onDone();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="box" style={{ padding: 14, marginBottom: 22 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Đối soát số dư</div>
      <div className="num" style={{ fontSize: 12, color: cssVar("--muted"), marginTop: 4 }}>
        Trong app: {money(account.balance)}
      </div>
      <input className="field num" type="number" inputMode="numeric" value={actual}
        placeholder="Số dư thực tế đang thấy ở ngân hàng, ví"
        onChange={(e) => setActual(e.target.value)} style={{ marginTop: 10 }} />
      {diff != null && (
        <div className="num" style={{ fontSize: 12, marginTop: 6, color: diff === 0 ? cssVar("--green") : cssVar("--amber") }}>
          {diff === 0 ? "Khớp với app" : `Chênh ${diff > 0 ? "+" : "−"}${money(Math.abs(diff))}. App ghi một khoản điều chỉnh, không tính là thu hay chi.`}
        </div>
      )}
      <Button kind="outline" onClick={submit} disabled={busy || actual === ""} style={{ width: "100%", marginTop: 10 }}>
        {busy ? "Đang đối soát…" : "Đối soát"}
      </Button>
      {hist.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {hist.slice(0, 5).map((h) => (
            <div key={h.id} className="between num" style={{ fontSize: 11, color: cssVar("--muted"), padding: "3px 0" }}>
              <span>Điều chỉnh {fmtDate(h.date)}</span>
              <span>{h.amount > 0 ? "+" : "−"}{money(Math.abs(h.amount))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CashflowReport({ month, setMonth }) {
  const [cf, setCf] = useState(null);
  useEffect(() => {
    api(`/cashflow?months=12&month=${month}`).then(setCf).catch(() => setCf(null));
  }, [month]);

  if (!cf || !cf.months.some((m) => m.income > 0)) return null;
  const max = Math.max(...cf.months.map((m) => Math.max(m.income, m.expense)), 1);
  const cur = cf.months.find((m) => m.ym === month);
  const srcMax = Math.max(...cf.by_source.map((s) => s.total), 1);

  return (
    <section style={{ marginBottom: 30 }}>
      <SectionLabel>Thu và chi 12 tháng</SectionLabel>
      {cur && (
        <div className="grid4" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: cssVar("--muted") }}>Thu</div>
            <div className="num" style={{ fontSize: 16, fontWeight: 600, color: cssVar("--green") }}>+{short(cur.income)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: cssVar("--muted") }}>Chi</div>
            <div className="num" style={{ fontSize: 16, fontWeight: 600 }}>{short(cur.expense)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: cssVar("--muted") }}>Còn lại</div>
            <div className="num" style={{ fontSize: 16, fontWeight: 600, color: cur.net < 0 ? cssVar("--red") : cssVar("--ink") }}>
              {cur.net < 0 ? "−" : ""}{short(Math.abs(cur.net))}
            </div>
          </div>
        </div>
      )}
      <div className="row" style={{ alignItems: "flex-end", gap: 4, height: 110, marginTop: 16 }}>
        {cf.months.map((m) => (
          <button key={m.ym} onClick={() => setMonth(m.ym)} title={`${MONTH_VN(m.ym)}: thu ${money(m.income)}, chi ${money(m.expense)}`}
            style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
            <div className="row" style={{ alignItems: "flex-end", gap: 2, height: 86 }}>
              <div style={{ flex: 1, height: Math.max(m.income > 0 ? 3 : 1, (m.income / max) * 86), background: cssVar("--green"),
                opacity: m.ym === month ? 1 : 0.55, borderRadius: "2px 2px 0 0" }} />
              <div style={{ flex: 1, height: Math.max(m.expense > 0 ? 3 : 1, (m.expense / max) * 86),
                background: m.ym === month ? cssVar("--primary") : cssVar("--track"), borderRadius: "2px 2px 0 0" }} />
            </div>
            <div className="num" style={{ fontSize: 9, marginTop: 5, color: m.ym === month ? cssVar("--ink") : cssVar("--muted") }}>
              {Number(m.ym.slice(5))}
            </div>
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 14, marginTop: 8, fontSize: 11, color: cssVar("--muted") }}>
        <span className="row" style={{ gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: cssVar("--green") }} />Thu</span>
        <span className="row" style={{ gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: cssVar("--primary") }} />Chi</span>
      </div>
      {cf.by_source.length > 0 && (
        <div style={{ marginTop: 18 }}>
          {cf.by_source.map((s) => (
            <div key={s.source} style={{ marginBottom: 10 }}>
              <div className="between" style={{ fontSize: 13, marginBottom: 5 }}>
                <span>{sourceLabel(s.source)}</span>
                <span className="num">{money(s.total)}</span>
              </div>
              <Bar value={s.total} max={srcMax} color={cssVar("--green")} height={3} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
