/* ===== Công cụ sổ đầu tư: đối chiếu, nhập hàng loạt, báo cáo, mốc giá ===== */

/**
 * Đối chiếu sổ với số thật đọc từ app công ty chứng khoán.
 *
 * Luồng cố ý tách hai bước: xem trước rồi mới ghi. Nút ghi chỉ hiện khi máy chủ
 * xác nhận đủ điều kiện — và máy chủ kiểm lại lần nữa lúc ghi, nên bỏ qua giao
 * diện gọi thẳng API cũng không lách được.
 */
function Reconcile({ onClose, onSaved, flash }) {
  const [date, setDate] = useState(todayISO());
  const [cash, setCash] = useState("");
  const [pos, setPos] = useState({});
  const [kind, setKind] = useState("INTEREST");
  const [chk, setChk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [book, setBook] = useState(null);

  useEffect(() => {
    api("/stock/cashflow").then(setBook).catch(() => {});
    api("/portfolio").then((d) => {
      const list = (d.snapshot && d.snapshot.positions) || [];
      setPos(Object.fromEntries(list.map((p) => [p.symbol, String(p.qty)])));
    }).catch(() => {});
  }, []);

  const run = (path) => {
    setBusy(true); setErr("");
    const positions = {};
    for (const [k, v] of Object.entries(pos)) {
      if (String(v).trim() !== "") positions[k] = Number(String(v).replace(/[^\d-]/g, "")) || 0;
    }
    const body = { date, cash: Number(String(cash).replace(/[^\d-]/g, "")), positions, kind };
    return api(path, { method: "POST", body })
      .then((d) => { setChk(d); return d; })
      .catch((e) => { setErr(e.message); throw e; })
      .finally(() => setBusy(false));
  };

  const doApply = () => {
    run("/stock/broker/apply").then((d) => {
      flash(`Đã ghi ${d.da_ghi.type === "INTEREST" ? "lãi vay" : "điều chỉnh"} ${money(d.da_ghi.cash)}`);
      onSaved(); onClose();
    }).catch(() => {});
  };
  const doMark = () => {
    run("/stock/broker/mark").then(() => {
      flash("Đã đóng mốc đối chiếu");
      onSaved(); onClose();
    }).catch(() => {});
  };

  const f = (n) => (n == null ? "—" : money(n));

  return (
    <Sheet title="Đối chiếu với công ty chứng khoán" onClose={onClose}>
      <div className="pad" style={{ paddingTop: 18 }}>
        <p style={{ fontSize: 13, color: cssVar("--muted"), lineHeight: 1.7, marginTop: 0 }}>
          Mở app công ty chứng khoán, đọc số dư tiền và số lượng từng mã rồi nhập vào đây.
          Sổ Chi so với số của mình và chỉ ra chỗ lệch.
        </p>

        {book && (
          <div className="box" style={{ padding: 12, marginBottom: 16 }}>
            <div className="num label">Sổ Chi đang ghi</div>
            <div className="num" style={{ fontSize: 15, marginTop: 4 }}>{f(book.cash)}</div>
            {book.pending_in > 0 && (
              <div className="num" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 3 }}>
                trong đó {short(book.pending_in)} tiền bán chưa về tài khoản
              </div>
            )}
          </div>
        )}

        <Field label="Ngày đối chiếu">
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setChk(null); }} />
        </Field>

        <Field label="Số dư tiền thật (đồng)" hint="Số âm nếu đang dư nợ margin">
          <input inputMode="numeric" value={cash} placeholder="-63395000"
            onChange={(e) => { setCash(e.target.value); setChk(null); }} />
        </Field>

        {Object.keys(pos).length > 0 && (
          <div style={{ marginTop: 4, marginBottom: 8 }}>
            <div className="num label" style={{ marginBottom: 8 }}>Số lượng thật từng mã</div>
            {Object.keys(pos).sort().map((sym) => (
              <div key={sym} className="between" style={{ marginBottom: 8, gap: 12 }}>
                <span className="num" style={{ fontSize: 14, width: 46 }}>{sym}</span>
                <input inputMode="numeric" value={pos[sym]} style={{ flex: 1 }}
                  onChange={(e) => { setPos({ ...pos, [sym]: e.target.value }); setChk(null); }} />
              </div>
            ))}
            <div style={{ fontSize: 11, color: cssVar("--muted"), lineHeight: 1.6 }}>
              Nếu app công ty chứng khoán có mã không nằm trong danh sách này, đừng đối chiếu vội —
              nhập lệnh còn thiếu trước đã.
            </div>
          </div>
        )}

        {err && <div style={{ color: cssVar("--red"), fontSize: 13, marginTop: 12 }}>{err}</div>}

        {chk && !chk.error && (
          <div className="box" style={{ padding: 14, marginTop: 16,
            borderColor: chk.lech === 0 ? cssVar("--green") : chk.tu_ghi_duoc ? cssVar("--amber") : cssVar("--red") }}>
            <div className="between">
              <span style={{ fontSize: 12, color: cssVar("--muted") }}>Chênh lệch</span>
              <span className="num" style={{ fontSize: 18, fontWeight: 600,
                color: chk.lech === 0 ? cssVar("--green") : cssVar("--ink") }}>
                {chk.lech === 0 ? "Khớp" : (chk.lech > 0 ? "+" : "") + money(chk.lech)}
              </span>
            </div>
            <div className="num" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 6 }}>
              sổ {short(chk.tien_so_sach)} · thực tế {short(chk.tien_thuc_te)} ·
              ngưỡng tự ghi {short(chk.nguong)} cho {chk.so_ngay} ngày
            </div>

            {chk.lech_vi_the.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${cssVar("--line")}` }}>
                <div style={{ fontSize: 12, color: cssVar("--red"), marginBottom: 6 }}>Số lượng lệch</div>
                {chk.lech_vi_the.map((d) => (
                  <div key={d.symbol} className="num" style={{ fontSize: 12, marginBottom: 3 }}>
                    {d.symbol}: sổ {d.so_sach} · thực tế {d.thuc_te} ({d.lech > 0 ? "+" : ""}{d.lech})
                  </div>
                ))}
              </div>
            )}

            {chk.ghi_chu && (
              <div style={{ fontSize: 12, color: chk.tu_ghi_duoc ? cssVar("--muted") : cssVar("--red"),
                marginTop: 10, lineHeight: 1.6 }}>
                {chk.ghi_chu}
              </div>
            )}

            {chk.tu_ghi_duoc && (
              <div style={{ marginTop: 12 }}>
                <div className="num label" style={{ marginBottom: 6 }}>Ghi khoản lệch này vào đâu</div>
                <Chips value={kind} onChange={setKind} options={[
                  { id: "INTEREST", label: "Lãi vay & phí" },
                  { id: "DIVIDEND_CASH", label: "Cổ tức" },
                  { id: "ADJUSTMENT", label: "Khác" },
                ]} />
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <Button kind="outline" onClick={() => run("/stock/broker/check")} disabled={busy || !cash}
            style={{ flex: 1 }}>
            {busy ? "Đang xem…" : "Xem chênh lệch"}
          </Button>
          {chk && chk.tu_ghi_duoc && (
            <Button onClick={doApply} disabled={busy} style={{ flex: 1 }}>Ghi bút toán</Button>
          )}
          {chk && chk.lech === 0 && chk.vi_the_khop && (
            <Button onClick={doMark} disabled={busy} style={{ flex: 1 }}>Đóng mốc</Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Nhập nhiều giao dịch bằng cách dán text.
 *
 * Định dạng do Sổ Chi quy định, không phải định dạng tin nhắn của công ty chứng
 * khoán. Luôn xem trước từng dòng rồi mới ghi, và ghi là tất-cả-hoặc-không.
 */
function BatchEntry({ onClose, onSaved, flash }) {
  const [text, setText] = useState("");
  const [prev, setPrev] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const doPreview = () => {
    setBusy(true); setErr("");
    api("/stock/batch/preview", { method: "POST", body: { text } })
      .then(setPrev).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };
  const doCommit = () => {
    setBusy(true); setErr("");
    api("/stock/batch/commit", { method: "POST", body: { text } })
      .then((d) => { flash(`Đã ghi ${d.da_ghi} giao dịch`); onSaved(); onClose(); })
      .catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };

  const ready = prev && prev.loi === 0 && !prev.loi_tong_the && prev.hop_le > 0;

  return (
    <Sheet title="Nhập nhiều giao dịch" onClose={onClose}>
      <div className="pad" style={{ paddingTop: 18 }}>
        <div className="box" style={{ padding: 12, marginBottom: 14 }}>
          <div className="num label">Mỗi dòng một lệnh</div>
          <pre className="num" style={{ fontSize: 12, lineHeight: 1.8, margin: "8px 0 0",
            color: cssVar("--muted"), whiteSpace: "pre-wrap" }}>
{`MUA HCM 5000 25900 13/08
BAN LPB 1000 49400 25/08
NAP 50tr 01/08
RUT 10tr
COTUC 2tr 15/08
LAIVAY 650k 31/08
THUONG CTS 500 20/08`}
          </pre>
          <div style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 10, lineHeight: 1.6 }}>
            Giá nhập theo đồng. Bỏ trống ngày thì lấy hôm nay. Dòng bắt đầu bằng # được bỏ qua.
          </div>
        </div>

        <textarea rows={8} value={text} placeholder="Dán hoặc gõ các lệnh vào đây…"
          onChange={(e) => { setText(e.target.value); setPrev(null); }}
          style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: 13, lineHeight: 1.7 }} />

        {err && <div style={{ color: cssVar("--red"), fontSize: 13, marginTop: 10 }}>{err}</div>}

        {prev && (
          <div style={{ marginTop: 14 }}>
            <div className="num" style={{ fontSize: 12, color: cssVar("--muted"), marginBottom: 8 }}>
              {prev.hop_le} dòng hợp lệ
              {prev.loi > 0 && <span style={{ color: cssVar("--red") }}> · {prev.loi} dòng lỗi</span>}
            </div>
            {prev.rows.map((r) => (
              <div key={r.dong} className="num" style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 4,
                color: r.loi ? cssVar("--red") : cssVar("--ink") }}>
                <span style={{ color: cssVar("--muted") }}>{r.dong}.</span>{" "}
                {r.loi ? `${r.raw} — ${r.loi}` : `${r.tx.type} ${r.tx.symbol || ""} ${r.tx.qty || ""} ${r.tx.priceVND || r.tx.cash || ""} ${r.tx.date}`}
              </div>
            ))}
            {prev.loi_tong_the && (
              <div className="box" style={{ padding: 12, marginTop: 10, borderColor: cssVar("--red") }}>
                <div style={{ fontSize: 12, color: cssVar("--red"), lineHeight: 1.6 }}>
                  Cả lô không ghi được: {prev.loi_tong_the}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <Button kind="outline" onClick={doPreview} disabled={busy || !text.trim()} style={{ flex: 1 }}>
            Xem trước
          </Button>
          {ready && <Button onClick={doCommit} disabled={busy} style={{ flex: 1 }}>Ghi {prev.hop_le} dòng</Button>}
        </div>
      </div>
    </Sheet>
  );
}

/** Báo cáo lãi lỗ đã chốt theo kỳ và theo mã. */
function InvestReport({ onClose }) {
  const [kind, setKind] = useState("month");
  const [data, setData] = useState(null);
  const [bySym, setBySym] = useState(null);
  const [view, setView] = useState("ky");

  useEffect(() => { api(`/stock/report?kind=${kind}`).then(setData).catch(() => {}); }, [kind]);
  useEffect(() => { api("/stock/report/symbols").then(setBySym).catch(() => {}); }, []);

  const plColor = (v) => (v > 0 ? cssVar("--green") : v < 0 ? cssVar("--red") : cssVar("--ink"));
  const sign = (v) => (v > 0 ? "+" : "");

  return (
    <Sheet title="Báo cáo đầu tư" onClose={onClose}>
      <div className="pad" style={{ paddingTop: 18 }}>
        <Chips value={view} onChange={setView} options={[
          { id: "ky", label: "Theo kỳ" }, { id: "ma", label: "Theo mã" },
        ]} />

        <p style={{ fontSize: 12, color: cssVar("--muted"), lineHeight: 1.7, marginTop: 14 }}>
          Chỉ tính phần <b>đã bán xong</b>. Lãi lỗ của cổ phiếu đang giữ không gộp vào đây vì nó
          đổi theo giá từng phút và sẽ làm báo cáo kỳ cũ thay đổi mỗi lần mở lại.
        </p>

        {view === "ky" && (
          <>
            <div style={{ margin: "14px 0" }}>
              <Chips value={kind} onChange={setKind} options={[
                { id: "week", label: "Tuần" }, { id: "month", label: "Tháng" },
                { id: "quarter", label: "Quý" }, { id: "year", label: "Năm" },
              ]} />
            </div>
            {data && data.rows && data.rows.length === 0 && <Empty text="Chưa có giao dịch nào đã chốt." />}
            {data && (data.rows || []).map((r) => (
              <div key={r.ky} className="box" style={{ padding: 14, marginBottom: 10 }}>
                <div className="between">
                  <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>{r.ky}</span>
                  <span className="num" style={{ fontSize: 16, fontWeight: 600, color: plColor(r.lai_da_chot) }}>
                    {sign(r.lai_da_chot)}{short(r.lai_da_chot)}
                  </span>
                </div>
                <div className="num" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 5, lineHeight: 1.7 }}>
                  {r.so_lan_ban > 0
                    ? `${r.so_lan_ban} lần bán · thắng ${r.ty_le_thang.toFixed(0)}% · tỷ suất ${sign(r.ty_suat)}${r.ty_suat.toFixed(2)}%`
                    : "không có lệnh bán"}
                  {r.lai_vay !== 0 && <><br />lãi vay & phí {short(r.lai_vay)}</>}
                  {r.co_tuc !== 0 && <><br />cổ tức {short(r.co_tuc)}</>}
                  {r.dieu_chinh !== 0 && <><br />điều chỉnh {short(r.dieu_chinh)}</>}
                  {(r.nap !== 0 || r.rut !== 0) && <><br />nạp {short(r.nap)} · rút {short(r.rut)}</>}
                </div>
                {(r.lai_vay !== 0 || r.co_tuc !== 0 || r.dieu_chinh !== 0) && (
                  <div className="between" style={{ marginTop: 8, paddingTop: 8,
                    borderTop: `1px solid ${cssVar("--line")}` }}>
                    <span style={{ fontSize: 11, color: cssVar("--muted") }}>Ròng cả kỳ</span>
                    <span className="num" style={{ fontSize: 13, fontWeight: 600, color: plColor(r.rong) }}>
                      {sign(r.rong)}{short(r.rong)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {view === "ma" && (
          <div style={{ marginTop: 14 }}>
            {bySym && bySym.rows && bySym.rows.length === 0 && <Empty text="Chưa bán mã nào." />}
            {bySym && (bySym.rows || []).map((r) => (
              <div key={r.symbol} className="box" style={{ padding: 14, marginBottom: 10 }}>
                <div className="between">
                  <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>{r.symbol}</span>
                  <span className="num" style={{ fontSize: 16, fontWeight: 600, color: plColor(r.lai_da_chot) }}>
                    {sign(r.lai_da_chot)}{short(r.lai_da_chot)}
                  </span>
                </div>
                <div className="num" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 5 }}>
                  {r.so_lan_ban} lần bán · thắng {r.so_lan_ban ? Math.round(r.so_lan_lai / r.so_lan_ban * 100) : 0}%
                  {" · "}tỷ suất {sign(r.ty_suat)}{r.ty_suat.toFixed(2)}%
                  {" · "}giữ trung bình {r.ngay_giu_tb} ngày
                  {r.dang_giu > 0 && ` · còn giữ ${nf.format(r.dang_giu)}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/**
 * Mốc cắt lỗ / chốt lời.
 *
 * Đây là lời nhắc về ngưỡng người dùng tự đặt, không phải khuyến nghị. App
 * không gợi ý mức nào nên đặt và không tự sinh mốc nào.
 */
function PriceAlerts({ onClose, flash }) {
  const [rows, setRows] = useState([]);
  const [held, setHeld] = useState([]);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    api("/stock/alerts").then((d) => setRows(d.rows || [])).catch(() => {});
    api("/portfolio").then((d) => setHeld(((d.snapshot || {}).positions) || [])).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const save = () => {
    setBusy(true); setErr("");
    api("/stock/alerts", { method: "POST", body: {
      symbol: edit.symbol,
      stop: edit.stop === "" ? null : Number(String(edit.stop).replace(/\D/g, "")),
      target: edit.target === "" ? null : Number(String(edit.target).replace(/\D/g, "")),
      note: edit.note || null,
    } })
      .then(() => { flash("Đã lưu mốc"); setEdit(null); load(); })
      .catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };

  const priceOf = (sym) => {
    const p = held.find((x) => x.symbol === sym);
    return p ? p.market_price : null;
  };

  return (
    <Sheet title="Mốc giá theo dõi" onClose={onClose}>
      <div className="pad" style={{ paddingTop: 18 }}>
        <p style={{ fontSize: 12, color: cssVar("--muted"), lineHeight: 1.7, marginTop: 0 }}>
          Mốc do bạn tự đặt. Sổ Chi chỉ nhắc khi giá chạm mốc, không gợi ý nên đặt ở đâu
          và không đưa ra khuyến nghị mua bán.
        </p>

        {held.map((p) => {
          const a = rows.find((r) => r.symbol === p.symbol);
          const px = p.market_price;
          const hitStop = a && a.stop && px && px <= a.stop;
          const hitTarget = a && a.target && px && px >= a.target;
          return (
            <div key={p.symbol} className="box" style={{ padding: 14, marginBottom: 10,
              borderColor: hitStop ? cssVar("--red") : hitTarget ? cssVar("--green") : cssVar("--line") }}>
              <div className="between">
                <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>{p.symbol}</span>
                <button onClick={() => setEdit({ symbol: p.symbol, stop: a && a.stop ? String(a.stop) : "",
                  target: a && a.target ? String(a.target) : "", note: (a && a.note) || "" })}
                  style={{ fontSize: 12, color: cssVar("--blue") }}>
                  {a ? "Sửa" : "Đặt mốc"}
                </button>
              </div>
              <div className="num" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 5, lineHeight: 1.7 }}>
                giá hiện tại {px ? nf.format(px) : "—"}
                {a && a.stop && <><br />cắt lỗ {nf.format(a.stop)}{hitStop && <b style={{ color: cssVar("--red") }}> — đã chạm</b>}</>}
                {a && a.target && <><br />chốt lời {nf.format(a.target)}{hitTarget && <b style={{ color: cssVar("--green") }}> — đã chạm</b>}</>}
                {a && a.note && <><br />{a.note}</>}
                {!a && <><br />chưa đặt mốc nào</>}
              </div>
            </div>
          );
        })}
        {held.length === 0 && <Empty text="Chưa giữ mã nào." />}

        {edit && (
          <Sheet title={`Mốc giá ${edit.symbol}`} onClose={() => setEdit(null)}>
            <div className="pad" style={{ paddingTop: 18 }}>
              <Field label="Cắt lỗ (đồng)" hint="Để trống nếu không đặt">
                <input inputMode="numeric" value={edit.stop} placeholder="24000"
                  onChange={(e) => setEdit({ ...edit, stop: e.target.value })} />
              </Field>
              <Field label="Chốt lời (đồng)" hint="Để trống nếu không đặt">
                <input inputMode="numeric" value={edit.target} placeholder="30000"
                  onChange={(e) => setEdit({ ...edit, target: e.target.value })} />
              </Field>
              <Field label="Ghi chú">
                <input value={edit.note} placeholder="lý do đặt mốc này"
                  onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
              </Field>
              {err && <div style={{ color: cssVar("--red"), fontSize: 13, marginBottom: 10 }}>{err}</div>}
              <div style={{ fontSize: 11, color: cssVar("--muted"), lineHeight: 1.6, marginBottom: 14 }}>
                Xóa cả hai ô rồi lưu để bỏ mốc.
              </div>
              <Button onClick={save} disabled={busy} style={{ width: "100%" }}>
                {busy ? "Đang lưu…" : "Lưu mốc"}
              </Button>
            </div>
          </Sheet>
        )}
      </div>
    </Sheet>
  );
}
