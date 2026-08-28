/* ===== Khóa màn hình ===== */

/**
 * Khóa màn hình sau một khoảng không đụng tới, và khi app bị ẩn đi.
 *
 * Mục đích là che mắt người ngồi cạnh hoặc người cầm máy lên khi bạn rời bàn.
 * Đây KHÔNG phải lớp bảo mật thật: ai lấy được máy đã đăng nhập vẫn có thể moi
 * token trong trình duyệt và gọi thẳng API. Nói rõ điều đó với người dùng còn
 * hơn để họ tưởng dữ liệu được bảo vệ hơn thực tế.
 *
 * Che khi app bị ẩn là phần quan trọng nhất mà người ta hay quên: Android chụp
 * lại màn hình cuối để hiện trong danh sách app đang chạy, nên chỉ cần bấm nút
 * đa nhiệm là số dư hiện ra dù app đã khóa.
 */
function useScreenLock(enabled) {
  const [cfg, setCfg] = useState(null);
  const [locked, setLocked] = useState(false);
  const hetGio = useRef(null);

  const load = useCallback(() => {
    if (!enabled) return;
    api("/lock").then(setCfg).catch(() => {});
  }, [enabled]);
  useEffect(load, [load]);

  const dem = useCallback(() => {
    if (hetGio.current) clearTimeout(hetGio.current);
    if (!cfg || !cfg.co_pin || !cfg.phut_cho) return;
    hetGio.current = setTimeout(() => setLocked(true), cfg.phut_cho * 60 * 1000);
  }, [cfg]);

  useEffect(() => {
    if (!enabled || !cfg || !cfg.co_pin) return;

    const cham = () => { if (!locked) dem(); };
    const su_kien = ["pointerdown", "keydown", "touchstart", "scroll"];
    su_kien.forEach((e) => window.addEventListener(e, cham, { passive: true }));

    const doiTrangThai = () => {
      // Khóa ngay khi app bị ẩn, không đợi hết giờ. Lúc đó ảnh chụp màn hình
      // mà hệ điều hành lưu lại sẽ là màn khóa chứ không phải bảng số dư.
      if (document.hidden && cfg.khoa_khi_an) setLocked(true);
      else if (!document.hidden && !locked) dem();
    };
    document.addEventListener("visibilitychange", doiTrangThai);

    dem();
    return () => {
      su_kien.forEach((e) => window.removeEventListener(e, cham));
      document.removeEventListener("visibilitychange", doiTrangThai);
      if (hetGio.current) clearTimeout(hetGio.current);
    };
  }, [enabled, cfg, locked, dem]);

  const unlock = () => { setLocked(false); dem(); };
  return { cfg, locked, setLocked, unlock, reloadLock: load };
}

/** Màn che khi đã khóa. Không hiện bất cứ số liệu nào phía sau. */
function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [pw, setPw] = useState("");
  const [dungMatKhau, setDungMatKhau] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const thu = (body) => {
    setBusy(true); setErr("");
    api("/lock/unlock", { method: "POST", body })
      .then(() => { setPin(""); setPw(""); onUnlock(); })
      .catch((e) => {
        setErr(e.message);
        setPin("");
        // Hết lượt thử thì chuyển hẳn sang ô mật khẩu, đỡ phải mò.
        if (/quá nhiều lần/i.test(e.message)) setDungMatKhau(true);
      })
      .finally(() => setBusy(false));
  };

  const bam = (n) => {
    const moi = (pin + n).slice(0, 6);
    setPin(moi);
    setErr("");
    if (moi.length >= 4) {
      // Thử ngay khi đủ 4 số, nhưng chỉ khi người dùng dừng gõ — PIN có thể
      // dài tới 6 số nên gửi ngay ở số thứ tư sẽ luôn sai với PIN 5-6 số.
      clearTimeout(bam.timer);
      bam.timer = setTimeout(() => thu({ pin: moi }), 450);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: cssVar("--paper"), display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
      <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Sổ Chi đã khóa</div>
      <div style={{ fontSize: 13, color: cssVar("--muted"), marginBottom: 28, textAlign: "center" }}>
        {dungMatKhau ? "Nhập mật khẩu đăng nhập để mở" : "Nhập mã PIN để mở khóa"}
      </div>

      {!dungMatKhau ? (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{
                width: 12, height: 12, borderRadius: "50%",
                border: `1.5px solid ${cssVar(i < pin.length ? "--ink" : "--line")}`,
                background: i < pin.length ? cssVar("--ink") : "transparent",
                opacity: i < 4 || pin.length > i ? 1 : 0.3,
              }} />
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 72px)", gap: 14 }}>
            {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
              k === "" ? <div key={i} /> : (
                <button key={i} disabled={busy}
                  onClick={() => k === "⌫" ? (setPin(pin.slice(0, -1)), setErr("")) : bam(k)}
                  style={{
                    height: 62, borderRadius: "50%", fontSize: 22,
                    border: `1px solid ${cssVar("--line")}`, background: cssVar("--card"),
                    color: cssVar("--ink"), fontFamily: "inherit",
                  }}>{k}</button>
              )
            ))}
          </div>
        </>
      ) : (
        <div style={{ width: "100%", maxWidth: 300 }}>
          <input type="password" value={pw} placeholder="Mật khẩu đăng nhập" autoFocus
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pw && thu({ password: pw })}
            style={{ width: "100%", marginBottom: 12 }} />
          <Button onClick={() => thu({ password: pw })} disabled={busy || !pw} style={{ width: "100%" }}>
            Mở khóa
          </Button>
        </div>
      )}

      {err && (
        <div style={{ color: cssVar("--red"), fontSize: 13, marginTop: 20, textAlign: "center", maxWidth: 300 }}>
          {err}
        </div>
      )}

      {!dungMatKhau && (
        <button onClick={() => { setDungMatKhau(true); setErr(""); }}
          style={{ marginTop: 24, fontSize: 13, color: cssVar("--blue") }}>
          Quên mã PIN
        </button>
      )}
    </div>
  );
}

