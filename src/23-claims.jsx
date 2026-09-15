/* ============================ Chờ claim công ty ============================ */

const CLAIM_STATUS = [
  { id: "pending", label: "Chờ claim" },
  { id: "claimed", label: "Đã claim" },
  { id: "rejected", label: "Không được duyệt" },
  { id: "none", label: "Không claim" },
];

function ClaimRow({ t, checked, onToggle, right }) {
  return (
    <div className="tape between" style={{ padding: "11px 0", gap: 10 }}>
      <button onClick={onToggle} aria-pressed={checked} className="row"
        style={{ gap: 12, minWidth: 0, flex: 1, textAlign: "left" }}>
        <span aria-hidden="true" style={{
          width: 20, height: 20, flexShrink: 0, borderRadius: 6, display: "grid", placeItems: "center",
          border: `1.5px solid ${checked ? cssVar("--primary") : cssVar("--muted")}`,
          background: checked ? cssVar("--primary") : "transparent", color: cssVar("--onprimary"),
          fontSize: 13, fontWeight: 700, lineHeight: 1,
        }}>{checked ? "✓" : ""}</span>
        <span style={{ minWidth: 0 }}>
          <span className="truncate" style={{ display: "block", fontSize: 14 }}>
            {t.note || t.category_name || "Khoản chi"}
          </span>
          <span className="num truncate" style={{ display: "block", fontSize: 11, color: cssVar("--muted") }}>
            {DAY_VN(t.date)}, {typeLabel(t.type).toLowerCase()}{t.note && t.category_name ? `, ${t.category_name}` : ""}
          </span>
        </span>
      </button>
      {right || <span className="num" style={{ fontSize: 14, fontWeight: 600, flexShrink: 0 }}>{money(t.amount)}</span>}
    </div>
  );
}

