/* ============================ Tài khoản, thu nhập, chuyển tiền ============================ */

const KIND_OF_METHOD = { cash: "cash", bank: "bank", ewallet: "ewallet" };
const fmtDate = (iso) => (iso ? `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}` : "");

/** Tài khoản có thể trừ tiền cho một khoản chi: loại khớp phương thức lên trước, bỏ sổ tiết kiệm. */
function accountsFor(accounts, method) {
  const list = (accounts || []).filter((a) => !a.archived && a.kind !== "saving");
  const kind = KIND_OF_METHOD[method];
  return [...list.filter((a) => a.kind === kind), ...list.filter((a) => a.kind !== kind)];
}

function defaultAccount(accounts, method) {
  const kind = KIND_OF_METHOD[method];
  if (!kind) return "";
  const list = (accounts || []).filter((a) => !a.archived && a.kind === kind);
  const d = list.find((a) => a.is_default) || list[0];
  return d ? d.id : "";
}

function AmountInput({ value, onChange, autoFocus }) {
  const n = Number(value) || 0;
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 12, color: cssVar("--muted") }}>Số tiền</div>
      <div className="row" style={{ alignItems: "baseline", gap: 8, marginTop: 4 }}>
        <input type="number" inputMode="numeric" value={value} placeholder="0" autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)} className="num"
          style={{ flex: 1, width: "100%", fontSize: 34, fontWeight: 700, border: "none",
            background: "transparent", outline: "none", letterSpacing: "-.02em", padding: 0 }} />
        <span className="num" style={{ fontSize: 20, color: cssVar("--muted") }}>₫</span>
      </div>
      <div style={{ height: 1, background: cssVar("--primary"), marginTop: 4 }} />
      <div className="num" style={{ fontSize: 12, color: cssVar("--muted"), marginTop: 8, minHeight: 16 }}>
        {n > 0 && money(n)}
      </div>
    </div>
  );
}

function RowButton({ onClick, children }) {
  return (
    <button onClick={onClick} className="tape between"
      style={{ width: "100%", padding: "12px 0", textAlign: "left", gap: 10 }}>
      {children}
    </button>
  );
}

