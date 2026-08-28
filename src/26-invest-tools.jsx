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
          <div className="num label">Dán tin nhắn TCBS, hoặc gõ lệnh — mỗi dòng một giao dịch</div>
          <pre className="num" style={{ fontSize: 12, lineHeight: 1.7, margin: "8px 0 0",
            color: cssVar("--muted"), whiteSpace: "pre-wrap" }}>
{`13/08/2026 - TK 105C110678 - Tiểu khoản Ký quỹ:
Đặt mua 5,000 HCM giá 25,950. Đã khớp 5,000 giá 25,950`}
          </pre>
          <div style={{ fontSize: 11, color: cssVar("--muted"), margin: "10px 0", lineHeight: 1.6 }}>
            Tin nhắn chỉ lấy phần <b>đã khớp</b>, bỏ qua lệnh chờ và lệnh hủy. Số tài khoản
            không được lưu lại. Dán nhiều tin cùng lúc cũng được.
          </div>
          <div className="num label" style={{ marginTop: 12 }}>Hoặc gõ tay</div>
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
              {prev.canh_bao > 0 && <span style={{ color: cssVar("--amber") }}> · {prev.canh_bao} dòng nghi trùng</span>}
            </div>
            {prev.rows.map((r) => (
              <div key={r.dong} className="num" style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 4,
                color: r.loi ? cssVar("--red") : cssVar("--ink") }}>
                <span style={{ color: cssVar("--muted") }}>{r.dong}.</span>{" "}
                {r.loi ? `${r.raw} — ${r.loi}` : `${r.tx.type} ${r.tx.symbol || ""} ${r.tx.qty || ""} ${r.tx.priceVND || r.tx.cash || ""} ${r.tx.date}`}
                {r.tu_tcbs && !r.loi && <span style={{ color: cssVar("--muted") }}>{"  · từ tin nhắn"}</span>}
                {r.ghi_chu && <span style={{ color: cssVar("--amber") }}>{"  " + r.ghi_chu}</span>}
                {r.canh_bao && <span style={{ color: cssVar("--amber") }}>{"  ⚠ " + r.canh_bao}</span>}
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

/**
 * Phân tích danh mục: thời gian nắm giữ, lãi vay ước tính, phiên khối lượng lạ.
 */
function InvestAnalysis({ onClose, flash }) {
  const [hold, setHold] = useState(null);
  const [mi, setMi] = useState(null);
  const [unusual, setUnusual] = useState(null);
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [fees, setFees] = useState(null);
  const [feePrev, setFeePrev] = useState(null);
  const [feeErr, setFeeErr] = useState("");

  const load = useCallback(() => {
    api("/stock/holding").then(setHold).catch(() => {});
    api("/stock/margin-interest").then((d) => { setMi(d); setRate(String(d.lai_suat_nam)); }).catch(() => {});
    api("/stock/unusual").then(setUnusual).catch((e) => setUnusual({ ok: false, error: e.message }));
    api("/stock/settings").then((d) => setFees({
      fee_buy_pct: String(d.fee_buy_pct), fee_sell_pct: String(d.fee_sell_pct),
      fee_tax_pct: String(d.fee_tax_pct),
    })).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const saveRate = () => {
    setSaving(true);
    api("/stock/settings", { method: "POST", body: { margin_rate_year: Number(rate) } })
      .then(() => { flash("Đã lưu lãi suất"); load(); })
      .catch((e) => flash(e.message)).finally(() => setSaving(false));
  };

  const HUONG = {
    ben_mua_manh: { t: "đóng cửa gần đỉnh ngày", c: "--green" },
    ben_ban_manh: { t: "đóng cửa gần đáy ngày", c: "--red" },
    khong_ro: { t: "đóng cửa giữa biên độ", c: "--muted" },
  };

  return (
    <Sheet title="Phân tích danh mục" onClose={onClose}>
      <div className="pad" style={{ paddingTop: 18 }}>

        <div className="num label">Lãi vay margin ước tính</div>
        {mi && (
          <div className="box" style={{ padding: 14, marginTop: 8, marginBottom: 8 }}>
            <div className="num" style={{ fontSize: 22, fontWeight: 700, color: cssVar("--red") }}>
              {money(mi.uoc_tinh)}
            </div>
            <div className="num" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 6, lineHeight: 1.7 }}>
              {mi.tu_ngay} → {mi.den_ngay} · {mi.so_ngay_vay} ngày có dư nợ
              <br />dư nợ cao nhất {short(mi.du_no_cao_nhat)} ngày {mi.ngay_du_no_cao_nhat}
              {mi.moc_doi_chieu_truoc
                ? <><br />tính từ mốc đối chiếu {mi.moc_doi_chieu_truoc}</>
                : <><br />chưa có mốc đối chiếu nào</>}
              {mi.bo_qua_truoc_khoi_tao && (
                <><br /><span style={{ color: cssVar("--amber") }}>
                  không tính giai đoạn trước ngày khởi tạo sổ ({mi.ngay_khoi_tao}) — sổ không có
                  thông tin dư nợ của giai đoạn đó
                </span></>
              )}
            </div>
            <div className="between" style={{ marginTop: 12, gap: 8 }}>
              <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)}
                style={{ flex: 1 }} placeholder="14.6" />
              <span style={{ fontSize: 12, color: cssVar("--muted") }}>%/năm ước chừng</span>
              <Button kind="outline" onClick={saveRate} disabled={saving}
                style={{ padding: "6px 12px", fontSize: 12 }}>Lưu</Button>
            </div>
          </div>
        )}
        <p style={{ fontSize: 11, color: cssVar("--muted"), lineHeight: 1.7, marginTop: 0, marginBottom: 24 }}>
          Con số <b>ước chừng</b>, không phải số công ty chứng khoán thu. Lãi suất thay đổi liên tục
          theo gói và theo thời điểm, lại còn phí ứng trước tiền bán không nằm trong sổ — nên đừng
          mất công tìm cho ra con số chính xác, để mức áng chừng là đủ. Số thật lấy được khi đối
          chiếu; cái này chỉ để biết trước khoảng bao nhiêu và để thấy số đối chiếu có hợp lý không.
        </p>

        <div className="num label">Biểu phí</div>
        {fees && (
          <div className="box" style={{ padding: 14, marginTop: 8, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              {[["fee_buy_pct", "Mua"], ["fee_sell_pct", "Bán"], ["fee_tax_pct", "Thuế bán"]].map(([k, ten]) => (
                <div key={k} style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: cssVar("--muted"), marginBottom: 4 }}>{ten} %</div>
                  <input inputMode="decimal" value={fees[k]} style={{ width: "100%" }}
                    onChange={(e) => { setFees({ ...fees, [k]: e.target.value }); setFeePrev(null); }} />
                </div>
              ))}
            </div>

            {feePrev && feePrev.rows && (
              <div style={{ marginTop: 4, paddingTop: 10, borderTop: `1px solid ${cssVar("--line")}` }}>
                <div style={{ fontSize: 11, color: cssVar("--muted"), marginBottom: 6 }}>
                  Giá vốn sẽ đổi thành
                </div>
                {feePrev.rows.map((r) => (
                  <div key={r.symbol} className="num between" style={{ fontSize: 12, marginBottom: 4 }}>
                    <span>{r.symbol}</span>
                    <span>
                      <span style={{ color: cssVar("--muted") }}>{nf.format(r.von_cu)}</span>
                      {" → "}
                      <b>{nf.format(r.von_moi)}</b>
                    </span>
                  </div>
                ))}
                {feePrev.lech_tien_mat !== 0 && (
                  <div className="num" style={{ fontSize: 11, color: cssVar("--amber"), marginTop: 6 }}>
                    tiền mặt đổi {feePrev.lech_tien_mat > 0 ? "+" : ""}{money(feePrev.lech_tien_mat)}
                  </div>
                )}
              </div>
            )}

            {feeErr && <div style={{ color: cssVar("--red"), fontSize: 12, marginTop: 8 }}>{feeErr}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Button kind="outline" style={{ flex: 1, padding: "6px 12px", fontSize: 12 }}
                onClick={() => {
                  setFeeErr("");
                  api("/stock/settings/preview", { method: "POST", body: {
                    fee_buy_pct: Number(fees.fee_buy_pct), fee_sell_pct: Number(fees.fee_sell_pct),
                    fee_tax_pct: Number(fees.fee_tax_pct),
                  } }).then(setFeePrev).catch((e) => setFeeErr(e.message));
                }}>Xem trước</Button>
              {feePrev && (
                <Button style={{ flex: 1, padding: "6px 12px", fontSize: 12 }}
                  onClick={() => {
                    api("/stock/settings", { method: "POST", body: {
                      fee_buy_pct: Number(fees.fee_buy_pct), fee_sell_pct: Number(fees.fee_sell_pct),
                      fee_tax_pct: Number(fees.fee_tax_pct),
                    } }).then(() => { flash("Đã lưu biểu phí"); setFeePrev(null); load(); })
                      .catch((e) => setFeeErr(e.message));
                  }}>Lưu biểu phí</Button>
              )}
            </div>
          </div>
        )}
        <p style={{ fontSize: 11, color: cssVar("--muted"), lineHeight: 1.7, marginTop: 0, marginBottom: 24 }}>
          Phí mua nằm trong giá vốn, nên đổi số ở đây là đổi giá vốn của <b>mọi lệnh mua đã ghi</b>,
          kể cả lệnh từ nhiều tháng trước. Đó là đúng — sổ luôn tính lại từ đầu nên không có chuyện
          hai lệnh cùng loại chịu hai mức phí khác nhau — nhưng nên bấm Xem trước để thấy con số mới
          rồi hãy lưu.
        </p>

        <div className="num label">Thời gian nắm giữ</div>
        <div style={{ marginTop: 8, marginBottom: 24 }}>
          {hold && (hold.rows || []).map((r) => (
            <div key={r.symbol} className="box" style={{ padding: 14, marginBottom: 10 }}>
              <div className="between">
                <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>{r.symbol}</span>
                <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>{r.so_ngay_binh_quan} ngày</span>
              </div>
              <div className="num" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 5, lineHeight: 1.7 }}>
                {nf.format(r.qty)} cp · {r.so_lo} lô
                <br />lô cũ nhất {r.lo_cu_nhat} ({r.so_ngay_lo_cu_nhat} ngày)
                {r.so_lo > 1 && <> · lô mới nhất {r.lo_moi_nhat}</>}
              </div>
              {r.so_lo > 1 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${cssVar("--line")}` }}>
                  {r.lots.map((l, i) => (
                    <div key={i} className="num" style={{ fontSize: 11, color: cssVar("--muted"), marginBottom: 2 }}>
                      {l.ngay_mua} · {nf.format(l.qty)} cp · {l.so_ngay} ngày
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {hold && (hold.rows || []).length === 0 && <Empty text="Chưa giữ mã nào." />}
          <div style={{ fontSize: 11, color: cssVar("--muted"), lineHeight: 1.6 }}>
            Số ngày bình quân tính theo khối lượng từng lô, không lấy lô cũ nhất — mua thêm nhiều
            đè lên một ít cổ giữ lâu thì con số phải phản ánh phần lớn.
          </div>
        </div>

        <div className="num label">Phiên khối lượng bất thường</div>
        <div style={{ marginTop: 8 }}>
          {unusual && unusual.ok === false && (
            <div className="box" style={{ padding: 12, borderColor: cssVar("--amber") }}>
              <div style={{ fontSize: 12, color: cssVar("--amber") }}>{unusual.error}</div>
            </div>
          )}
          {unusual && unusual.ok && (unusual.rows || []).filter((r) => r.unusual).length === 0 && (
            <div style={{ fontSize: 12, color: cssVar("--muted") }}>
              Không mã nào có khối lượng lạ trong phiên gần nhất.
            </div>
          )}
          {unusual && unusual.ok && (unusual.rows || []).filter((r) => r.unusual).map((r) => (
            <div key={r.symbol} className="box" style={{ padding: 14, marginBottom: 10,
              borderColor: cssVar(HUONG[r.huong].c) }}>
              <div className="between">
                <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>{r.symbol}</span>
                <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>
                  {r.times.toFixed(1)}× trung vị
                </span>
              </div>
              <div className="num" style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 5, lineHeight: 1.7 }}>
                phiên {r.date} · khối lượng {nf.format(r.volume)} · thường ngày {nf.format(r.median)}
                <br />
                <span style={{ color: cssVar(HUONG[r.huong].c) }}>{HUONG[r.huong].t}</span>
                {" · "}{r.thay_doi_pct >= 0 ? "+" : ""}{r.thay_doi_pct.toFixed(2)}% so với giá mở cửa
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: cssVar("--muted"), lineHeight: 1.6, marginTop: 8 }}>
            So khối lượng phiên gần nhất với trung vị 20 phiên trước. Dùng trung vị chứ không dùng
            trung bình vì chỉ một phiên đột biến là trung bình bị kéo lệch. Hướng tiền suy từ vị trí
            giá đóng cửa trong biên độ ngày — là phỏng đoán, không phải số liệu mua bán thật.
            Đây là quan sát, không phải khuyến nghị.
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/** Lịch sự kiện quyền: ngày giao dịch không hưởng quyền, ngày chốt, ngày trả. */
function StockEvents({ onClose, flash }) {
  const [rows, setRows] = useState([]);
  const [held, setHeld] = useState([]);
  const [add, setAdd] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    api("/stock/events").then((d) => setRows(d.rows || [])).catch(() => {});
    api("/portfolio").then((d) => setHeld(((d.snapshot || {}).positions) || [])).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const LOAI = [
    { id: "co_tuc_tien", label: "Cổ tức tiền" },
    { id: "co_tuc_cp", label: "Cổ tức cổ phiếu" },
    { id: "phat_hanh_them", label: "Phát hành thêm" },
    { id: "dhcd", label: "Đại hội cổ đông" },
    { id: "khac", label: "Khác" },
  ];
  const loaiLabel = (id) => (LOAI.find((l) => l.id === id) || {}).label || id;

  const save = () => {
    setErr("");
    api("/stock/events", { method: "POST", body: add })
      .then(() => { flash("Đã thêm sự kiện"); setAdd(null); load(); })
      .catch((e) => setErr(e.message));
  };
  const del = (id) => {
    api(`/stock/events/${id}`, { method: "DELETE" }).then(() => { flash("Đã xóa"); load(); }).catch(() => {});
  };

  const today = todayISO();
  const sapToi = rows.filter((r) => r.ex_date >= today);
  const daQua = rows.filter((r) => r.ex_date < today);

  const Row = ({ r }) => {
    const giu = held.find((h) => h.symbol === r.symbol);
    const conNgay = Math.round((new Date(r.ex_date) - new Date(today)) / 86400000);
    return (
      <div className="box" style={{ padding: 14, marginBottom: 10 }}>
        <div className="between">
          <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>
            {r.symbol} <span style={{ fontSize: 12, fontWeight: 400, color: cssVar("--muted") }}>{loaiLabel(r.loai)}</span>
          </span>
          <button onClick={() => del(r.id)} style={{ fontSize: 12, color: cssVar("--muted") }}>Xóa</button>
        </div>
        <div className="num" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.8 }}>
          <b>GDKHQ {r.ex_date}</b>
          {conNgay >= 0 && <span style={{ color: cssVar("--amber") }}>
            {conNgay === 0 ? "  — hôm nay" : `  — còn ${conNgay} ngày`}
          </span>}
          {r.record_date && <><br />ngày chốt danh sách {r.record_date}</>}
          {r.pay_date && <><br />ngày thanh toán {r.pay_date}</>}
          {r.ty_le && <><br />tỷ lệ {r.ty_le}</>}
          {r.gia_tri && giu && <><br />ước nhận {money(r.gia_tri * giu.qty)} cho {nf.format(giu.qty)} cp</>}
          {r.ghi_chu && <><br /><span style={{ color: cssVar("--muted") }}>{r.ghi_chu}</span></>}
        </div>
      </div>
    );
  };

  return (
    <Sheet title="Lịch sự kiện quyền" onClose={onClose}>
      <div className="pad" style={{ paddingTop: 18 }}>
        <div className="box" style={{ padding: 12, marginBottom: 16, borderColor: cssVar("--amber") }}>
          <div style={{ fontSize: 12, color: cssVar("--muted"), lineHeight: 1.7 }}>
            Hiện phải nhập tay. Nguồn lịch quyền tự động (TCBS) chặn máy chủ đặt tại nước ngoài,
            muốn tự động phải dựng thêm một cầu nối Cloudflare — chưa làm.
          </div>
        </div>

        <Button kind="outline" onClick={() => setAdd({ symbol: held[0] ? held[0].symbol : "", loai: "co_tuc_tien" })}
          style={{ width: "100%", marginBottom: 18 }}>+ Thêm sự kiện</Button>

        {sapToi.length > 0 && <>
          <div className="num label" style={{ marginBottom: 8 }}>Sắp tới</div>
          {sapToi.slice().reverse().map((r) => <Row key={r.id} r={r} />)}
        </>}
        {daQua.length > 0 && <>
          <div className="num label" style={{ margin: "18px 0 8px" }}>Đã qua</div>
          {daQua.map((r) => <Row key={r.id} r={r} />)}
        </>}
        {rows.length === 0 && <Empty text="Chưa ghi sự kiện nào." />}

        {add && (
          <Sheet title="Thêm sự kiện quyền" onClose={() => setAdd(null)}>
            <div className="pad" style={{ paddingTop: 18 }}>
              <Field label="Mã">
                <input value={add.symbol} placeholder="HCM"
                  onChange={(e) => setAdd({ ...add, symbol: e.target.value.toUpperCase() })} />
              </Field>
              <Field label="Loại">
                <Chips value={add.loai} onChange={(v) => setAdd({ ...add, loai: v })} options={LOAI} />
              </Field>
              <Field label="Ngày giao dịch không hưởng quyền" hint="Bắt buộc — mua từ ngày này không còn quyền">
                <input type="date" value={add.ex_date || ""}
                  onChange={(e) => setAdd({ ...add, ex_date: e.target.value })} />
              </Field>
              <Field label="Ngày chốt danh sách">
                <input type="date" value={add.record_date || ""}
                  onChange={(e) => setAdd({ ...add, record_date: e.target.value })} />
              </Field>
              <Field label="Ngày thanh toán">
                <input type="date" value={add.pay_date || ""}
                  onChange={(e) => setAdd({ ...add, pay_date: e.target.value })} />
              </Field>
              <Field label="Tỷ lệ" hint="ví dụ 15% hoặc 10:1">
                <input value={add.ty_le || ""} onChange={(e) => setAdd({ ...add, ty_le: e.target.value })} />
              </Field>
              <Field label="Số tiền trên mỗi cổ phiếu (đồng)" hint="để ước tính số nhận được">
                <input inputMode="numeric" value={add.gia_tri || ""} placeholder="1500"
                  onChange={(e) => setAdd({ ...add, gia_tri: e.target.value })} />
              </Field>
              <Field label="Ghi chú">
                <input value={add.ghi_chu || ""} onChange={(e) => setAdd({ ...add, ghi_chu: e.target.value })} />
              </Field>
              {err && <div style={{ color: cssVar("--red"), fontSize: 13, marginBottom: 10 }}>{err}</div>}
              <Button onClick={save} style={{ width: "100%" }}>Lưu sự kiện</Button>
            </div>
          </Sheet>
        )}
      </div>
    </Sheet>
  );
}

/**
 * Một dòng sự kiện quyền hiện ngay dưới mã trong danh mục.
 *
 * Ưu tiên nói điều người giữ cổ phiếu thực sự cần biết theo từng giai đoạn:
 * còn mấy ngày nữa tới ngày mất quyền, hay đã qua ngày chốt mà tiền chưa về.
 */
function EventLine({ ev, qty }) {
  const TEN = {
    co_tuc_tien: "cổ tức tiền",
    co_tuc_cp: "cổ tức cổ phiếu",
    phat_hanh_them: "phát hành thêm",
    dhcd: "đại hội cổ đông",
    khac: "sự kiện",
  };

  let mau = "--muted";
  let dau = "";
  if (ev.cho_tien) { mau = "--blue"; dau = "đã qua ngày chốt, chờ nhận"; }
  else if (ev.con_ngay === 0) { mau = "--amber"; dau = "hôm nay là ngày không hưởng quyền"; }
  else if (ev.con_ngay > 0 && ev.con_ngay <= 5) { mau = "--amber"; dau = `còn ${ev.con_ngay} ngày`; }
  else if (ev.con_ngay > 0) { dau = `còn ${ev.con_ngay} ngày`; }
  else { dau = "đã qua"; }

  const tien = ev.gia_tri ? ev.gia_tri * qty : null;

  return (
    <div className="num" style={{ fontSize: 11, marginTop: 6, paddingTop: 6,
      borderTop: `1px solid ${cssVar("--line")}`, color: cssVar(mau), lineHeight: 1.7 }}>
      {TEN[ev.loai] || "sự kiện"}
      {ev.gia_tri ? ` ${nf.format(ev.gia_tri)}đ/cp` : ""}
      {ev.ty_le ? ` · tỷ lệ ${ev.ty_le}` : ""}
      {" · không hưởng quyền "}{ev.ex_date}
      {dau ? ` · ${dau}` : ""}
      {tien && <><br />ước nhận {money(tien)} cho {nf.format(qty)} cp
        {ev.pay_date ? ` · thanh toán ${ev.pay_date}` : ""}</>}
    </div>
  );
}
