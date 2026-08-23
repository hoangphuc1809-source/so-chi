const { useState, useEffect, useMemo, useRef, useCallback } = React;

/* ============================ tiện ích ============================ */

const nf = new Intl.NumberFormat("vi-VN");
const money = (n) => nf.format(Math.round(n || 0)) + " ₫";
const short = (n) => {
  const v = Math.round(Math.abs(n) || 0);
  const sign = n < 0 ? "-" : "";
  if (v >= 1e9) return sign + (v / 1e9).toFixed(1).replace(".0", "") + "tỷ";
  if (v >= 1e6) return sign + (v / 1e6).toFixed(1).replace(".0", "") + "tr";
  if (v >= 1e3) return sign + Math.round(v / 1e3) + "k";
  return sign + v;
};
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const monthOf = (iso) => (iso || "").slice(0, 7);
const MONTH_VN = (ym) => { const [y, m] = ym.split("-"); return `Tháng ${Number(m)}/${y}`; };
const DAY_NAMES = ["CN", "Th 2", "Th 3", "Th 4", "Th 5", "Th 6", "Th 7"];
const DAY_VN = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`;
};
const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const TYPES = [
  { id: "personal", label: "Cá nhân", varname: "--blue" },
  { id: "company", label: "Tiếp khách", varname: "--amber" },
  { id: "business", label: "Công tác", varname: "--green" },
];
const METHODS = [
  { id: "cash", label: "Tiền mặt" },
  { id: "card", label: "Thẻ tín dụng" },
  { id: "bank", label: "Chuyển khoản" },
  { id: "ewallet", label: "Ví điện tử" },
];
const RECURRENCE = [
  { id: "monthly", label: "Hàng tháng" },
  { id: "weekly", label: "Hàng tuần" },
  { id: "quarterly", label: "Hàng quý" },
  { id: "yearly", label: "Hàng năm" },
  { id: "once", label: "Một lần" },
];
const typeLabel = (id) => (TYPES.find((t) => t.id === id) || {}).label || id;
const methodLabel = (id) => (METHODS.find((m) => m.id === id) || {}).label || id;
const cssVar = (name) => `var(${name})`;

/* ============================ gọi API ============================ */

const TOKEN_KEY = "sochi:token";
let TOKEN = localStorage.getItem(TOKEN_KEY) || "";

async function api(path, { method = "GET", body, raw } = {}) {
  const res = await fetch("/api" + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const data = await res.json().catch(() => ({ error: "Máy chủ trả về dữ liệu lỗi" }));
  if (!res.ok) {
    if (res.status === 401) {
      TOKEN = "";
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("sochi:logout"));
    }
    throw new Error(data.error || `Lỗi ${res.status}`);
  }
  return data;
}

const setToken = (t) => {
  TOKEN = t || "";
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};

/* ---- nén ảnh trước khi gửi lên máy chủ ---- */

function compressImage(file, maxSide = 1400, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không đọc được ảnh"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Ảnh không hợp lệ"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ============================ UI dùng chung ============================ */

function SectionLabel({ children, right }) {
  return (
    <div className="between">
      <div className="num label">{children}</div>
      {right}
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, color: cssVar("--muted"), marginBottom: 8 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11, color: cssVar("--muted"), marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

function Chips({ options, value, onChange, accent }) {
  return (
    <div className="wrap">
      {options.map((o) => {
        const on = o.id === value;
        const bg = accent && o.varname ? cssVar(o.varname) : cssVar("--ink");
        return (
          <button key={o.id} onClick={() => onChange(o.id)}
            style={{
              fontSize: 13, padding: "8px 14px", borderRadius: 99,
              background: on ? bg : cssVar("--card"),
              color: on ? cssVar("--onink") : cssVar("--ink"),
              border: `1px solid ${on ? bg : cssVar("--line")}`,
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Button({ children, onClick, kind = "primary", disabled, style }) {
  const base = { fontSize: 15, fontWeight: 600, padding: "12px 20px", borderRadius: 99, ...style };
  const kinds = {
    primary: { background: disabled ? cssVar("--track") : cssVar("--ink"), color: disabled ? cssVar("--muted") : cssVar("--onink") },
    ghost: { background: "transparent", color: cssVar("--muted"), fontWeight: 400 },
    outline: { background: cssVar("--card"), border: `1px solid ${cssVar("--line")}`, fontWeight: 500, fontSize: 14 },
    danger: { background: "transparent", color: cssVar("--red"), fontWeight: 500, fontSize: 14 },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...base, ...kinds[kind], cursor: disabled ? "not-allowed" : "pointer" }}>
      {children}
    </button>
  );
}

function Bar({ value, max, color, height = 4 }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height, background: cssVar("--track"), borderRadius: 99 }}>
      <div style={{ height, width: pct + "%", background: color, borderRadius: 99 }} />
    </div>
  );
}

function Sheet({ title, onClose, children, footer }) {
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="sheet">
      <div className="shell" style={{ paddingBottom: 40 }}>
        <div className="between pad" style={{
          padding: "18px 20px", borderBottom: `1px solid ${cssVar("--line")}`,
          position: "sticky", top: 0, background: cssVar("--paper"), zIndex: 2,
        }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{title}</span>
          <button onClick={onClose} style={{ fontSize: 15, color: cssVar("--muted") }}>Đóng</button>
        </div>
        <div className="pad" style={{ paddingTop: 20 }}>{children}</div>
        {footer && <div className="pad" style={{ paddingTop: 8 }}>{footer}</div>}
      </div>
    </div>
  );
}

function Empty({ text, action }) {
  return (
    <div style={{ textAlign: "center", padding: "44px 0" }}>
      <div style={{ fontSize: 14, color: cssVar("--muted"), marginBottom: action ? 16 : 0 }}>{text}</div>
      {action}
    </div>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      position: "fixed", bottom: 86, left: "50%", transform: "translateX(-50%)",
      background: cssVar("--ink"), color: cssVar("--onink"), fontSize: 13,
      padding: "9px 16px", borderRadius: 99, zIndex: 90, maxWidth: "88vw", textAlign: "center",
    }}>
      {msg}
    </div>
  );
}

/* ============================ đăng nhập ============================ */

function Login({ needsSetup, onDone }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await api(needsSetup ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setToken(res.token);
      onDone();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="shell pad" style={{ paddingTop: "18vh", paddingBottom: 40 }}>
      <div className="num label">Sổ chi</div>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 4px", letterSpacing: "-.02em" }}>
        {needsSetup ? "Tạo tài khoản" : "Đăng nhập"}
      </h1>
      <p style={{ fontSize: 13, color: cssVar("--muted"), marginTop: 0, marginBottom: 28 }}>
        {needsSetup
          ? "Đây là tài khoản đầu tiên trên máy chủ này."
          : "Dữ liệu chi tiêu của bạn nằm trên máy chủ riêng."}
      </p>

      <Field label="Tên đăng nhập">
        <input className="field" value={username} autoCapitalize="none" autoCorrect="off"
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} />
      </Field>
      <Field label="Mật khẩu" hint={needsSetup ? "Tối thiểu 6 ký tự" : null}>
        <input className="field" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} />
      </Field>

      {err && <div style={{ fontSize: 13, color: cssVar("--red"), marginBottom: 14 }}>{err}</div>}

      <Button onClick={submit} disabled={busy || !username || !password} style={{ width: "100%" }}>
        {busy ? "Đang xử lý…" : needsSetup ? "Tạo tài khoản" : "Đăng nhập"}
      </Button>
    </div>
  );
}