function Accounts({ data, month, incomes, reload, flash, onAdd, onEditIncome, onOpenClaims }) {
  const accounts = data.accounts || [];
  const active = accounts.filter((a) => !a.archived);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [transfers, setTransfers] = useState([]);
  const [confirmId, setConfirmId] = useState(null);
  const [nav, setNav] = useState(null);

  useEffect(() => {
    api("/transfers?limit=8").then((r) => setTransfers(r.transfers)).catch(() => {});
  }, [data]);

  useEffect(() => {
    api("/portfolio")
      .then((r) => { const n = r.snapshot && r.snapshot.nav; if (typeof n === "number") setNav(n); })
      .catch(() => {});
  }, []);

  const cash = active.reduce((s, a) => s + a.balance, 0);
  const debt = data.cards.reduce((s, c) => s + Math.max(0, c.balance), 0);
  const net = cash + (nav || 0) - debt;
  const monthIncomes = incomes.filter((i) => monthOf(i.date) === month);
  const incomeTotal = monthIncomes.reduce((s, i) => s + i.amount, 0);
  const accName = (id) => (accounts.find((a) => a.id === id) || {}).name || "tài khoản đã xóa";

  const delTransfer = async (t) => {
    try {
      await api("/transfers/" + t.id, { method: "DELETE" });
      flash("Đã xóa lần chuyển tiền");
      setConfirmId(null);
      reload();
    } catch (e) {
      flash(e.message);
    }
  };

  const parts = [`tiền ${short(cash)}`];
  if (nav != null) parts.push(`chứng khoán ${short(nav)}`);

  return (
    <div>
      <div className="pad" style={{ paddingTop: 22 }}>
        <section style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: cssVar("--muted") }}>Tài sản ròng</div>
          <div className="num hero-num" style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-.02em", marginTop: 2,
            color: net < 0 ? cssVar("--red") : cssVar("--ink") }}>
            {money(net)}
          </div>
          <div className="num" style={{ fontSize: 12, color: cssVar("--muted"), marginTop: 4 }}>
            {parts.join(" + ")}{debt > 0 ? ` − nợ thẻ ${short(debt)}` : ""}
          </div>
        </section>

        <section style={{ marginBottom: 26 }}>
          <SectionLabel right={
            <button onClick={() => setAdding(true)} style={{ fontSize: 12, color: cssVar("--blue") }}>+ Tài khoản</button>
          }>Tài khoản</SectionLabel>
          {active.length === 0 ? (
            <Empty text="Chưa có tài khoản nào. Thêm tiền mặt, tài khoản ngân hàng hay sổ tiết kiệm để app tự tính số dư."
              action={<Button onClick={() => setAdding(true)}>Thêm tài khoản</Button>} />
          ) : (
            <div style={{ marginTop: 10 }}>
              {active.map((a) => (
                <RowButton key={a.id} onClick={() => setEditing(a)}>
                  <span style={{ minWidth: 0 }}>
                    <span className="truncate" style={{ display: "block", fontSize: 14, fontWeight: 500 }}>{a.name}</span>
                    <span className="num" style={{ fontSize: 11, color: cssVar("--muted") }}>
                      {kindLabel(a.kind)}
                      {a.is_default ? ", mặc định" : ""}
                      {a.kind === "saving" && a.rate ? `, ${a.rate}%/năm` : ""}
                      {a.kind === "saving" && a.maturity ? `, đáo hạn ${fmtDate(a.maturity)}` : ""}
                    </span>
                  </span>
                  <span style={{ textAlign: "right", flexShrink: 0 }}>
                    <span className="num" style={{ display: "block", fontSize: 15, fontWeight: 600,
                      color: a.balance < 0 ? cssVar("--red") : cssVar("--ink") }}>{money(a.balance)}</span>
                    {a.est_interest ? (
                      <span className="num" style={{ fontSize: 11, color: cssVar("--green") }}>lãi ước tính +{short(a.est_interest)}</span>
                    ) : null}
                  </span>
                </RowButton>
              ))}
            </div>
          )}
          {active.length >= 2 && (
            <Button kind="outline" onClick={() => onAdd("transfer")} style={{ width: "100%", marginTop: 12 }}>
              Chuyển tiền giữa tài khoản
            </Button>
          )}
        </section>

        <section style={{ marginBottom: 26 }}>
          <SectionLabel right={incomeTotal > 0 && (
            <span className="num" style={{ fontSize: 13, fontWeight: 600, color: cssVar("--green") }}>+{short(incomeTotal)}</span>
          )}>Thu nhập {MONTH_VN(month).toLowerCase()}</SectionLabel>
          {monthIncomes.length === 0 ? (
            <Empty text="Chưa ghi khoản thu nào trong tháng này."
              action={<Button onClick={() => onAdd("income")}>Ghi thu nhập</Button>} />
          ) : (
            <div style={{ marginTop: 10 }}>
              {monthIncomes.map((i) => (
                <RowButton key={i.id} onClick={() => onEditIncome(i)}>
                  <span style={{ minWidth: 0 }}>
                    <span className="truncate" style={{ display: "block", fontSize: 14 }}>{i.note || sourceLabel(i.source)}</span>
                    <span className="num truncate" style={{ display: "block", fontSize: 11, color: cssVar("--muted") }}>
                      {DAY_VN(i.date)}, {sourceLabel(i.source).toLowerCase()}
                      {i.account_id ? `, vào ${accName(i.account_id)}` : ""}
                    </span>
                  </span>
                  <span className="num" style={{ fontSize: 14, fontWeight: 600, color: cssVar("--green"), flexShrink: 0 }}>
                    +{money(i.amount)}
                  </span>
                </RowButton>
              ))}
            </div>
          )}
        </section>

        {data.claims && data.claims.count > 0 && (
          <Button kind="outline" onClick={onOpenClaims} style={{ width: "100%", marginTop: -8, marginBottom: 26 }}>
            Chờ claim công ty {short(data.claims.total)}
          </Button>
        )}

        {transfers.length > 0 && (
          <section style={{ marginBottom: 26 }}>
            <SectionLabel>Chuyển tiền gần đây</SectionLabel>
            <div style={{ marginTop: 10 }}>
              {transfers.map((t) => (
                <div key={t.id} className="tape between" style={{ padding: "10px 0", gap: 10 }}>
                  <span style={{ minWidth: 0 }}>
                    <span className="truncate" style={{ display: "block", fontSize: 13 }}>
                      {accName(t.from_account)} sang {accName(t.to_account)}
                    </span>
                    <span className="num truncate" style={{ display: "block", fontSize: 11, color: cssVar("--muted") }}>
                      {DAY_VN(t.date)}{t.note ? `, ${t.note}` : ""}
                    </span>
                  </span>
                  <span className="row" style={{ gap: 12, flexShrink: 0 }}>
                    <span className="num" style={{ fontSize: 13, fontWeight: 500 }}>{short(t.amount)}</span>
                    {confirmId === t.id ? (
                      <button onClick={() => delTransfer(t)} style={{ fontSize: 12, color: cssVar("--red"), fontWeight: 600 }}>
                        Xóa thật
                      </button>
                    ) : (
                      <button onClick={() => setConfirmId(t.id)} style={{ fontSize: 12, color: cssVar("--muted") }}>Xóa</button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${cssVar("--line")}` }}>
        <Cards data={data} reload={reload} flash={flash} />
      </div>

      {(adding || editing) && (
        <AccountForm initial={editing} flash={flash}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function AccountForm({ initial, onClose, onSaved, flash }) {
  const a = initial || {};
  const [name, setName] = useState(a.name || "");
  const [kind, setKind] = useState(a.kind || "bank");
  const [opening, setOpening] = useState(initial ? String(a.opening || 0) : "");
  const [openingDate, setOpeningDate] = useState(a.opening_date || todayISO());
  const [rate, setRate] = useState(a.rate ? String(a.rate) : "");
  const [maturity, setMaturity] = useState(a.maturity || "");
  const [isDefault, setIsDefault] = useState(initial ? Boolean(a.is_default) : true);
  const [note, setNote] = useState(a.note || "");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const submit = async () => {
    if (!name.trim()) return flash("Cần có tên tài khoản");
    setBusy(true);
    try {
      const body = {
        name: name.trim(), kind, opening: Number(opening) || 0, opening_date: openingDate,
        rate: kind === "saving" ? Number(rate) || 0 : 0,
        maturity: kind === "saving" && maturity ? maturity : null,
        is_default: kind !== "saving" && isDefault, note: note.trim(),
      };
      if (initial) await api("/accounts/" + initial.id, { method: "PUT", body });
      else await api("/accounts", { method: "POST", body });
      flash(initial ? "Đã cập nhật tài khoản" : "Đã thêm tài khoản");
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const r = await api("/accounts/" + initial.id, { method: "DELETE" });
      flash(r.message || "Đã xóa tài khoản");
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  const methodWord = { cash: "tiền mặt", bank: "chuyển khoản", ewallet: "ví điện tử" }[kind];

  return (
    <Sheet title={initial ? "Sửa tài khoản" : "Thêm tài khoản"} onClose={onClose}>
      <Field label="Tên">
        <input className="field" value={name} autoFocus={!initial} placeholder="Techcombank lương, Ví tiền mặt, Sổ tiết kiệm VCB…"
          onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Loại">
        <Chips options={ACCOUNT_KINDS} value={kind} onChange={setKind} />
      </Field>
      <Field label="Số dư ban đầu"
        hint="Số dư đầu ngày bắt đầu theo dõi. Thu, chi, chuyển tiền từ ngày đó trở đi sẽ tự cộng trừ vào đây.">
        <input className="field num" type="number" inputMode="numeric" value={opening}
          onChange={(e) => setOpening(e.target.value)} />
        {Number(opening) > 0 && (
          <div className="num" style={{ fontSize: 12, color: cssVar("--muted"), marginTop: 6 }}>{money(Number(opening))}</div>
        )}
      </Field>
      <Field label="Bắt đầu theo dõi từ ngày">
        <input className="field num" type="date" value={openingDate} style={{ width: "auto" }}
          onChange={(e) => setOpeningDate(e.target.value)} />
      </Field>

      {kind === "saving" && (
        <div className="grid2" style={{ marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, color: cssVar("--muted"), marginBottom: 8 }}>Lãi suất %/năm</div>
            <input className="field num" type="number" inputMode="decimal" step="0.01" value={rate}
              onChange={(e) => setRate(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: cssVar("--muted"), marginBottom: 8 }}>Ngày đáo hạn</div>
            <input className="field num" type="date" value={maturity} onChange={(e) => setMaturity(e.target.value)} />
          </div>
        </div>
      )}

      {kind !== "saving" && (
        <Field label="Tài khoản mặc định" hint={`Khoản chi trả bằng ${methodWord} sẽ tự trừ vào tài khoản này.`}>
          <Chips options={[{ id: "yes", label: "Có" }, { id: "no", label: "Không" }]}
            value={isDefault ? "yes" : "no"} onChange={(v) => setIsDefault(v === "yes")} />
        </Field>
      )}

      <Field label="Ghi chú">
        <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="row" style={{ gap: 12, marginTop: 24 }}>
        <Button kind="ghost" onClick={onClose}>Hủy</Button>
        <Button onClick={submit} disabled={busy || !name.trim()} style={{ flex: 1 }}>
          {busy ? "Đang lưu…" : initial ? "Cập nhật" : "Thêm tài khoản"}
        </Button>
      </div>

      {initial && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          {confirmDel ? (
            <span style={{ fontSize: 13 }}>
              Xóa tài khoản? Nếu đã có giao dịch, tài khoản sẽ được ẩn thay vì xóa.{" "}
              <button onClick={remove} style={{ color: cssVar("--red"), fontWeight: 600 }}>Xóa</button>
              {"  "}
              <button onClick={() => setConfirmDel(false)} style={{ color: cssVar("--muted") }}>Giữ lại</button>
            </span>
          ) : (
            <Button kind="danger" onClick={() => setConfirmDel(true)}>Xóa tài khoản</Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function IncomeEntry({ data, initial, prefill, onSwitch, onClose, onDone, flash }) {
  const src = initial || prefill || {};
  const accounts = (data.accounts || []).filter((a) => !a.archived || a.id === src.account_id);
  const firstPick = defaultAccount(accounts, "bank") || (accounts[0] || {}).id || "";
  const [amount, setAmount] = useState(src.amount ? String(src.amount) : "");
  const [source, setSource] = useState(src.source || "salary");
  const [accountId, setAccountId] = useState(initial ? src.account_id || "" : firstPick);
  const [note, setNote] = useState(src.note || "");
  const [date, setDate] = useState(src.date || todayISO());
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [claimIds, setClaimIds] = useState(src.claim_tx_ids || []);
  const [amountTouched, setAmountTouched] = useState(Boolean(initial));
  const amountNum = Number(amount) || 0;

  const onClaimChange = (ids, rows, fromLoad) => {
    setClaimIds(ids);
    if (fromLoad || amountTouched) return;
    const total = rows.filter((r) => ids.includes(r.id)).reduce((s, r) => s + r.amount, 0);
    setAmount(total > 0 ? String(total) : "");
  };

  const submit = async () => {
    if (amountNum <= 0) return;
    setBusy(true);
    try {
      const body = { amount: amountNum, source, account_id: accountId || null, note: note.trim(), date,
        claim_tx_ids: source === "reimburse" ? claimIds : [] };
      if (initial) await api("/incomes/" + initial.id, { method: "PUT", body });
      else await api("/incomes", { method: "POST", body });
      onDone(initial ? "Đã cập nhật khoản thu" : "Đã ghi thu nhập", date);
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api("/incomes/" + initial.id, { method: "DELETE" });
      onDone("Đã xóa khoản thu", null);
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  return (
    <Sheet title={initial ? "Sửa khoản thu" : "Ghi thu nhập"} onClose={onClose}>
      {!initial && <KindSwitch value="income" onChange={onSwitch} />}
      <AmountInput value={amount} onChange={(v) => { setAmount(v); setAmountTouched(true); }} autoFocus={!initial && !prefill} />

      <Field label="Nguồn thu">
        <Chips options={INCOME_SOURCES} value={source} onChange={setSource} />
      </Field>

      {source === "reimburse" && (
        <ClaimPicker incomeId={initial ? initial.id : null} value={claimIds} onChange={onClaimChange} />
      )}

      {accounts.length > 0 ? (
        <Field label="Vào tài khoản">
          <Chips options={[...accounts.map((a) => ({ id: a.id, label: a.name })), { id: "", label: "Không ghi vào tài khoản" }]}
            value={accountId} onChange={setAccountId} />
        </Field>
      ) : (
        <div style={{ fontSize: 12, color: cssVar("--muted"), marginBottom: 18 }}>
          Chưa có tài khoản nào. Thêm ở tab Tài khoản để số dư tự cộng khi có thu nhập.
        </div>
      )}

      <Field label="Ghi chú">
        <input className="field" value={note} placeholder="Lương tháng 9, thưởng quý…"
          onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Field label="Ngày">
        <input className="field num" type="date" value={date} style={{ width: "auto" }}
          onChange={(e) => setDate(e.target.value)} />
      </Field>

      <div className="row" style={{ gap: 12, marginTop: 26 }}>
        <Button kind="ghost" onClick={onClose}>Hủy</Button>
        <Button onClick={submit} disabled={busy || amountNum <= 0} style={{ flex: 1 }}>
          {busy ? "Đang lưu…" : initial ? "Cập nhật" : "Lưu khoản thu"}
        </Button>
      </div>

      {initial && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          {confirmDel ? (
            <span style={{ fontSize: 13 }}>
              Xóa khoản thu này?{" "}
              <button onClick={remove} style={{ color: cssVar("--red"), fontWeight: 600 }}>Xóa</button>
              {"  "}
              <button onClick={() => setConfirmDel(false)} style={{ color: cssVar("--muted") }}>Giữ lại</button>
            </span>
          ) : (
            <Button kind="danger" onClick={() => setConfirmDel(true)}>Xóa khoản thu</Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function TransferEntry({ data, onSwitch, onClose, onDone, flash }) {
  const accounts = (data.accounts || []).filter((a) => !a.archived);
  const first = defaultAccount(accounts, "bank") || (accounts[0] || {}).id || "";
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(() => (accounts.find((a) => a.id !== first) || {}).id || "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const amountNum = Number(amount) || 0;

  const submit = async () => {
    setBusy(true);
    try {
      await api("/transfers", { method: "POST", body: { from_account: from, to_account: to, amount: amountNum, note: note.trim(), date } });
      onDone("Đã ghi chuyển tiền", date);
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };

  return (
    <Sheet title="Chuyển tiền" onClose={onClose}>
      <KindSwitch value="transfer" onChange={onSwitch} />
      {accounts.length < 2 ? (
        <Empty text="Cần ít nhất 2 tài khoản để chuyển tiền. Thêm tài khoản ở tab Tài khoản." />
      ) : (
        <>
          <AmountInput value={amount} onChange={setAmount} autoFocus />
          <Field label="Từ tài khoản">
            <Chips options={accounts.map((a) => ({ id: a.id, label: `${a.name} ${short(a.balance)}` }))}
              value={from} onChange={(v) => { setFrom(v); if (v === to) setTo(""); }} />
          </Field>
          <Field label="Sang tài khoản"
            hint="Rút tiền mặt, gửi tiết kiệm, nạp ví đều ghi ở đây. Chuyển tiền không tính là thu hay chi.">
            <Chips options={accounts.filter((a) => a.id !== from).map((a) => ({ id: a.id, label: a.name }))}
              value={to} onChange={setTo} />
          </Field>
          <Field label="Ghi chú">
            <input className="field" value={note} placeholder="Rút ATM, gửi tiết kiệm 6 tháng…"
              onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Field label="Ngày">
            <input className="field num" type="date" value={date} style={{ width: "auto" }}
              onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div className="row" style={{ gap: 12, marginTop: 26 }}>
            <Button kind="ghost" onClick={onClose}>Hủy</Button>
            <Button onClick={submit} disabled={busy || amountNum <= 0 || !from || !to} style={{ flex: 1 }}>
              {busy ? "Đang lưu…" : "Ghi chuyển tiền"}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