/** Cài đặt khóa màn hình. */
function LockSettings({ cfg, onSaved, flash, onClose }) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [pw, setPw] = useState("");
  const [phut, setPhut] = useState(String(cfg ? cfg.phut_cho : 3));
  const [anHien, setAnHien] = useState(cfg ? cfg.khoa_khi_an : true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const luuPin = () => {
    setErr("");
    if (pin !== pin2) return setErr("Hai mã PIN không giống nhau");
    if (!/^\d{4,6}$/.test(pin)) return setErr("Mã PIN phải là 4 đến 6 chữ số");
    setBusy(true);
    api("/lock/pin", { method: "POST", body: { pin, password: pw } })
      .then(() => { flash("Đã đặt mã PIN"); setPin(""); setPin2(""); setPw(""); onSaved(); })
      .catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };

  const goPin = () => {
    setErr(""); setBusy(true);
    api("/lock/pin", { method: "POST", body: { pin: null, password: pw } })
      .then(() => { flash("Đã gỡ mã PIN"); setPw(""); onSaved(); })
      .catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };

  const luuCaiDat = (p, a) => {
    api("/lock/settings", { method: "POST", body: { phut_cho: Number(p), khoa_khi_an: a } })
      .then(onSaved).catch((e) => setErr(e.message));
  };

  return (
    <Sheet title="Khóa màn hình" onClose={onClose}>
      <div className="pad" style={{ paddingTop: 18 }}>
        <p style={{ fontSize: 12, color: cssVar("--muted"), lineHeight: 1.7, marginTop: 0 }}>
          Che màn hình khi bạn rời máy một lúc, để người khác cầm điện thoại lên không đọc được
          số dư. Đây là lớp che mắt, không phải lớp bảo mật — ai lấy được máy đang đăng nhập
          vẫn có cách lấy dữ liệu.
        </p>

        {cfg && cfg.co_pin ? (
          <>
            <div className="box" style={{ padding: 14, marginBottom: 18, borderColor: cssVar("--green") }}>
              <div style={{ fontSize: 13 }}>Đã đặt mã PIN</div>
            </div>

            <Field label="Khóa sau khi không đụng tới">
              <Chips value={phut} onChange={(v) => { setPhut(v); luuCaiDat(v, anHien); }} options={[
                { id: "1", label: "1 phút" }, { id: "3", label: "3 phút" },
                { id: "5", label: "5 phút" }, { id: "15", label: "15 phút" },
                { id: "0", label: "Không tự khóa" },
              ]} />
            </Field>

            <div className="between" style={{ margin: "16px 0" }}>
              <div style={{ flex: 1, paddingRight: 12 }}>
                <div style={{ fontSize: 14 }}>Khóa ngay khi thoát ra</div>
                <div style={{ fontSize: 11, color: cssVar("--muted"), lineHeight: 1.6, marginTop: 3 }}>
                  Chuyển sang app khác là khóa luôn. Nên bật, vì Android lưu ảnh màn hình cuối
                  để hiện trong danh sách app đang chạy.
                </div>
              </div>
              <input type="checkbox" checked={anHien}
                onChange={(e) => { setAnHien(e.target.checked); luuCaiDat(phut, e.target.checked); }} />
            </div>

            <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${cssVar("--line")}` }}>
              <div className="num label" style={{ marginBottom: 10 }}>Gỡ mã PIN</div>
              <Field label="Mật khẩu đăng nhập">
                <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
              </Field>
              {err && <div style={{ color: cssVar("--red"), fontSize: 13, marginBottom: 10 }}>{err}</div>}
              <Button kind="outline" onClick={goPin} disabled={busy || !pw} style={{ width: "100%" }}>
                Gỡ mã PIN
              </Button>
            </div>
          </>
        ) : (
          <>
            <Field label="Mã PIN mới" hint="4 đến 6 chữ số">
              <input inputMode="numeric" type="password" value={pin} maxLength={6}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="Nhập lại mã PIN">
              <input inputMode="numeric" type="password" value={pin2} maxLength={6}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="Mật khẩu đăng nhập" hint="Để xác nhận đúng là bạn">
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            {err && <div style={{ color: cssVar("--red"), fontSize: 13, marginBottom: 12 }}>{err}</div>}
            <Button onClick={luuPin} disabled={busy || !pin || !pin2 || !pw} style={{ width: "100%" }}>
              Đặt mã PIN
            </Button>
            <div style={{ fontSize: 11, color: cssVar("--muted"), lineHeight: 1.6, marginTop: 14 }}>
              Quên PIN thì mở khóa bằng mật khẩu đăng nhập. Sai PIN 5 lần liên tiếp cũng sẽ
              phải dùng mật khẩu.
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