function ClaimsSheet({ onClose, onReceive, onChanged, flash }) {
  const [d, setD] = useState(null);
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api("/claims").then(setD).catch((e) => flash(e.message)),
    [flash]
  );
  useEffect(() => { load(); }, [load]);

  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const selTotal = d ? d.pending.filter((t) => sel.includes(t.id)).reduce((s, t) => s + t.amount, 0) : 0;
  const allOn = d && d.pending.length > 0 && sel.length === d.pending.length;

  const mark = async (ids, status, msg) => {
    setBusy(true);
    try {
      await api("/claims/mark", { method: "POST", body: { ids, status } });
      flash(msg);
      setSel([]);
      await load();
      onChanged();
    } catch (e) {
      flash(e.message);
    }
    setBusy(false);
  };

  return (
    <Sheet title="Chờ claim công ty" onClose={onClose}>
      {!d ? (
        <div className="row" style={{ gap: 8, color: cssVar("--muted"), fontSize: 13 }}><span className="spin" /> Đang tải…</div>
      ) : (
        <>
          <section style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: cssVar("--muted") }}>Công ty còn phải hoàn cho bạn</div>
            <div className="num hero-num" style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-.02em", marginTop: 2 }}>
              {money(d.pending_total)}
            </div>
            <div className="num" style={{ fontSize: 12, color: cssVar("--muted"), marginTop: 4 }}>
              {d.pending.length} khoản tiếp khách, công tác chưa được hoàn
            </div>
          </section>

          {d.pending.length === 0 ? (
            <Empty text="Không có khoản nào đang chờ claim. Khoản chi Tiếp khách hoặc Công tác mới ghi sẽ tự vào đây." />
          ) : (
            <section style={{ marginBottom: 22 }}>
              <SectionLabel right={
                <button onClick={() => setSel(allOn ? [] : d.pending.map((t) => t.id))}
                  style={{ fontSize: 12, color: cssVar("--blue") }}>{allOn ? "Bỏ chọn" : "Chọn tất cả"}</button>
              }>Đang chờ</SectionLabel>
              <div style={{ marginTop: 8 }}>
                {d.pending.map((t) => (
                  <ClaimRow key={t.id} t={t} checked={sel.includes(t.id)} onToggle={() => toggle(t.id)} />
                ))}
              </div>

              {sel.length > 0 && (
                <div className="box" style={{ padding: 14, marginTop: 14 }}>
                  <div className="num" style={{ fontSize: 13, marginBottom: 10 }}>
                    Đã chọn {sel.length} khoản, {money(selTotal)}
                  </div>
                  <Button onClick={() => onReceive(sel, selTotal)} disabled={busy} style={{ width: "100%" }}>
                    Ghi tiền claim đã nhận
                  </Button>
                  <div className="wrap" style={{ marginTop: 10, justifyContent: "center" }}>
                    <Button kind="outline" disabled={busy} style={{ padding: "8px 14px", fontSize: 13 }}
                      onClick={() => mark(sel, "claimed", "Đã đánh dấu đã claim")}>Đã claim, không ghi thu</Button>
                    <Button kind="danger" disabled={busy}
                      onClick={() => mark(sel, "rejected", "Đã đánh dấu không được duyệt")}>Không được duyệt</Button>
                  </div>
                </div>
              )}
            </section>
          )}

          {d.untracked.length > 0 && (
            <section style={{ marginBottom: 22 }}>
              <SectionLabel right={
                <button disabled={busy} style={{ fontSize: 12, color: cssVar("--blue") }}
                  onClick={() => mark(d.untracked.map((t) => t.id), "pending", `Đã đưa ${d.untracked.length} khoản vào chờ claim`)}>
                  Đưa tất cả vào
                </button>
              }>Chưa theo dõi claim</SectionLabel>
              <div style={{ fontSize: 12, color: cssVar("--muted"), marginTop: 6, lineHeight: 1.5 }}>
                Khoản tiếp khách, công tác 90 ngày qua, ghi trước khi có tính năng này. Chạm vào khoản nào công ty chưa hoàn để đưa vào chờ claim.
              </div>
              <div style={{ marginTop: 6 }}>
                {d.untracked.map((t) => (
                  <ClaimRow key={t.id} t={t} checked={false}
                    onToggle={() => !busy && mark([t.id], "pending", "Đã đưa vào chờ claim")} />
                ))}
              </div>
            </section>
          )}

          {d.done.length > 0 && (
            <section style={{ marginBottom: 12 }}>
              <SectionLabel>Đã xử lý gần đây</SectionLabel>
              <div style={{ marginTop: 6 }}>
                {d.done.map((t) => (
                  <div key={t.id} className="tape between" style={{ padding: "11px 0", gap: 10 }}>
                    <span style={{ minWidth: 0 }}>
                      <span className="truncate" style={{ display: "block", fontSize: 14 }}>{t.note || t.category_name || "Khoản chi"}</span>
                      <span className="num truncate" style={{ display: "block", fontSize: 11,
                        color: t.claim_status === "rejected" ? cssVar("--red") : cssVar("--green") }}>
                        {DAY_VN(t.date)}, {t.claim_status === "rejected" ? "không được duyệt" : "đã hoàn"}
                      </span>
                    </span>
                    <span style={{ textAlign: "right", flexShrink: 0 }}>
                      <span className="num" style={{ display: "block", fontSize: 13 }}>{money(t.amount)}</span>
                      <button disabled={busy} onClick={() => mark([t.id], "pending", "Đã đưa lại vào chờ claim")}
                        style={{ fontSize: 11, color: cssVar("--muted") }}>Hoàn tác</button>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </Sheet>
  );
}

/** Chọn các khoản chi mà khoản tiền claim này hoàn lại. Khi sửa, hiện cả các khoản đã gắn. */
function ClaimPicker({ incomeId, value, onChange }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    api("/claims" + (incomeId ? "?income=" + incomeId : ""))
      .then((d) => {
        const seen = new Set();
        const list = [...d.linked, ...d.pending].filter((t) => (seen.has(t.id) ? false : seen.add(t.id)));
        setRows(list);
        if (incomeId) onChange(d.linked.map((t) => t.id), list, true);
      })
      .catch(() => setRows([]));
  }, [incomeId]);

  if (!rows) return null;
  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 12, color: cssVar("--muted"), marginBottom: 18 }}>
        Không có khoản chi nào đang chờ claim để gắn vào.
      </div>
    );
  }
  const toggle = (t) => onChange(value.includes(t.id) ? value.filter((x) => x !== t.id) : [...value, t.id], rows, false);
  return (
    <Field label="Hoàn cho khoản chi" hint="Khoản được chọn sẽ chuyển sang đã claim. Số tiền tự cộng theo khoản chọn, bạn vẫn sửa được nếu công ty duyệt khác.">
      <div>
        {rows.map((t) => <ClaimRow key={t.id} t={t} checked={value.includes(t.id)} onToggle={() => toggle(t)} />)}
      </div>
    </Field>
  );
}
