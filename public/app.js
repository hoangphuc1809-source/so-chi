/* So Chi - sinh tu src/*.jsx, dung sua truc tiep */
const {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback
} = React;
const nf = new Intl.NumberFormat("vi-VN");
const money = n => nf.format(Math.round(n || 0)) + " ₫";
const short = n => {
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
const monthOf = iso => (iso || "").slice(0, 7);
const MONTH_VN = ym => {
  const [y, m] = ym.split("-");
  return `Tháng ${Number(m)}/${y}`;
};
const DAY_NAMES = ["CN", "Th 2", "Th 3", "Th 4", "Th 5", "Th 6", "Th 7"];
const DAY_VN = iso => {
  const d = new Date(iso + "T00:00:00");
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`;
};
const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const TYPES = [{
  id: "personal",
  label: "Cá nhân",
  varname: "--blue"
}, {
  id: "company",
  label: "Tiếp khách",
  varname: "--amber"
}, {
  id: "business",
  label: "Công tác",
  varname: "--green"
}];
const METHODS = [{
  id: "cash",
  label: "Tiền mặt"
}, {
  id: "card",
  label: "Thẻ tín dụng"
}, {
  id: "bank",
  label: "Chuyển khoản"
}, {
  id: "ewallet",
  label: "Ví điện tử"
}];
const RECURRENCE = [{
  id: "monthly",
  label: "Hàng tháng"
}, {
  id: "weekly",
  label: "Hàng tuần"
}, {
  id: "quarterly",
  label: "Hàng quý"
}, {
  id: "yearly",
  label: "Hàng năm"
}, {
  id: "once",
  label: "Một lần"
}];
const typeLabel = id => (TYPES.find(t => t.id === id) || {}).label || id;
const methodLabel = id => (METHODS.find(m => m.id === id) || {}).label || id;
const cssVar = name => `var(${name})`;
const TOKEN_KEY = "sochi:token";
let TOKEN = localStorage.getItem(TOKEN_KEY) || "";
async function api(path, {
  method = "GET",
  body,
  raw
} = {}) {
  const res = await fetch("/api" + path, {
    method,
    headers: {
      ...(body ? {
        "Content-Type": "application/json"
      } : {}),
      ...(TOKEN ? {
        Authorization: "Bearer " + TOKEN
      } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (raw) return res;
  const data = await res.json().catch(() => ({
    error: "Máy chủ trả về dữ liệu lỗi"
  }));
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
const setToken = t => {
  TOKEN = t || "";
  if (t) localStorage.setItem(TOKEN_KEY, t);else localStorage.removeItem(TOKEN_KEY);
};
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
function SectionLabel({
  children,
  right
}) {
  return React.createElement("div", {
    className: "between"
  }, React.createElement("div", {
    className: "num label"
  }, children), right);
}
function Field({
  label,
  children,
  hint
}) {
  return React.createElement("div", {
    style: {
      marginBottom: 18
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      marginBottom: 8
    }
  }, label), children, hint && React.createElement("div", {
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 6
    }
  }, hint));
}
function Chips({
  options,
  value,
  onChange,
  accent
}) {
  return React.createElement("div", {
    className: "wrap"
  }, options.map(o => {
    const on = o.id === value;
    const bg = accent && o.varname ? cssVar(o.varname) : cssVar("--ink");
    return React.createElement("button", {
      key: o.id,
      onClick: () => onChange(o.id),
      style: {
        fontSize: 13,
        padding: "8px 14px",
        borderRadius: 99,
        background: on ? bg : cssVar("--card"),
        color: on ? cssVar("--onink") : cssVar("--ink"),
        border: `1px solid ${on ? bg : cssVar("--line")}`
      }
    }, o.label);
  }));
}
function Button({
  children,
  onClick,
  kind = "primary",
  disabled,
  style
}) {
  const base = {
    fontSize: 15,
    fontWeight: 600,
    padding: "12px 20px",
    borderRadius: 99,
    ...style
  };
  const kinds = {
    primary: {
      background: disabled ? cssVar("--track") : cssVar("--ink"),
      color: disabled ? cssVar("--muted") : cssVar("--onink")
    },
    ghost: {
      background: "transparent",
      color: cssVar("--muted"),
      fontWeight: 400
    },
    outline: {
      background: cssVar("--card"),
      border: `1px solid ${cssVar("--line")}`,
      fontWeight: 500,
      fontSize: 14
    },
    danger: {
      background: "transparent",
      color: cssVar("--red"),
      fontWeight: 500,
      fontSize: 14
    }
  };
  return React.createElement("button", {
    onClick: onClick,
    disabled: disabled,
    style: {
      ...base,
      ...kinds[kind],
      cursor: disabled ? "not-allowed" : "pointer"
    }
  }, children);
}
function Bar({
  value,
  max,
  color,
  height = 4
}) {
  const pct = max > 0 ? Math.min(100, value / max * 100) : 0;
  return React.createElement("div", {
    style: {
      height,
      background: cssVar("--track"),
      borderRadius: 99
    }
  }, React.createElement("div", {
    style: {
      height,
      width: pct + "%",
      background: color,
      borderRadius: 99
    }
  }));
}
function Sheet({
  title,
  onClose,
  children,
  footer
}) {
  useEffect(() => {
    const esc = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return React.createElement("div", {
    className: "sheet"
  }, React.createElement("div", {
    className: "shell",
    style: {
      paddingBottom: 40
    }
  }, React.createElement("div", {
    className: "between pad",
    style: {
      padding: "18px 20px",
      borderBottom: `1px solid ${cssVar("--line")}`,
      position: "sticky",
      top: 0,
      background: cssVar("--paper"),
      zIndex: 2
    }
  }, React.createElement("span", {
    style: {
      fontSize: 17,
      fontWeight: 600
    }
  }, title), React.createElement("button", {
    onClick: onClose,
    style: {
      fontSize: 15,
      color: cssVar("--muted")
    }
  }, "Đóng")), React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 20
    }
  }, children), footer && React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 8
    }
  }, footer)));
}
function Empty({
  text,
  action
}) {
  return React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "44px 0"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 14,
      color: cssVar("--muted"),
      marginBottom: action ? 16 : 0
    }
  }, text), action);
}
function Toast({
  msg
}) {
  if (!msg) return null;
  return React.createElement("div", {
    style: {
      position: "fixed",
      bottom: 86,
      left: "50%",
      transform: "translateX(-50%)",
      background: cssVar("--ink"),
      color: cssVar("--onink"),
      fontSize: 13,
      padding: "9px 16px",
      borderRadius: 99,
      zIndex: 90,
      maxWidth: "88vw",
      textAlign: "center"
    }
  }, msg);
}
function Login({
  needsSetup,
  onDone
}) {
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
        body: {
          username,
          password
        }
      });
      setToken(res.token);
      onDone();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  return React.createElement("div", {
    className: "shell pad",
    style: {
      paddingTop: "18vh",
      paddingBottom: 40
    }
  }, React.createElement("div", {
    className: "num label"
  }, "Sổ chi"), React.createElement("h1", {
    style: {
      fontSize: 26,
      fontWeight: 700,
      margin: "6px 0 4px",
      letterSpacing: "-.02em"
    }
  }, needsSetup ? "Tạo tài khoản" : "Đăng nhập"), React.createElement("p", {
    style: {
      fontSize: 13,
      color: cssVar("--muted"),
      marginTop: 0,
      marginBottom: 28
    }
  }, needsSetup ? "Đây là tài khoản đầu tiên trên máy chủ này." : "Dữ liệu chi tiêu của bạn nằm trên máy chủ riêng."), React.createElement(Field, {
    label: "Tên đăng nhập"
  }, React.createElement("input", {
    className: "field",
    value: username,
    autoCapitalize: "none",
    autoCorrect: "off",
    onChange: e => setUsername(e.target.value),
    onKeyDown: e => e.key === "Enter" && submit()
  })), React.createElement(Field, {
    label: "Mật khẩu",
    hint: needsSetup ? "Tối thiểu 6 ký tự" : null
  }, React.createElement("input", {
    className: "field",
    type: "password",
    value: password,
    onChange: e => setPassword(e.target.value),
    onKeyDown: e => e.key === "Enter" && submit()
  })), err && React.createElement("div", {
    style: {
      fontSize: 13,
      color: cssVar("--red"),
      marginBottom: 14
    }
  }, err), React.createElement(Button, {
    onClick: submit,
    disabled: busy || !username || !password,
    style: {
      width: "100%"
    }
  }, busy ? "Đang xử lý…" : needsSetup ? "Tạo tài khoản" : "Đăng nhập"));
}
function Home({
  data,
  month,
  setMonth,
  txs,
  onEdit,
  onAdd,
  onPayBill,
  goTab
}) {
  const {
    categories,
    cards,
    bills
  } = data;
  const catMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const monthTxs = useMemo(() => txs.filter(t => monthOf(t.date) === month).sort((a, b) => a.date < b.date ? 1 : -1), [txs, month]);
  const total = monthTxs.reduce((s, t) => s + t.amount, 0);
  const prevTotal = useMemo(() => txs.filter(t => monthOf(t.date) === shiftMonth(month, -1)).reduce((s, t) => s + t.amount, 0), [txs, month]);
  const diff = prevTotal ? (total - prevTotal) / prevTotal * 100 : 0;
  const byType = useMemo(() => {
    const o = {};
    monthTxs.forEach(t => o[t.type] = (o[t.type] || 0) + t.amount);
    return o;
  }, [monthTxs]);
  const byCat = useMemo(() => {
    const o = {};
    monthTxs.forEach(t => o[t.category_id] = (o[t.category_id] || 0) + t.amount);
    return Object.entries(o).map(([id, v]) => ({
      id,
      total: v,
      cat: catMap[id]
    })).filter(r => r.cat).sort((a, b) => b.total - a.total);
  }, [monthTxs, catMap]);
  const maxCat = Math.max(...byCat.map(r => r.total), 1);
  const trend = useMemo(() => {
    const out = [];
    for (let i = 5; i >= 0; i--) {
      const ym = shiftMonth(month, -i);
      out.push({
        ym,
        label: "T" + Number(ym.split("-")[1]),
        total: txs.filter(t => monthOf(t.date) === ym).reduce((s, t) => s + t.amount, 0)
      });
    }
    return out;
  }, [txs, month]);
  const maxTrend = Math.max(...trend.map(t => t.total), 1);
  const alerts = bills.filter(b => b.active && (b.status === "overdue" || b.status === "due_soon"));
  const debt = cards.reduce((s, c) => s + Math.max(0, c.balance), 0);
  const grouped = useMemo(() => {
    const g = {};
    monthTxs.forEach(t => (g[t.date] = g[t.date] || []).push(t));
    return Object.entries(g);
  }, [monthTxs]);
  return React.createElement("div", {
    className: "pad"
  }, React.createElement("section", {
    style: {
      padding: "24px 0 18px"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      color: cssVar("--muted")
    }
  }, "Đã chi trong tháng"), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 38,
      fontWeight: 700,
      letterSpacing: "-.02em",
      marginTop: 2
    }
  }, money(total)), prevTotal > 0 && React.createElement("div", {
    className: "num",
    style: {
      fontSize: 12,
      marginTop: 4,
      color: diff > 0 ? cssVar("--red") : cssVar("--green")
    }
  }, diff > 0 ? "▲" : "▼", " ", Math.abs(diff).toFixed(0), "% so với tháng trước (", short(prevTotal), ")")), (alerts.length > 0 || debt > 0) && React.createElement("section", {
    className: "grid2",
    style: {
      marginBottom: 24
    }
  }, React.createElement("button", {
    className: "box",
    onClick: () => goTab("bills"),
    style: {
      padding: 14,
      textAlign: "left"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: cssVar("--muted")
    }
  }, "Hóa đơn cần trả"), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 20,
      fontWeight: 600,
      marginTop: 3,
      color: alerts.some(a => a.status === "overdue") ? cssVar("--red") : cssVar("--ink")
    }
  }, alerts.length), React.createElement("div", {
    className: "num truncate",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 2
    }
  }, alerts.length ? short(alerts.reduce((s, a) => s + a.amount, 0)) : "không có")), React.createElement("button", {
    className: "box",
    onClick: () => goTab("cards"),
    style: {
      padding: 14,
      textAlign: "left"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: cssVar("--muted")
    }
  }, "Dư nợ thẻ"), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 20,
      fontWeight: 600,
      marginTop: 3
    }
  }, short(debt)), React.createElement("div", {
    className: "num truncate",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 2
    }
  }, cards.length, " thẻ"))), alerts.length > 0 && React.createElement("section", {
    style: {
      marginBottom: 24
    }
  }, React.createElement(SectionLabel, null, "Sắp đến hạn"), React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, alerts.slice(0, 4).map(b => React.createElement("div", {
    key: b.id,
    className: "tape between",
    style: {
      padding: "11px 0",
      gap: 10
    }
  }, React.createElement("span", {
    style: {
      minWidth: 0
    }
  }, React.createElement("span", {
    className: "truncate",
    style: {
      display: "block",
      fontSize: 14
    }
  }, b.name), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 11,
      color: b.status === "overdue" ? cssVar("--red") : cssVar("--amber")
    }
  }, b.status === "overdue" ? `quá hạn ${Math.abs(b.days_left)} ngày` : b.days_left === 0 ? "đến hạn hôm nay" : `còn ${b.days_left} ngày`)), React.createElement("span", {
    className: "row",
    style: {
      gap: 10
    }
  }, React.createElement("span", {
    className: "num",
    style: {
      fontSize: 13,
      fontWeight: 500
    }
  }, short(b.amount)), React.createElement(Button, {
    kind: "outline",
    style: {
      padding: "5px 12px",
      fontSize: 12
    },
    onClick: () => onPayBill(b)
  }, "Đã trả")))))), trend.some(t => t.total > 0) && React.createElement("section", {
    style: {
      marginBottom: 26
    }
  }, React.createElement("div", {
    className: "row",
    style: {
      alignItems: "flex-end",
      gap: 8,
      height: 80
    }
  }, trend.map(t => React.createElement("button", {
    key: t.ym,
    onClick: () => setMonth(t.ym),
    title: `${MONTH_VN(t.ym)} — ${money(t.total)}`,
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
      height: "100%"
    }
  }, React.createElement("div", {
    style: {
      height: Math.max(t.total / maxTrend * 62, t.total > 0 ? 3 : 1),
      background: t.ym === month ? cssVar("--ink") : cssVar("--track"),
      borderRadius: "3px 3px 0 0"
    }
  }), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      marginTop: 6,
      color: t.ym === month ? cssVar("--ink") : cssVar("--muted")
    }
  }, t.label))))), total > 0 && React.createElement("section", {
    style: {
      marginBottom: 26
    }
  }, React.createElement("div", {
    className: "row",
    style: {
      height: 8,
      borderRadius: 8,
      overflow: "hidden"
    }
  }, TYPES.map(t => byType[t.id] ? React.createElement("div", {
    key: t.id,
    title: t.label,
    style: {
      background: cssVar(t.varname),
      flex: byType[t.id]
    }
  }) : null)), React.createElement("div", {
    className: "wrap",
    style: {
      marginTop: 8,
      gap: 16
    }
  }, TYPES.map(t => byType[t.id] ? React.createElement("div", {
    key: t.id,
    className: "row",
    style: {
      gap: 6
    }
  }, React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: 99,
      background: cssVar(t.varname)
    }
  }), React.createElement("span", {
    style: {
      fontSize: 12,
      color: cssVar("--muted")
    }
  }, t.label), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 12,
      fontWeight: 500
    }
  }, short(byType[t.id]))) : null))), byCat.length > 0 && React.createElement("section", {
    style: {
      marginBottom: 26
    }
  }, React.createElement(SectionLabel, null, "Theo danh mục"), React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, byCat.map(r => React.createElement("div", {
    key: r.id,
    style: {
      marginBottom: 12
    }
  }, React.createElement("div", {
    className: "between",
    style: {
      alignItems: "baseline",
      marginBottom: 6
    }
  }, React.createElement("span", {
    style: {
      fontSize: 14
    }
  }, React.createElement("span", {
    style: {
      marginRight: 8
    }
  }, r.cat.icon), r.cat.name), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 13,
      fontWeight: 500
    }
  }, money(r.total))), React.createElement(Bar, {
    value: r.total,
    max: maxCat,
    color: r.cat.color
  }), r.cat.budget > 0 && React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      marginTop: 4,
      color: r.total > r.cat.budget ? cssVar("--red") : cssVar("--muted")
    }
  }, Math.round(r.total / r.cat.budget * 100), "% ngân sách ", short(r.cat.budget), r.total > r.cat.budget && " — vượt"))))), React.createElement(SectionLabel, null, "Nhật ký"), grouped.length === 0 ? React.createElement(Empty, {
    text: `Chưa có khoản chi nào trong ${MONTH_VN(month).toLowerCase()}.`,
    action: React.createElement(Button, {
      onClick: onAdd
    }, "Thêm khoản chi đầu tiên")
  }) : React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, grouped.map(([date, items]) => React.createElement("div", {
    key: date,
    style: {
      marginBottom: 18
    }
  }, React.createElement("div", {
    className: "between",
    style: {
      alignItems: "baseline",
      marginBottom: 8
    }
  }, React.createElement("span", {
    className: "num",
    style: {
      fontSize: 11,
      letterSpacing: ".08em",
      color: cssVar("--muted")
    }
  }, DAY_VN(date).toUpperCase()), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted")
    }
  }, short(items.reduce((s, t) => s + t.amount, 0)))), items.map(t => {
    const c = catMap[t.category_id];
    const ty = TYPES.find(x => x.id === t.type) || {};
    return React.createElement("button", {
      key: t.id,
      onClick: () => onEdit(t),
      className: "tape row",
      style: {
        width: "100%",
        gap: 12,
        padding: "12px 0",
        textAlign: "left"
      }
    }, React.createElement("span", {
      style: {
        fontSize: 18,
        width: 24
      }
    }, c && c.icon || "•"), React.createElement("span", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, React.createElement("span", {
      className: "truncate",
      style: {
        display: "block",
        fontSize: 14
      }
    }, t.note || c && c.name || "Khoản chi"), React.createElement("span", {
      style: {
        fontSize: 11,
        color: cssVar("--muted")
      }
    }, c && c.name, t.sub ? ` · ${t.sub}` : "", " · ", React.createElement("span", {
      style: {
        color: cssVar(ty.varname)
      }
    }, ty.label), t.source === "ocr" ? " · 📷" : "")), React.createElement("span", {
      className: "num",
      style: {
        fontSize: 14,
        fontWeight: 500
      }
    }, money(t.amount)));
  })))));
}
function Entry({
  data,
  initial,
  prefill,
  onSaved,
  onDeleted,
  onClose,
  flash
}) {
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
  const cat = cats.find(c => c.id === categoryId);
  const amountNum = Number(amount) || 0;
  const scan = async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    try {
      const b64 = await compressImage(file);
      const {
        receipt: r
      } = await api("/ocr", {
        method: "POST",
        body: {
          image: b64,
          mime: "image/jpeg"
        }
      });
      if (r.total > 0) setAmount(String(r.total));
      if (r.date) setDate(r.date);
      if (r.merchant) setNote(r.merchant);
      const matched = cats.find(c => c.name.toLowerCase() === String(r.suggested_category).toLowerCase());
      if (matched) setCategoryId(matched.id);
      setReceipt(r);
      flash(r.confidence < 0.5 ? "Ảnh hơi khó đọc — kiểm tra lại số tiền" : `Đã đọc hóa đơn${r.items.length ? ` · ${r.items.length} món` : ""}`);
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
        amount: amountNum,
        category_id: categoryId,
        sub: cat && cat.subs.length ? sub : "",
        type,
        method,
        card_id: method === "card" ? cardId : null,
        note: note.trim(),
        date,
        source: receipt ? "ocr" : initial ? initial.source : "manual",
        receipt
      };
      const res = initial ? await api("/transactions/" + initial.id, {
        method: "PUT",
        body
      }) : await api("/transactions", {
        method: "POST",
        body
      });
      onSaved(res.transaction, Boolean(initial));
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api("/transactions/" + initial.id, {
        method: "DELETE"
      });
      onDeleted(initial.id);
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };
  return React.createElement(Sheet, {
    title: initial ? "Sửa khoản chi" : "Thêm khoản chi",
    onClose: onClose
  }, !initial && data.ocr_enabled && React.createElement("div", {
    style: {
      marginBottom: 22
    }
  }, React.createElement("input", {
    ref: fileRef,
    type: "file",
    accept: "image/*",
    capture: "environment",
    onChange: scan,
    style: {
      display: "none"
    }
  }), React.createElement(Button, {
    kind: "outline",
    onClick: () => fileRef.current.click(),
    disabled: scanning,
    style: {
      width: "100%",
      padding: "14px 0"
    }
  }, scanning ? React.createElement("span", {
    className: "row",
    style: {
      gap: 8,
      justifyContent: "center"
    }
  }, React.createElement("span", {
    className: "spin"
  }), " Đang đọc hóa đơn…") : "📷  Quét hóa đơn")), React.createElement("div", {
    style: {
      marginBottom: 22
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      color: cssVar("--muted")
    }
  }, "Số tiền"), React.createElement("div", {
    className: "row",
    style: {
      alignItems: "baseline",
      gap: 8,
      marginTop: 4
    }
  }, React.createElement("input", {
    type: "number",
    inputMode: "numeric",
    value: amount,
    placeholder: "0",
    autoFocus: !initial,
    onChange: e => setAmount(e.target.value),
    className: "num",
    style: {
      flex: 1,
      width: "100%",
      fontSize: 34,
      fontWeight: 700,
      border: "none",
      background: "transparent",
      outline: "none",
      letterSpacing: "-.02em",
      padding: 0
    }
  }), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 20,
      color: cssVar("--muted")
    }
  }, "₫")), React.createElement("div", {
    style: {
      height: 1,
      background: cssVar("--ink"),
      marginTop: 4
    }
  }), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      marginTop: 8,
      minHeight: 16
    }
  }, amountNum > 0 && money(amountNum)), React.createElement("div", {
    className: "wrap",
    style: {
      marginTop: 8
    }
  }, [10000, 50000, 100000, 500000].map(k => React.createElement("button", {
    key: k,
    className: "num",
    onClick: () => setAmount(String(amountNum + k)),
    style: {
      fontSize: 12,
      background: cssVar("--chip"),
      padding: "6px 12px",
      borderRadius: 99
    }
  }, "+", short(k))), amount && React.createElement("button", {
    onClick: () => setAmount(""),
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      padding: "6px 12px"
    }
  }, "Xóa"))), receipt && receipt.items && receipt.items.length > 0 && React.createElement("div", {
    className: "box",
    style: {
      padding: 12,
      marginBottom: 18
    }
  }, React.createElement("div", {
    className: "num label"
  }, "Món trên hóa đơn"), React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, receipt.items.slice(0, 8).map((it, i) => React.createElement("div", {
    key: i,
    className: "between",
    style: {
      fontSize: 12,
      padding: "3px 0"
    }
  }, React.createElement("span", {
    className: "truncate",
    style: {
      color: cssVar("--muted")
    }
  }, it.qty > 1 ? `${it.qty}× ` : "", it.name), React.createElement("span", {
    className: "num"
  }, short(it.price)))))), React.createElement(Field, {
    label: "Danh mục"
  }, React.createElement("div", {
    className: "grid4"
  }, cats.map(c => {
    const on = c.id === categoryId;
    return React.createElement("button", {
      key: c.id,
      onClick: () => {
        setCategoryId(c.id);
        setSub("");
      },
      style: {
        padding: "12px 0",
        borderRadius: 12,
        background: on ? cssVar("--ink") : cssVar("--card"),
        color: on ? cssVar("--onink") : cssVar("--ink"),
        border: `1px solid ${on ? cssVar("--ink") : cssVar("--line")}`
      }
    }, React.createElement("div", {
      style: {
        fontSize: 18
      }
    }, c.icon), React.createElement("div", {
      className: "truncate",
      style: {
        fontSize: 11,
        marginTop: 2,
        padding: "0 2px"
      }
    }, c.name));
  }))), cat && cat.subs.length > 0 && React.createElement(Field, {
    label: "Chi tiết"
  }, React.createElement(Chips, {
    options: cat.subs.map(s => ({
      id: s,
      label: s
    })),
    value: sub,
    onChange: setSub
  })), React.createElement(Field, {
    label: "Loại chi"
  }, React.createElement(Chips, {
    options: TYPES,
    value: type,
    onChange: setType,
    accent: true
  })), React.createElement(Field, {
    label: "Thanh toán"
  }, React.createElement(Chips, {
    options: METHODS,
    value: method,
    onChange: setMethod
  })), method === "card" && data.cards.length > 0 && React.createElement(Field, {
    label: "Thẻ"
  }, React.createElement(Chips, {
    options: data.cards.map(c => ({
      id: c.id,
      label: `${c.bank}${c.last4 ? " ••" + c.last4 : ""}`
    })),
    value: cardId,
    onChange: setCardId
  })), method === "card" && data.cards.length === 0 && React.createElement("div", {
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      marginBottom: 18
    }
  }, "Chưa có thẻ nào. Thêm thẻ ở tab Thẻ để theo dõi dư nợ."), React.createElement(Field, {
    label: "Ghi chú"
  }, React.createElement("input", {
    className: "field",
    value: note,
    placeholder: "Ăn trưa với khách DGW…",
    onChange: e => setNote(e.target.value)
  })), React.createElement(Field, {
    label: "Ngày"
  }, React.createElement("input", {
    className: "field num",
    type: "date",
    value: date,
    style: {
      width: "auto"
    },
    onChange: e => setDate(e.target.value)
  })), React.createElement("div", {
    className: "row",
    style: {
      gap: 12,
      marginTop: 26
    }
  }, React.createElement(Button, {
    kind: "ghost",
    onClick: onClose
  }, "Hủy"), React.createElement(Button, {
    onClick: submit,
    disabled: busy || amountNum <= 0,
    style: {
      flex: 1
    }
  }, busy ? "Đang lưu…" : initial ? "Cập nhật" : "Lưu khoản chi")), initial && React.createElement("div", {
    style: {
      textAlign: "center",
      marginTop: 16
    }
  }, confirmDel ? React.createElement("span", {
    style: {
      fontSize: 13
    }
  }, "Xóa khoản này?", " ", React.createElement("button", {
    onClick: remove,
    style: {
      color: cssVar("--red"),
      fontWeight: 600
    }
  }, "Xóa"), " · ", React.createElement("button", {
    onClick: () => setConfirmDel(false),
    style: {
      color: cssVar("--muted")
    }
  }, "Giữ lại")) : React.createElement(Button, {
    kind: "danger",
    onClick: () => setConfirmDel(true)
  }, "Xóa khoản chi")));
}
function Bills({
  data,
  reload,
  flash
}) {
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const bills = data.bills;
  const pay = async b => {
    try {
      await api(`/bills/${b.id}/pay`, {
        method: "POST",
        body: {
          amount: b.amount
        }
      });
      flash(`Đã ghi nhận thanh toán ${b.name}`);
      reload();
    } catch (e) {
      flash(e.message);
    }
  };
  const groups = [{
    key: "overdue",
    title: "Quá hạn",
    color: "--red"
  }, {
    key: "due_soon",
    title: "Sắp đến hạn",
    color: "--amber"
  }, {
    key: "upcoming",
    title: "Sắp tới",
    color: "--muted"
  }, {
    key: "paused",
    title: "Đã tạm dừng",
    color: "--muted"
  }];
  return React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 22
    }
  }, React.createElement("div", {
    className: "between",
    style: {
      marginBottom: 18
    }
  }, React.createElement("div", null, React.createElement("div", {
    className: "num label"
  }, "Hóa đơn"), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 22,
      fontWeight: 600,
      marginTop: 3
    }
  }, short(bills.filter(b => b.active).reduce((s, b) => s + b.amount, 0)), React.createElement("span", {
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      fontWeight: 400
    }
  }, " / chu kỳ"))), React.createElement(Button, {
    kind: "outline",
    onClick: () => setAdding(true)
  }, "+ Thêm")), bills.length === 0 && React.createElement(Empty, {
    text: "Chưa có hóa đơn nào. Thêm tiền điện, internet, bảo hiểm… để được nhắc trước hạn.",
    action: React.createElement(Button, {
      onClick: () => setAdding(true)
    }, "Thêm hóa đơn")
  }), groups.map(g => {
    const list = bills.filter(b => b.status === g.key);
    if (!list.length) return null;
    return React.createElement("section", {
      key: g.key,
      style: {
        marginBottom: 24
      }
    }, React.createElement("div", {
      className: "num label",
      style: {
        color: cssVar(g.color)
      }
    }, g.title), React.createElement("div", {
      style: {
        marginTop: 10
      }
    }, list.map(b => React.createElement("div", {
      key: b.id,
      className: "tape between",
      style: {
        padding: "13px 0",
        gap: 10
      }
    }, React.createElement("button", {
      onClick: () => setEditing(b),
      style: {
        flex: 1,
        minWidth: 0,
        textAlign: "left"
      }
    }, React.createElement("span", {
      className: "truncate",
      style: {
        display: "block",
        fontSize: 14
      }
    }, b.name), React.createElement("span", {
      className: "num",
      style: {
        fontSize: 11,
        color: cssVar("--muted")
      }
    }, b.next_due, " · ", (RECURRENCE.find(r => r.id === b.recurrence) || {}).label, b.status === "overdue" && React.createElement("span", {
      style: {
        color: cssVar("--red")
      }
    }, " · quá hạn ", Math.abs(b.days_left), " ngày"), b.status === "due_soon" && React.createElement("span", {
      style: {
        color: cssVar("--amber")
      }
    }, " · còn ", b.days_left, " ngày"))), React.createElement("span", {
      className: "row",
      style: {
        gap: 10
      }
    }, React.createElement("span", {
      className: "num",
      style: {
        fontSize: 14,
        fontWeight: 500
      }
    }, short(b.amount)), b.active && React.createElement(Button, {
      kind: "outline",
      style: {
        padding: "5px 12px",
        fontSize: 12
      },
      onClick: () => pay(b)
    }, "Đã trả"))))));
  }), (adding || editing) && React.createElement(BillForm, {
    data: data,
    initial: editing,
    flash: flash,
    onClose: () => {
      setAdding(false);
      setEditing(null);
    },
    onSaved: () => {
      setAdding(false);
      setEditing(null);
      reload();
    }
  }));
}
function BillForm({
  data,
  initial,
  onClose,
  onSaved,
  flash
}) {
  const b = initial || {};
  const [name, setName] = useState(b.name || "");
  const [amount, setAmount] = useState(b.amount ? String(b.amount) : "");
  const [categoryId, setCategoryId] = useState(b.category_id || (data.categories.find(c => c.name === "Hóa đơn") || data.categories[0]).id);
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
    api(`/bills/${initial.id}/payments`).then(r => setHistory(r.payments)).catch(() => {});
  }, [initial]);
  const submit = async () => {
    if (!name.trim()) return flash("Cần có tên hóa đơn");
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        amount: Number(amount) || 0,
        category_id: categoryId,
        next_due: nextDue,
        recurrence,
        reminder_days: Number(reminderDays) || 0,
        method,
        card_id: method === "card" ? cardId : null,
        active
      };
      if (initial) await api("/bills/" + initial.id, {
        method: "PUT",
        body
      });else await api("/bills", {
        method: "POST",
        body
      });
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api("/bills/" + initial.id, {
        method: "DELETE"
      });
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };
  return React.createElement(Sheet, {
    title: initial ? "Sửa hóa đơn" : "Thêm hóa đơn",
    onClose: onClose
  }, React.createElement(Field, {
    label: "Tên hóa đơn"
  }, React.createElement("input", {
    className: "field",
    value: name,
    placeholder: "Tiền điện, Internet, Bảo hiểm…",
    autoFocus: !initial,
    onChange: e => setName(e.target.value)
  })), React.createElement(Field, {
    label: "Số tiền mỗi kỳ",
    hint: "Để 0 nếu số tiền thay đổi mỗi tháng"
  }, React.createElement("input", {
    className: "field num",
    type: "number",
    inputMode: "numeric",
    value: amount,
    onChange: e => setAmount(e.target.value)
  })), React.createElement(Field, {
    label: "Hạn thanh toán kế tiếp"
  }, React.createElement("input", {
    className: "field num",
    type: "date",
    value: nextDue,
    style: {
      width: "auto"
    },
    onChange: e => setNextDue(e.target.value)
  })), React.createElement(Field, {
    label: "Chu kỳ lặp"
  }, React.createElement(Chips, {
    options: RECURRENCE,
    value: recurrence,
    onChange: setRecurrence
  })), React.createElement(Field, {
    label: "Nhắc trước",
    hint: "Nhắc trong app và qua Telegram nếu đã cấu hình"
  }, React.createElement(Chips, {
    options: [0, 1, 3, 5, 7].map(d => ({
      id: d,
      label: d === 0 ? "Đúng hạn" : `${d} ngày`
    })),
    value: Number(reminderDays),
    onChange: setReminderDays
  })), React.createElement(Field, {
    label: "Danh mục ghi nhận"
  }, React.createElement(Chips, {
    options: data.categories.map(c => ({
      id: c.id,
      label: `${c.icon} ${c.name}`
    })),
    value: categoryId,
    onChange: setCategoryId
  })), React.createElement(Field, {
    label: "Thanh toán bằng"
  }, React.createElement(Chips, {
    options: METHODS,
    value: method,
    onChange: setMethod
  })), method === "card" && data.cards.length > 0 && React.createElement(Field, {
    label: "Thẻ"
  }, React.createElement(Chips, {
    options: data.cards.map(c => ({
      id: c.id,
      label: `${c.bank}${c.last4 ? " ••" + c.last4 : ""}`
    })),
    value: cardId,
    onChange: setCardId
  })), initial && React.createElement(Field, {
    label: "Trạng thái"
  }, React.createElement(Chips, {
    options: [{
      id: true,
      label: "Đang theo dõi"
    }, {
      id: false,
      label: "Tạm dừng"
    }],
    value: active,
    onChange: setActive
  })), history && history.length > 0 && React.createElement("div", {
    style: {
      marginBottom: 18
    }
  }, React.createElement("div", {
    className: "num label"
  }, "Lịch sử thanh toán"), React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, history.slice(0, 8).map(p => React.createElement("div", {
    key: p.id,
    className: "between num",
    style: {
      fontSize: 12,
      padding: "4px 0",
      color: cssVar("--muted")
    }
  }, React.createElement("span", null, p.paid_date), React.createElement("span", null, money(p.amount)))))), React.createElement("div", {
    className: "row",
    style: {
      gap: 12,
      marginTop: 24
    }
  }, React.createElement(Button, {
    kind: "ghost",
    onClick: onClose
  }, "Hủy"), React.createElement(Button, {
    onClick: submit,
    disabled: busy || !name.trim(),
    style: {
      flex: 1
    }
  }, busy ? "Đang lưu…" : initial ? "Cập nhật" : "Thêm hóa đơn")), initial && React.createElement("div", {
    style: {
      textAlign: "center",
      marginTop: 16
    }
  }, confirmDel ? React.createElement("span", {
    style: {
      fontSize: 13
    }
  }, "Xóa hóa đơn và toàn bộ lịch sử?", " ", React.createElement("button", {
    onClick: remove,
    style: {
      color: cssVar("--red"),
      fontWeight: 600
    }
  }, "Xóa"), " · ", React.createElement("button", {
    onClick: () => setConfirmDel(false),
    style: {
      color: cssVar("--muted")
    }
  }, "Giữ lại")) : React.createElement(Button, {
    kind: "danger",
    onClick: () => setConfirmDel(true)
  }, "Xóa hóa đơn")));
}
function Cards({
  data,
  reload,
  flash
}) {
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(null);
  const cards = data.cards;
  const totalDebt = cards.reduce((s, c) => s + Math.max(0, c.balance), 0);
  const totalLimit = cards.reduce((s, c) => s + c.limit_amount, 0);
  return React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 22
    }
  }, React.createElement("div", {
    className: "between",
    style: {
      marginBottom: 18
    }
  }, React.createElement("div", null, React.createElement("div", {
    className: "num label"
  }, "Tổng dư nợ"), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 26,
      fontWeight: 700,
      marginTop: 3
    }
  }, money(totalDebt)), totalLimit > 0 && React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 2
    }
  }, Math.round(totalDebt / totalLimit * 100), "% trên tổng hạn mức ", short(totalLimit))), React.createElement(Button, {
    kind: "outline",
    onClick: () => setAdding(true)
  }, "+ Thêm")), cards.length === 0 && React.createElement(Empty, {
    text: "Chưa có thẻ nào. Thêm thẻ để mỗi khoản chi bằng thẻ tự cộng vào dư nợ.",
    action: React.createElement(Button, {
      onClick: () => setAdding(true)
    }, "Thêm thẻ")
  }), cards.map(c => {
    const util = c.utilization;
    const color = util > 0.8 ? "--red" : util > 0.5 ? "--amber" : "--green";
    return React.createElement("div", {
      key: c.id,
      className: "box",
      style: {
        padding: 16,
        marginBottom: 12
      }
    }, React.createElement("div", {
      className: "between"
    }, React.createElement("button", {
      onClick: () => setEditing(c),
      style: {
        textAlign: "left",
        flex: 1,
        minWidth: 0
      }
    }, React.createElement("div", {
      className: "truncate",
      style: {
        fontSize: 15,
        fontWeight: 600
      }
    }, c.bank, " ", c.last4 && React.createElement("span", {
      className: "num",
      style: {
        color: cssVar("--muted"),
        fontWeight: 400
      }
    }, "•• ", c.last4)), React.createElement("div", {
      className: "num",
      style: {
        fontSize: 11,
        color: cssVar("--muted"),
        marginTop: 2
      }
    }, "Sao kê ngày ", c.statement_day, " · Hạn trả ngày ", c.due_day, !c.active && " · đã đóng")), React.createElement(Button, {
      kind: "outline",
      style: {
        padding: "6px 14px",
        fontSize: 13
      },
      onClick: () => setPaying(c)
    }, "Trả nợ")), React.createElement("div", {
      style: {
        marginTop: 14
      }
    }, React.createElement("div", {
      className: "between",
      style: {
        alignItems: "baseline",
        marginBottom: 6
      }
    }, React.createElement("span", {
      className: "num",
      style: {
        fontSize: 20,
        fontWeight: 600
      }
    }, money(c.balance)), React.createElement("span", {
      className: "num",
      style: {
        fontSize: 12,
        color: cssVar("--muted")
      }
    }, "còn ", short(c.available))), React.createElement(Bar, {
      value: c.balance,
      max: c.limit_amount || 1,
      color: cssVar(color),
      height: 5
    }), React.createElement("div", {
      className: "num",
      style: {
        fontSize: 11,
        color: cssVar(color),
        marginTop: 5
      }
    }, "dùng ", Math.round(util * 100), "% hạn mức ", short(c.limit_amount), util > 0.8 && " — nên trả bớt trước ngày sao kê")));
  }), (adding || editing) && React.createElement(CardForm, {
    initial: editing,
    flash: flash,
    onClose: () => {
      setAdding(false);
      setEditing(null);
    },
    onSaved: () => {
      setAdding(false);
      setEditing(null);
      reload();
    }
  }), paying && React.createElement(PayCard, {
    card: paying,
    flash: flash,
    onClose: () => setPaying(null),
    onSaved: () => {
      setPaying(null);
      reload();
    }
  }));
}
function CardForm({
  initial,
  onClose,
  onSaved,
  flash
}) {
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
        bank: bank.trim(),
        last4: last4.replace(/\D/g, "").slice(0, 4),
        limit_amount: Number(limitAmount) || 0,
        statement_day: Number(statementDay),
        due_day: Number(dueDay),
        opening: Number(opening) || 0
      };
      if (initial) await api("/cards/" + initial.id, {
        method: "PUT",
        body
      });else await api("/cards", {
        method: "POST",
        body
      });
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api("/cards/" + initial.id, {
        method: "DELETE"
      });
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };
  const days = Array.from({
    length: 28
  }, (_, i) => i + 1);
  return React.createElement(Sheet, {
    title: initial ? "Sửa thẻ" : "Thêm thẻ",
    onClose: onClose
  }, React.createElement(Field, {
    label: "Ngân hàng"
  }, React.createElement("input", {
    className: "field",
    value: bank,
    placeholder: "Techcombank, VIB, Sacombank…",
    autoFocus: !initial,
    onChange: e => setBank(e.target.value)
  })), React.createElement(Field, {
    label: "4 số cuối",
    hint: "Chỉ để phân biệt các thẻ, không lưu số thẻ đầy đủ"
  }, React.createElement("input", {
    className: "field num",
    value: last4,
    inputMode: "numeric",
    maxLength: 4,
    style: {
      width: 110
    },
    onChange: e => setLast4(e.target.value)
  })), React.createElement(Field, {
    label: "Hạn mức"
  }, React.createElement("input", {
    className: "field num",
    type: "number",
    inputMode: "numeric",
    value: limitAmount,
    onChange: e => setLimitAmount(e.target.value)
  })), React.createElement("div", {
    className: "grid2",
    style: {
      marginBottom: 18
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      marginBottom: 8
    }
  }, "Ngày sao kê"), React.createElement("select", {
    className: "field num",
    value: statementDay,
    onChange: e => setStatementDay(e.target.value)
  }, days.map(d => React.createElement("option", {
    key: d,
    value: d
  }, d)))), React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      marginBottom: 8
    }
  }, "Ngày đến hạn"), React.createElement("select", {
    className: "field num",
    value: dueDay,
    onChange: e => setDueDay(e.target.value)
  }, days.map(d => React.createElement("option", {
    key: d,
    value: d
  }, d))))), React.createElement(Field, {
    label: "Dư nợ hiện có",
    hint: "Số đang nợ trước khi bắt đầu dùng app. Để 0 nếu thẻ đang sạch."
  }, React.createElement("input", {
    className: "field num",
    type: "number",
    inputMode: "numeric",
    value: opening,
    onChange: e => setOpening(e.target.value)
  })), React.createElement("div", {
    className: "row",
    style: {
      gap: 12,
      marginTop: 24
    }
  }, React.createElement(Button, {
    kind: "ghost",
    onClick: onClose
  }, "Hủy"), React.createElement(Button, {
    onClick: submit,
    disabled: busy || !bank.trim(),
    style: {
      flex: 1
    }
  }, busy ? "Đang lưu…" : initial ? "Cập nhật" : "Thêm thẻ")), initial && React.createElement("div", {
    style: {
      textAlign: "center",
      marginTop: 16
    }
  }, confirmDel ? React.createElement("span", {
    style: {
      fontSize: 13
    }
  }, "Xóa thẻ? Các khoản chi vẫn giữ nguyên, chỉ bỏ liên kết thẻ.", " ", React.createElement("button", {
    onClick: remove,
    style: {
      color: cssVar("--red"),
      fontWeight: 600
    }
  }, "Xóa"), " · ", React.createElement("button", {
    onClick: () => setConfirmDel(false),
    style: {
      color: cssVar("--muted")
    }
  }, "Giữ lại")) : React.createElement(Button, {
    kind: "danger",
    onClick: () => setConfirmDel(true)
  }, "Xóa thẻ")));
}
function PayCard({
  card,
  onClose,
  onSaved,
  flash
}) {
  const [amount, setAmount] = useState(String(Math.max(0, card.balance)));
  const [paidDate, setPaidDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const amountNum = Number(amount) || 0;
  useEffect(() => {
    api(`/cards/${card.id}/payments`).then(r => setHistory(r.payments)).catch(() => {});
  }, [card.id]);
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/cards/${card.id}/pay`, {
        method: "POST",
        body: {
          amount: amountNum,
          paid_date: paidDate
        }
      });
      flash(`Đã trả ${money(amountNum)} cho ${card.bank}`);
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };
  return React.createElement(Sheet, {
    title: `Trả nợ ${card.bank}`,
    onClose: onClose
  }, React.createElement("div", {
    className: "num",
    style: {
      fontSize: 12,
      color: cssVar("--muted")
    }
  }, "Dư nợ hiện tại"), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 26,
      fontWeight: 700,
      marginBottom: 22
    }
  }, money(card.balance)), React.createElement(Field, {
    label: "Số tiền trả"
  }, React.createElement("input", {
    className: "field num",
    type: "number",
    inputMode: "numeric",
    value: amount,
    autoFocus: true,
    onChange: e => setAmount(e.target.value)
  }), React.createElement("div", {
    className: "wrap",
    style: {
      marginTop: 8
    }
  }, React.createElement("button", {
    className: "num",
    onClick: () => setAmount(String(Math.max(0, card.balance))),
    style: {
      fontSize: 12,
      background: cssVar("--chip"),
      padding: "6px 12px",
      borderRadius: 99
    }
  }, "Toàn bộ ", short(card.balance)), React.createElement("button", {
    className: "num",
    onClick: () => setAmount(String(Math.round(card.balance * 0.05))),
    style: {
      fontSize: 12,
      background: cssVar("--chip"),
      padding: "6px 12px",
      borderRadius: 99
    }
  }, "Tối thiểu 5%"))), React.createElement(Field, {
    label: "Ngày trả"
  }, React.createElement("input", {
    className: "field num",
    type: "date",
    value: paidDate,
    style: {
      width: "auto"
    },
    onChange: e => setPaidDate(e.target.value)
  })), history && history.length > 0 && React.createElement("div", {
    style: {
      marginBottom: 18
    }
  }, React.createElement("div", {
    className: "num label"
  }, "Đã trả gần đây"), React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, history.slice(0, 8).map(p => React.createElement("div", {
    key: p.id,
    className: "between num",
    style: {
      fontSize: 12,
      padding: "4px 0",
      color: cssVar("--muted")
    }
  }, React.createElement("span", null, p.paid_date), React.createElement("span", null, money(p.amount)))))), React.createElement("div", {
    className: "row",
    style: {
      gap: 12,
      marginTop: 24
    }
  }, React.createElement(Button, {
    kind: "ghost",
    onClick: onClose
  }, "Hủy"), React.createElement(Button, {
    onClick: submit,
    disabled: busy || amountNum <= 0,
    style: {
      flex: 1
    }
  }, busy ? "Đang lưu…" : "Ghi nhận thanh toán")));
}
const TRADE_TYPES = [{
  id: "BUY",
  label: "Mua",
  needs: ["symbol", "qty", "priceVND"]
}, {
  id: "SELL",
  label: "Bán",
  needs: ["symbol", "qty", "priceVND"]
}, {
  id: "DEPOSIT",
  label: "Nạp tiền",
  needs: ["cash"]
}, {
  id: "WITHDRAW",
  label: "Rút tiền",
  needs: ["cash"]
}, {
  id: "DIVIDEND_CASH",
  label: "Cổ tức tiền",
  needs: ["cash"]
}, {
  id: "INTEREST",
  label: "Lãi/phí margin",
  needs: ["cash"]
}, {
  id: "STOCK_BONUS",
  label: "CP thưởng",
  needs: ["symbol", "qty"]
}, {
  id: "ADJUSTMENT",
  label: "Điều chỉnh",
  needs: ["cash"]
}, {
  id: "INIT_CASH",
  label: "Khởi tạo",
  needs: ["cash"]
}];
function Invest({
  flash
}) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [trade, setTrade] = useState(null);
  const [hist, setHist] = useState(null);
  const [showHist, setShowHist] = useState(false);
  const [showVoided, setShowVoided] = useState(false);
  const [tool, setTool] = useState(null);
  const [flow, setFlow] = useState(null);
  const load = useCallback(() => {
    setBusy(true);
    api("/portfolio").then(d => {
      setData(d);
      setErr("");
    }).catch(e => setErr(e.message)).finally(() => setBusy(false));
    api(`/stock/history?limit=200${showVoided ? "&voided=1" : ""}`).then(setHist).catch(() => {});
    api("/stock/cashflow").then(setFlow).catch(() => {});
  }, [showVoided]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!data || !data.price_info || !data.price_info.market_open) return;
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [data, load]);
  if (err) return React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 30,
      color: cssVar("--red"),
      fontSize: 14
    }
  }, err);
  if (busy && !data) return React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 40,
      textAlign: "center",
      color: cssVar("--muted"),
      fontSize: 14
    }
  }, "Đang tải…");
  const s = data && data.snapshot;
  if (!s) {
    return React.createElement("div", {
      className: "pad"
    }, React.createElement(Empty, {
      text: "Chưa nhận được dữ liệu danh mục."
    }), React.createElement("div", {
      className: "box",
      style: {
        padding: 16
      }
    }, React.createElement("div", {
      className: "num label"
    }, "Cách hoạt động"), React.createElement("p", {
      style: {
        fontSize: 13,
        color: cssVar("--muted"),
        lineHeight: 1.7,
        marginTop: 10,
        marginBottom: 0
      }
    }, "Sổ giao dịch nằm ngay trong Sổ Chi và được tính lại bằng phương pháp FIFO mỗi lần mở. Chưa có gì ở đây nghĩa là sổ còn trống — bấm ", React.createElement("b", null, "+ Giao dịch"), " để nhập lệnh đầu tiên, hoặc ", React.createElement("b", null, "Nhập nhiều"), " nếu muốn dán cả danh mục vào một lần.")));
  }
  const plColor = v => v == null ? cssVar("--muted") : v > 0 ? cssVar("--green") : v < 0 ? cssVar("--red") : cssVar("--ink");
  const sign = v => v > 0 ? "+" : "";
  return React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 22
    }
  }, s.degraded && React.createElement("div", {
    className: "box",
    style: {
      padding: 12,
      marginBottom: 18,
      borderColor: cssVar("--amber")
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      color: cssVar("--amber")
    }
  }, "Thiếu giá thị trường của ", (s.price_missing || []).join(", ") || "một số mã", " nên NAV và lãi/lỗ chưa tính được. Giá vốn và số lượng vẫn chính xác.")), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      justifyContent: "flex-end",
      marginBottom: 8
    }
  }, React.createElement(Button, {
    kind: "outline",
    onClick: () => setTool("analysis"),
    style: {
      padding: "6px 12px",
      fontSize: 12
    }
  }, "Phân tích"), React.createElement(Button, {
    kind: "outline",
    onClick: () => setTool("events"),
    style: {
      padding: "6px 12px",
      fontSize: 12
    }
  }, "Lịch quyền"), React.createElement(Button, {
    kind: "outline",
    onClick: () => setTool("report"),
    style: {
      padding: "6px 12px",
      fontSize: 12
    }
  }, "Báo cáo"), React.createElement(Button, {
    kind: "outline",
    onClick: () => setTool("alerts"),
    style: {
      padding: "6px 12px",
      fontSize: 12
    }
  }, "Mốc giá"), React.createElement(Button, {
    kind: "outline",
    onClick: () => setTool("reconcile"),
    style: {
      padding: "6px 12px",
      fontSize: 12
    }
  }, "Đối chiếu"), React.createElement(Button, {
    kind: "outline",
    onClick: () => setTool("batch"),
    style: {
      padding: "6px 12px",
      fontSize: 12
    }
  }, "Nhập nhiều"), React.createElement(Button, {
    kind: "outline",
    onClick: () => setTrade({}),
    style: {
      padding: "6px 12px",
      fontSize: 12
    }
  }, "+ Giao dịch")), React.createElement("section", {
    style: {
      marginBottom: 24
    }
  }, React.createElement("div", {
    className: "num label"
  }, "Tổng tài sản ròng"), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 34,
      fontWeight: 700,
      letterSpacing: "-.02em",
      marginTop: 3
    }
  }, s.nav != null ? money(s.nav) : "—"), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 6
    }
  }, s.live_prices ? React.createElement("span", {
    style: {
      color: cssVar("--green")
    }
  }, "giá ", data.price_info && data.price_info.market_open ? "trực tiếp" : "đóng cửa", data.price_info && ` lúc ${new Date(data.price_info.at).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit"
  })}`) : React.createElement("span", {
    style: {
      color: cssVar("--amber")
    }
  }, data.price_error ? `không lấy được giá: ${data.price_error}` : "đang dùng giá của lần đẩy gần nhất"), "  ·  vị thế ", data.age_minutes < 1 ? "vừa cập nhật" : `cập nhật ${data.age_minutes} phút trước`, "  ·  ", React.createElement("button", {
    onClick: load,
    style: {
      color: cssVar("--blue"),
      fontSize: 11
    }
  }, "tải lại"))), React.createElement("section", {
    className: "grid2",
    style: {
      marginBottom: 12
    }
  }, React.createElement("div", {
    className: "box",
    style: {
      padding: 14
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: cssVar("--muted")
    }
  }, "Lãi/lỗ tạm tính"), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 18,
      fontWeight: 600,
      marginTop: 3,
      color: plColor(s.unrealized_pl)
    }
  }, s.unrealized_pl != null ? `${sign(s.unrealized_pl)}${short(s.unrealized_pl)}` : "—"), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 2
    }
  }, s.unrealized_pct != null ? `${sign(s.unrealized_pct)}${s.unrealized_pct.toFixed(2)}% · chưa bán` : "chưa có giá")), React.createElement("div", {
    className: "box",
    style: {
      padding: 14
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: cssVar("--muted")
    }
  }, "Lãi/lỗ đã chốt"), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 18,
      fontWeight: 600,
      marginTop: 3,
      color: plColor(s.realized_pl)
    }
  }, s.realized_pl ? `${sign(s.realized_pl)}${short(s.realized_pl)}` : "0"), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 2
    }
  }, hist && hist.realized ? `${hist.realized.length} lần bán` : "đã bán"))), React.createElement("section", {
    className: "grid2",
    style: {
      marginBottom: 24
    }
  }, React.createElement("div", {
    className: "box",
    style: {
      padding: 14
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: cssVar("--muted")
    }
  }, "Giá trị cổ phiếu"), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 18,
      fontWeight: 600,
      marginTop: 3
    }
  }, s.stock_value != null ? short(s.stock_value) : "—")), React.createElement("div", {
    className: "box",
    style: {
      padding: 14
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: cssVar("--muted")
    }
  }, s.margin_debt > 0 ? "Dư nợ margin" : "Tiền mặt"), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 18,
      fontWeight: 600,
      marginTop: 3,
      color: s.margin_debt > 0 ? cssVar("--red") : cssVar("--ink")
    }
  }, short(s.margin_debt > 0 ? s.margin_debt : s.cash)), flow && flow.pending_in > 0 && React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--amber"),
      marginTop: 4
    }
  }, short(flow.pending_in), " chưa về"))), flow && flow.pending_in > 0 && React.createElement("section", {
    className: "box",
    style: {
      padding: 14,
      marginBottom: 20
    }
  }, React.createElement("div", {
    className: "between"
  }, React.createElement("span", {
    style: {
      fontSize: 13
    }
  }, "Tiền bán đang về"), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 14,
      fontWeight: 600
    }
  }, "dùng được ", short(flow.available))), flow.pending.map((p, i) => React.createElement("div", {
    key: i,
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 6
    }
  }, p.symbol, " ", nf.format(p.qty), " cp bán ", p.sell_date, " · về ", p.settle_date, " · ", short(p.amount))), React.createElement("div", {
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 8,
      lineHeight: 1.6
    }
  }, "Sổ đã ghi nhận số tiền này ngay lúc bán, nhưng phải chờ T+2 mới rút hay mua tiếp được.")), s.margin_debt > 0 && s.stock_value > 0 && React.createElement("section", {
    style: {
      marginBottom: 24
    }
  }, React.createElement("div", {
    className: "between",
    style: {
      alignItems: "baseline",
      marginBottom: 6
    }
  }, React.createElement("span", {
    style: {
      fontSize: 13
    }
  }, "Tỷ lệ nợ trên tài sản"), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 13,
      fontWeight: 500
    }
  }, (s.margin_debt / s.stock_value * 100).toFixed(1), "%")), React.createElement(Bar, {
    value: s.margin_debt,
    max: s.stock_value,
    height: 5,
    color: s.margin_debt / s.stock_value > 0.5 ? cssVar("--red") : cssVar("--amber")
  })), React.createElement(SectionLabel, null, "Vị thế đang giữ"), React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, (s.positions || []).map(p => React.createElement("div", {
    key: p.symbol,
    className: "tape",
    style: {
      padding: "14px 0"
    }
  }, React.createElement("div", {
    className: "between",
    style: {
      alignItems: "baseline"
    }
  }, React.createElement("span", {
    className: "num",
    style: {
      fontSize: 16,
      fontWeight: 600,
      letterSpacing: ".02em"
    }
  }, p.symbol), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: plColor(p.pl)
    }
  }, p.pl != null ? `${sign(p.pl)}${short(p.pl)}` : "—", p.pl_pct != null && React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 400
    }
  }, " ", sign(p.pl_pct), p.pl_pct.toFixed(2), "%"))), React.createElement("div", {
    className: "between num",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 4
    }
  }, React.createElement("span", null, nf.format(p.qty), " cp · vốn ", nf.format(p.avg_cost), " · giá ", p.market_price != null ? nf.format(p.market_price) : "—", p.day_change_pct != null && React.createElement("span", {
    style: {
      color: plColor(p.day_change)
    }
  }, " ", "(", sign(p.day_change_pct), p.day_change_pct.toFixed(2), "% hôm nay)")), React.createElement("span", null, p.weight != null ? `${p.weight.toFixed(1)}%` : "")), p.pending_qty > 0 ? React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      marginTop: 4,
      color: cssVar("--amber")
    }
  }, "bán được ", nf.format(p.sellable), " cp · còn ", nf.format(p.pending_qty), " cp chờ về", p.pending && p.pending[0] ? ` ngày ${p.pending[0].settle_date}` : "") : React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      marginTop: 4,
      color: cssVar("--green")
    }
  }, "đã về tài khoản, bán được toàn bộ"), p.weight != null && React.createElement("div", {
    style: {
      marginTop: 7
    }
  }, React.createElement(Bar, {
    value: p.weight,
    max: 100,
    color: p.weight > 40 ? cssVar("--amber") : cssVar("--blue"),
    height: 3
  })), p.weight > 40 && React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--amber"),
      marginTop: 5
    }
  }, "tỷ trọng trên 40%, danh mục đang tập trung vào mã này"), p.su_kien_gan_nhat && React.createElement(EventLine, {
    ev: p.su_kien_gan_nhat,
    qty: p.qty
  })))), hist && hist.realized && hist.realized.length > 0 && React.createElement("section", {
    style: {
      marginTop: 28
    }
  }, React.createElement(SectionLabel, null, "Đã chốt lời lỗ"), React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, hist.realized.slice(0, 8).map((r, i) => React.createElement("div", {
    key: i,
    className: "tape between",
    style: {
      padding: "11px 0"
    }
  }, React.createElement("span", {
    style: {
      minWidth: 0
    }
  }, React.createElement("span", {
    className: "num",
    style: {
      fontSize: 14,
      fontWeight: 600
    }
  }, r.symbol), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted")
    }
  }, " ", nf.format(r.qty), " cp · ", r.date, " · giữ ", r.holdDays, " ngày")), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 14,
      fontWeight: 500,
      color: plColor(r.pl)
    }
  }, sign(r.pl), short(r.pl), React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 400
    }
  }, " ", sign(r.plPct), r.plPct.toFixed(1), "%")))))), hist && hist.history && hist.history.length > 0 && React.createElement("section", {
    style: {
      marginTop: 28
    }
  }, React.createElement(SectionLabel, {
    right: React.createElement("button", {
      onClick: () => setShowHist(!showHist),
      style: {
        fontSize: 12,
        color: cssVar("--blue")
      }
    }, showHist ? "thu gọn" : `xem tất cả (${hist.history.length})`)
  }, "Sổ giao dịch"), React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, (showHist ? hist.history : hist.history.slice(0, 5)).map(h => React.createElement("div", {
    key: h.id,
    className: "tape between",
    style: {
      padding: "10px 0",
      alignItems: "flex-start",
      opacity: h.voided ? 0.45 : 1
    }
  }, React.createElement("span", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, React.createElement("span", {
    style: {
      fontSize: 13
    }
  }, h.label, h.symbol && React.createElement("span", {
    className: "num",
    style: {
      fontWeight: 600
    }
  }, " ", h.symbol), h.voided && React.createElement("span", {
    style: {
      color: cssVar("--red"),
      fontSize: 11
    }
  }, " · đã hủy")), React.createElement("span", {
    className: "num",
    style: {
      display: "block",
      fontSize: 11,
      color: cssVar("--muted")
    }
  }, h.date, h.qty ? ` · ${nf.format(h.qty)} cp` : "", h.price_vnd ? ` · ${nf.format(h.price_vnd)}` : "", h.note ? ` · ${h.note}` : ""), h.type === "INIT_CASH" && React.createElement("span", {
    style: {
      display: "block",
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 2
    }
  }, "số dư khai lúc bắt đầu ghi sổ — các lệnh mua trước ngày này không trừ tiền lại")), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 13,
      flexShrink: 0,
      marginLeft: 12,
      color: h.cash != null && h.cash < 0 ? cssVar("--red") : cssVar("--ink")
    }
  }, h.cash != null ? money(h.cash) : h.qty && h.price_vnd ? short(h.qty * h.price_vnd) : "")))), hist.undoable && React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, React.createElement(UndoLast, {
    flash: flash,
    onDone: load,
    last: hist.undoable
  })), hist.voided_count > 0 && React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, React.createElement("button", {
    onClick: () => setShowVoided(!showVoided),
    style: {
      fontSize: 12,
      color: cssVar("--muted")
    }
  }, showVoided ? "ẩn giao dịch đã hủy" : `hiện ${hist.voided_count} giao dịch đã hủy`))), React.createElement("p", {
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 24,
      lineHeight: 1.6
    }
  }, "Số liệu tính từ sổ giao dịch FIFO của chính bạn, không phải số liệu chính thức từ công ty chứng khoán và không phải khuyến nghị đầu tư. Đối chiếu với app TCBS trước khi ra quyết định."), trade && React.createElement(TradeForm, {
    flash: flash,
    onClose: () => setTrade(null),
    onSaved: () => {
      setTrade(null);
      load();
    }
  }), tool === "reconcile" && React.createElement(Reconcile, {
    flash: flash,
    onClose: () => setTool(null),
    onSaved: load
  }), tool === "batch" && React.createElement(BatchEntry, {
    flash: flash,
    onClose: () => setTool(null),
    onSaved: load
  }), tool === "report" && React.createElement(InvestReport, {
    onClose: () => setTool(null)
  }), tool === "alerts" && React.createElement(PriceAlerts, {
    flash: flash,
    onClose: () => setTool(null)
  }), tool === "analysis" && React.createElement(InvestAnalysis, {
    flash: flash,
    onClose: () => setTool(null)
  }), tool === "events" && React.createElement(StockEvents, {
    flash: flash,
    onClose: () => setTool(null)
  }));
}
const SUGGESTIONS = ["Tháng này tôi tiêu nhiều nhất vào đâu?", "So với tháng trước tôi tiêu tăng hay giảm?", "Có danh mục nào đang tăng bất thường không?", "Chi tiếp khách tháng này bao nhiêu?", "Tôi có khoản nào sắp phải trả không?"];
function Assistant({
  data,
  month,
  flash
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tips, setTips] = useState([]);
  const endRef = useRef(null);
  useEffect(() => {
    api(`/insights?month=${month}`).then(r => setTips(r.insights || [])).catch(() => {});
  }, [month]);
  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });
  }, [messages, busy]);
  const send = async text => {
    const question = (text || input).trim();
    if (!question || busy) return;
    setInput("");
    const history = messages.map(m => ({
      role: m.role,
      text: m.text
    }));
    setMessages(prev => [...prev, {
      role: "user",
      text: question
    }]);
    setBusy(true);
    try {
      const r = await api("/assistant", {
        method: "POST",
        body: {
          question,
          history,
          month
        }
      });
      setMessages(prev => [...prev, {
        role: "model",
        text: r.answer
      }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: "model",
        text: e.message,
        error: true
      }]);
    }
    setBusy(false);
  };
  if (!data.assistant_enabled) {
    return React.createElement("div", {
      className: "pad",
      style: {
        paddingTop: 30
      }
    }, React.createElement(Empty, {
      text: "Trợ lý chưa bật."
    }), React.createElement("p", {
      style: {
        fontSize: 13,
        color: cssVar("--muted"),
        lineHeight: 1.7
      }
    }, "Thêm ", React.createElement("span", {
      className: "num"
    }, "GEMINI_API_KEY"), " vào file .env trên máy chủ rồi khởi động lại dịch vụ để bật."));
  }
  return React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 20
    }
  }, tips.length > 0 && React.createElement("section", {
    style: {
      marginBottom: 20
    }
  }, React.createElement(SectionLabel, null, "Đáng chú ý"), React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, tips.map((t, i) => React.createElement("div", {
    key: i,
    className: "row",
    style: {
      gap: 8,
      padding: "6px 0",
      fontSize: 13
    }
  }, React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 99,
      flexShrink: 0,
      background: cssVar(t.level === "red" ? "--red" : "--amber")
    }
  }), React.createElement("span", null, t.text))))), messages.length === 0 ? React.createElement("section", {
    style: {
      marginBottom: 20
    }
  }, React.createElement(SectionLabel, null, "Thử hỏi"), React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, SUGGESTIONS.map(s => React.createElement("button", {
    key: s,
    onClick: () => send(s),
    className: "tape",
    style: {
      width: "100%",
      textAlign: "left",
      padding: "12px 0",
      fontSize: 14
    }
  }, s)))) : React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, messages.map((m, i) => React.createElement("div", {
    key: i,
    style: {
      marginBottom: 16,
      display: "flex",
      justifyContent: m.role === "user" ? "flex-end" : "flex-start"
    }
  }, React.createElement("div", {
    style: {
      maxWidth: "86%",
      padding: "10px 14px",
      borderRadius: 14,
      fontSize: 14,
      lineHeight: 1.6,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      background: m.role === "user" ? cssVar("--ink") : cssVar("--card"),
      color: m.role === "user" ? cssVar("--onink") : m.error ? cssVar("--red") : cssVar("--ink"),
      border: m.role === "user" ? "none" : `1px solid ${cssVar("--line")}`
    }
  }, m.text))), busy && React.createElement("div", {
    className: "row",
    style: {
      gap: 8,
      color: cssVar("--muted"),
      fontSize: 13,
      padding: "4px 0"
    }
  }, React.createElement("span", {
    className: "spin"
  }), " đang xem số liệu…"), React.createElement("div", {
    ref: endRef
  })), React.createElement("div", {
    className: "row",
    style: {
      gap: 8,
      position: "sticky",
      bottom: 96,
      background: cssVar("--paper"),
      paddingTop: 8,
      paddingBottom: 4
    }
  }, React.createElement("input", {
    className: "field",
    value: input,
    placeholder: "Hỏi về chi tiêu của bạn…",
    onChange: e => setInput(e.target.value),
    onKeyDown: e => e.key === "Enter" && send()
  }), React.createElement(Button, {
    onClick: () => send(),
    disabled: busy || !input.trim(),
    style: {
      borderRadius: 8,
      padding: "10px 18px",
      fontSize: 14
    }
  }, "Gửi")), React.createElement("p", {
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 12,
      lineHeight: 1.6
    }
  }, "Mọi con số do máy chủ tính bằng SQL, trợ lý chỉ diễn giải chứ không tự tính. Phần này không đưa khuyến nghị đầu tư."));
}
function UndoLast({
  last,
  onDone,
  flash
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const undo = async () => {
    setBusy(true);
    try {
      await api("/stock/undo", {
        method: "POST",
        body: {
          reason: "huy tu app"
        }
      });
      flash("Đã hủy giao dịch cuối");
      onDone();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };
  if (!confirm) {
    return React.createElement(Button, {
      kind: "danger",
      onClick: () => setConfirm(true)
    }, "Hủy giao dịch cuối (", last.label, last.symbol ? " " + last.symbol : "", " ", last.date, ")");
  }
  return React.createElement("span", {
    style: {
      fontSize: 13
    }
  }, "Hủy ", last.label, last.symbol ? " " + last.symbol : "", " ngày ", last.date, "?", " ", React.createElement("button", {
    onClick: undo,
    disabled: busy,
    style: {
      color: cssVar("--red"),
      fontWeight: 600
    }
  }, busy ? "đang hủy…" : "Hủy"), " · ", React.createElement("button", {
    onClick: () => setConfirm(false),
    style: {
      color: cssVar("--muted")
    }
  }, "Giữ lại"));
}
function TradeForm({
  onClose,
  onSaved,
  flash
}) {
  const [type, setType] = useState("BUY");
  const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [cash, setCash] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const spec = TRADE_TYPES.find(t => t.id === type) || TRADE_TYPES[0];
  const needs = f => spec.needs.includes(f);
  const qtyNum = Number(qty) || 0;
  const priceNum = Number(price) || 0;
  const cashNum = Number(cash) || 0;
  const gross = qtyNum * priceNum;
  const ready = (!needs("symbol") || /^[A-Za-z]{3}$/.test(symbol.trim())) && (!needs("qty") || qtyNum > 0) && (!needs("priceVND") || priceNum > 0) && (!needs("cash") || cashNum !== 0);
  const submit = async () => {
    setBusy(true);
    try {
      const body = {
        type,
        date,
        note: note.trim()
      };
      if (needs("symbol")) body.symbol = symbol.trim().toUpperCase();
      if (needs("qty")) body.qty = qtyNum;
      if (needs("priceVND")) body.priceVND = priceNum;
      if (needs("cash")) body.cash = cashNum;
      await api("/stock/tx", {
        method: "POST",
        body
      });
      flash("Đã ghi vào sổ");
      onSaved();
    } catch (e) {
      flash(e.message);
      setBusy(false);
    }
  };
  return React.createElement(Sheet, {
    title: "Ghi giao dịch",
    onClose: onClose
  }, React.createElement(Field, {
    label: "Loại giao dịch"
  }, React.createElement(Chips, {
    options: TRADE_TYPES.map(t => ({
      id: t.id,
      label: t.label
    })),
    value: type,
    onChange: setType
  })), needs("symbol") && React.createElement(Field, {
    label: "Mã chứng khoán"
  }, React.createElement("input", {
    className: "field num",
    value: symbol,
    maxLength: 3,
    autoFocus: true,
    placeholder: "HCM",
    style: {
      width: 120,
      textTransform: "uppercase"
    },
    onChange: e => setSymbol(e.target.value.replace(/[^A-Za-z]/g, ""))
  })), needs("qty") && React.createElement(Field, {
    label: "Số lượng"
  }, React.createElement("input", {
    className: "field num",
    type: "number",
    inputMode: "numeric",
    value: qty,
    placeholder: "5000",
    onChange: e => setQty(e.target.value)
  })), needs("priceVND") && React.createElement(Field, {
    label: "Giá khớp",
    hint: "Nhập theo ĐỒNG: 25900, không phải 25,9"
  }, React.createElement("input", {
    className: "field num",
    type: "number",
    inputMode: "numeric",
    value: price,
    placeholder: "25900",
    onChange: e => setPrice(e.target.value)
  }), priceNum > 0 && priceNum < 1000 && React.createElement("div", {
    style: {
      fontSize: 12,
      color: cssVar("--red"),
      marginTop: 6
    }
  }, nf.format(priceNum), "đ một cổ phiếu — có phải bạn định nhập ", nf.format(priceNum * 1000), "đ?")), needs("cash") && React.createElement(Field, {
    label: "Số tiền",
    hint: type === "ADJUSTMENT" || type === "INTEREST" ? "Số âm để trừ tiền, ví dụ phí margin" : null
  }, React.createElement("input", {
    className: "field num",
    type: "number",
    inputMode: "numeric",
    value: cash,
    autoFocus: true,
    placeholder: "10000000",
    onChange: e => setCash(e.target.value)
  }), cashNum !== 0 && React.createElement("div", {
    className: "num",
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      marginTop: 6
    }
  }, money(cashNum))), gross > 0 && React.createElement("div", {
    className: "box",
    style: {
      padding: 12,
      marginBottom: 18
    }
  }, React.createElement("div", {
    className: "between num",
    style: {
      fontSize: 13
    }
  }, React.createElement("span", {
    style: {
      color: cssVar("--muted")
    }
  }, "Giá trị lệnh"), React.createElement("span", {
    style: {
      fontWeight: 600
    }
  }, money(gross))), type === "SELL" && React.createElement("div", {
    className: "between num",
    style: {
      fontSize: 12,
      marginTop: 5,
      color: cssVar("--muted")
    }
  }, React.createElement("span", null, "Thuế bán 0,1%"), React.createElement("span", null, "−", money(Math.round(gross * 0.001))))), React.createElement(Field, {
    label: "Ngày giao dịch"
  }, React.createElement("input", {
    className: "field num",
    type: "date",
    value: date,
    style: {
      width: "auto"
    },
    onChange: e => setDate(e.target.value)
  })), React.createElement(Field, {
    label: "Ghi chú"
  }, React.createElement("input", {
    className: "field",
    value: note,
    placeholder: "tuỳ chọn",
    onChange: e => setNote(e.target.value)
  })), React.createElement("div", {
    className: "row",
    style: {
      gap: 12,
      marginTop: 24
    }
  }, React.createElement(Button, {
    kind: "ghost",
    onClick: onClose
  }, "Hủy"), React.createElement(Button, {
    onClick: submit,
    disabled: busy || !ready,
    style: {
      flex: 1
    }
  }, busy ? "Đang ghi…" : "Ghi vào sổ")), React.createElement("p", {
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 16,
      lineHeight: 1.6
    }
  }, "Sổ chỉ ghi thêm, không sửa và không xóa. Nếu nhập nhầm, dùng nút hủy giao dịch cuối — giao dịch vẫn được lưu lại nhưng không còn tính vào số dư."));
}
function Reconcile({
  onClose,
  onSaved,
  flash
}) {
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
    api("/portfolio").then(d => {
      const list = d.snapshot && d.snapshot.positions || [];
      setPos(Object.fromEntries(list.map(p => [p.symbol, String(p.qty)])));
    }).catch(() => {});
  }, []);
  const run = path => {
    setBusy(true);
    setErr("");
    const positions = {};
    for (const [k, v] of Object.entries(pos)) {
      if (String(v).trim() !== "") positions[k] = Number(String(v).replace(/[^\d-]/g, "")) || 0;
    }
    const body = {
      date,
      cash: Number(String(cash).replace(/[^\d-]/g, "")),
      positions,
      kind
    };
    return api(path, {
      method: "POST",
      body
    }).then(d => {
      setChk(d);
      return d;
    }).catch(e => {
      setErr(e.message);
      throw e;
    }).finally(() => setBusy(false));
  };
  const doApply = () => {
    run("/stock/broker/apply").then(d => {
      flash(`Đã ghi ${d.da_ghi.type === "INTEREST" ? "lãi vay" : "điều chỉnh"} ${money(d.da_ghi.cash)}`);
      onSaved();
      onClose();
    }).catch(() => {});
  };
  const doMark = () => {
    run("/stock/broker/mark").then(() => {
      flash("Đã đóng mốc đối chiếu");
      onSaved();
      onClose();
    }).catch(() => {});
  };
  const f = n => n == null ? "—" : money(n);
  return React.createElement(Sheet, {
    title: "Đối chiếu với công ty chứng khoán",
    onClose: onClose
  }, React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 18
    }
  }, React.createElement("p", {
    style: {
      fontSize: 13,
      color: cssVar("--muted"),
      lineHeight: 1.7,
      marginTop: 0
    }
  }, "Mở app công ty chứng khoán, đọc số dư tiền và số lượng từng mã rồi nhập vào đây. Sổ Chi so với số của mình và chỉ ra chỗ lệch."), book && React.createElement("div", {
    className: "box",
    style: {
      padding: 12,
      marginBottom: 16
    }
  }, React.createElement("div", {
    className: "num label"
  }, "Sổ Chi đang ghi"), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 15,
      marginTop: 4
    }
  }, f(book.cash)), book.pending_in > 0 && React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 3
    }
  }, "trong đó ", short(book.pending_in), " tiền bán chưa về tài khoản")), React.createElement(Field, {
    label: "Ngày đối chiếu"
  }, React.createElement("input", {
    type: "date",
    value: date,
    onChange: e => {
      setDate(e.target.value);
      setChk(null);
    }
  })), React.createElement(Field, {
    label: "Số dư tiền thật (đồng)",
    hint: "Số âm nếu đang dư nợ margin"
  }, React.createElement("input", {
    inputMode: "numeric",
    value: cash,
    placeholder: "-63395000",
    onChange: e => {
      setCash(e.target.value);
      setChk(null);
    }
  })), Object.keys(pos).length > 0 && React.createElement("div", {
    style: {
      marginTop: 4,
      marginBottom: 8
    }
  }, React.createElement("div", {
    className: "num label",
    style: {
      marginBottom: 8
    }
  }, "Số lượng thật từng mã"), Object.keys(pos).sort().map(sym => React.createElement("div", {
    key: sym,
    className: "between",
    style: {
      marginBottom: 8,
      gap: 12
    }
  }, React.createElement("span", {
    className: "num",
    style: {
      fontSize: 14,
      width: 46
    }
  }, sym), React.createElement("input", {
    inputMode: "numeric",
    value: pos[sym],
    style: {
      flex: 1
    },
    onChange: e => {
      setPos({
        ...pos,
        [sym]: e.target.value
      });
      setChk(null);
    }
  }))), React.createElement("div", {
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      lineHeight: 1.6
    }
  }, "Nếu app công ty chứng khoán có mã không nằm trong danh sách này, đừng đối chiếu vội — nhập lệnh còn thiếu trước đã.")), err && React.createElement("div", {
    style: {
      color: cssVar("--red"),
      fontSize: 13,
      marginTop: 12
    }
  }, err), chk && !chk.error && React.createElement("div", {
    className: "box",
    style: {
      padding: 14,
      marginTop: 16,
      borderColor: chk.lech === 0 ? cssVar("--green") : chk.tu_ghi_duoc ? cssVar("--amber") : cssVar("--red")
    }
  }, React.createElement("div", {
    className: "between"
  }, React.createElement("span", {
    style: {
      fontSize: 12,
      color: cssVar("--muted")
    }
  }, "Chênh lệch"), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 18,
      fontWeight: 600,
      color: chk.lech === 0 ? cssVar("--green") : cssVar("--ink")
    }
  }, chk.lech === 0 ? "Khớp" : (chk.lech > 0 ? "+" : "") + money(chk.lech))), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 6
    }
  }, "sổ ", short(chk.tien_so_sach), " · thực tế ", short(chk.tien_thuc_te), " · ngưỡng tự ghi ", short(chk.nguong), " cho ", chk.so_ngay, " ngày"), chk.lech_vi_the.length > 0 && React.createElement("div", {
    style: {
      marginTop: 10,
      paddingTop: 10,
      borderTop: `1px solid ${cssVar("--line")}`
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      color: cssVar("--red"),
      marginBottom: 6
    }
  }, "Số lượng lệch"), chk.lech_vi_the.map(d => React.createElement("div", {
    key: d.symbol,
    className: "num",
    style: {
      fontSize: 12,
      marginBottom: 3
    }
  }, d.symbol, ": sổ ", d.so_sach, " · thực tế ", d.thuc_te, " (", d.lech > 0 ? "+" : "", d.lech, ")"))), chk.ghi_chu && React.createElement("div", {
    style: {
      fontSize: 12,
      color: chk.tu_ghi_duoc ? cssVar("--muted") : cssVar("--red"),
      marginTop: 10,
      lineHeight: 1.6
    }
  }, chk.ghi_chu), chk.tu_ghi_duoc && React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, React.createElement("div", {
    className: "num label",
    style: {
      marginBottom: 6
    }
  }, "Ghi khoản lệch này vào đâu"), React.createElement(Chips, {
    value: kind,
    onChange: setKind,
    options: [{
      id: "INTEREST",
      label: "Lãi vay & phí"
    }, {
      id: "DIVIDEND_CASH",
      label: "Cổ tức"
    }, {
      id: "ADJUSTMENT",
      label: "Khác"
    }]
  }))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 20
    }
  }, React.createElement(Button, {
    kind: "outline",
    onClick: () => run("/stock/broker/check"),
    disabled: busy || !cash,
    style: {
      flex: 1
    }
  }, busy ? "Đang xem…" : "Xem chênh lệch"), chk && chk.tu_ghi_duoc && React.createElement(Button, {
    onClick: doApply,
    disabled: busy,
    style: {
      flex: 1
    }
  }, "Ghi bút toán"), chk && chk.lech === 0 && chk.vi_the_khop && React.createElement(Button, {
    onClick: doMark,
    disabled: busy,
    style: {
      flex: 1
    }
  }, "Đóng mốc"))));
}
function BatchEntry({
  onClose,
  onSaved,
  flash
}) {
  const [text, setText] = useState("");
  const [prev, setPrev] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const doPreview = () => {
    setBusy(true);
    setErr("");
    api("/stock/batch/preview", {
      method: "POST",
      body: {
        text
      }
    }).then(setPrev).catch(e => setErr(e.message)).finally(() => setBusy(false));
  };
  const doCommit = () => {
    setBusy(true);
    setErr("");
    api("/stock/batch/commit", {
      method: "POST",
      body: {
        text
      }
    }).then(d => {
      flash(`Đã ghi ${d.da_ghi} giao dịch`);
      onSaved();
      onClose();
    }).catch(e => setErr(e.message)).finally(() => setBusy(false));
  };
  const ready = prev && prev.loi === 0 && !prev.loi_tong_the && prev.hop_le > 0;
  return React.createElement(Sheet, {
    title: "Nhập nhiều giao dịch",
    onClose: onClose
  }, React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 18
    }
  }, React.createElement("div", {
    className: "box",
    style: {
      padding: 12,
      marginBottom: 14
    }
  }, React.createElement("div", {
    className: "num label"
  }, "Dán tin nhắn TCBS, hoặc gõ lệnh — mỗi dòng một giao dịch"), React.createElement("pre", {
    className: "num",
    style: {
      fontSize: 12,
      lineHeight: 1.7,
      margin: "8px 0 0",
      color: cssVar("--muted"),
      whiteSpace: "pre-wrap"
    }
  }, `13/08/2026 - TK 105C110678 - Tiểu khoản Ký quỹ:
Đặt mua 5,000 HCM giá 25,950. Đã khớp 5,000 giá 25,950`), React.createElement("div", {
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      margin: "10px 0",
      lineHeight: 1.6
    }
  }, "Tin nhắn chỉ lấy phần ", React.createElement("b", null, "đã khớp"), ", bỏ qua lệnh chờ và lệnh hủy. Số tài khoản không được lưu lại. Dán nhiều tin cùng lúc cũng được."), React.createElement("div", {
    className: "num label",
    style: {
      marginTop: 12
    }
  }, "Hoặc gõ tay"), React.createElement("pre", {
    className: "num",
    style: {
      fontSize: 12,
      lineHeight: 1.8,
      margin: "8px 0 0",
      color: cssVar("--muted"),
      whiteSpace: "pre-wrap"
    }
  }, `MUA HCM 5000 25900 13/08
BAN LPB 1000 49400 25/08
NAP 50tr 01/08
RUT 10tr
COTUC 2tr 15/08
LAIVAY 650k 31/08
THUONG CTS 500 20/08`), React.createElement("div", {
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 10,
      lineHeight: 1.6
    }
  }, "Giá nhập theo đồng. Bỏ trống ngày thì lấy hôm nay. Dòng bắt đầu bằng # được bỏ qua.")), React.createElement("textarea", {
    rows: 8,
    value: text,
    placeholder: "Dán hoặc gõ các lệnh vào đây…",
    onChange: e => {
      setText(e.target.value);
      setPrev(null);
    },
    style: {
      width: "100%",
      fontFamily: "ui-monospace, monospace",
      fontSize: 13,
      lineHeight: 1.7
    }
  }), err && React.createElement("div", {
    style: {
      color: cssVar("--red"),
      fontSize: 13,
      marginTop: 10
    }
  }, err), prev && React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, React.createElement("div", {
    className: "num",
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      marginBottom: 8
    }
  }, prev.hop_le, " dòng hợp lệ", prev.loi > 0 && React.createElement("span", {
    style: {
      color: cssVar("--red")
    }
  }, " · ", prev.loi, " dòng lỗi"), prev.canh_bao > 0 && React.createElement("span", {
    style: {
      color: cssVar("--amber")
    }
  }, " · ", prev.canh_bao, " dòng nghi trùng")), prev.rows.map(r => React.createElement("div", {
    key: r.dong,
    className: "num",
    style: {
      fontSize: 12,
      lineHeight: 1.6,
      marginBottom: 4,
      color: r.loi ? cssVar("--red") : cssVar("--ink")
    }
  }, React.createElement("span", {
    style: {
      color: cssVar("--muted")
    }
  }, r.dong, "."), " ", r.loi ? `${r.raw} — ${r.loi}` : `${r.tx.type} ${r.tx.symbol || ""} ${r.tx.qty || ""} ${r.tx.priceVND || r.tx.cash || ""} ${r.tx.date}`, r.tu_tcbs && !r.loi && React.createElement("span", {
    style: {
      color: cssVar("--muted")
    }
  }, "  · từ tin nhắn"), r.ghi_chu && React.createElement("span", {
    style: {
      color: cssVar("--amber")
    }
  }, "  " + r.ghi_chu), r.canh_bao && React.createElement("span", {
    style: {
      color: cssVar("--amber")
    }
  }, "  ⚠ " + r.canh_bao))), prev.loi_tong_the && React.createElement("div", {
    className: "box",
    style: {
      padding: 12,
      marginTop: 10,
      borderColor: cssVar("--red")
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      color: cssVar("--red"),
      lineHeight: 1.6
    }
  }, "Cả lô không ghi được: ", prev.loi_tong_the))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 18
    }
  }, React.createElement(Button, {
    kind: "outline",
    onClick: doPreview,
    disabled: busy || !text.trim(),
    style: {
      flex: 1
    }
  }, "Xem trước"), ready && React.createElement(Button, {
    onClick: doCommit,
    disabled: busy,
    style: {
      flex: 1
    }
  }, "Ghi ", prev.hop_le, " dòng"))));
}
function InvestReport({
  onClose
}) {
  const [kind, setKind] = useState("month");
  const [data, setData] = useState(null);
  const [bySym, setBySym] = useState(null);
  const [view, setView] = useState("ky");
  useEffect(() => {
    api(`/stock/report?kind=${kind}`).then(setData).catch(() => {});
  }, [kind]);
  useEffect(() => {
    api("/stock/report/symbols").then(setBySym).catch(() => {});
  }, []);
  const plColor = v => v > 0 ? cssVar("--green") : v < 0 ? cssVar("--red") : cssVar("--ink");
  const sign = v => v > 0 ? "+" : "";
  return React.createElement(Sheet, {
    title: "Báo cáo đầu tư",
    onClose: onClose
  }, React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 18
    }
  }, React.createElement(Chips, {
    value: view,
    onChange: setView,
    options: [{
      id: "ky",
      label: "Theo kỳ"
    }, {
      id: "ma",
      label: "Theo mã"
    }]
  }), React.createElement("p", {
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      lineHeight: 1.7,
      marginTop: 14
    }
  }, "Chỉ tính phần ", React.createElement("b", null, "đã bán xong"), ". Lãi lỗ của cổ phiếu đang giữ không gộp vào đây vì nó đổi theo giá từng phút và sẽ làm báo cáo kỳ cũ thay đổi mỗi lần mở lại."), view === "ky" && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      margin: "14px 0"
    }
  }, React.createElement(Chips, {
    value: kind,
    onChange: setKind,
    options: [{
      id: "week",
      label: "Tuần"
    }, {
      id: "month",
      label: "Tháng"
    }, {
      id: "quarter",
      label: "Quý"
    }, {
      id: "year",
      label: "Năm"
    }]
  })), data && data.rows && data.rows.length === 0 && React.createElement(Empty, {
    text: "Chưa có giao dịch nào đã chốt."
  }), data && (data.rows || []).map(r => React.createElement("div", {
    key: r.ky,
    className: "box",
    style: {
      padding: 14,
      marginBottom: 10
    }
  }, React.createElement("div", {
    className: "between"
  }, React.createElement("span", {
    className: "num",
    style: {
      fontSize: 14,
      fontWeight: 600
    }
  }, r.ky), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: plColor(r.lai_da_chot)
    }
  }, sign(r.lai_da_chot), short(r.lai_da_chot))), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 5,
      lineHeight: 1.7
    }
  }, r.so_lan_ban > 0 ? `${r.so_lan_ban} lần bán · thắng ${r.ty_le_thang.toFixed(0)}% · tỷ suất ${sign(r.ty_suat)}${r.ty_suat.toFixed(2)}%` : "không có lệnh bán", r.lai_vay !== 0 && React.createElement(React.Fragment, null, React.createElement("br", null), "lãi vay & phí ", short(r.lai_vay)), r.co_tuc !== 0 && React.createElement(React.Fragment, null, React.createElement("br", null), "cổ tức ", short(r.co_tuc)), r.dieu_chinh !== 0 && React.createElement(React.Fragment, null, React.createElement("br", null), "điều chỉnh ", short(r.dieu_chinh)), (r.nap !== 0 || r.rut !== 0) && React.createElement(React.Fragment, null, React.createElement("br", null), "nạp ", short(r.nap), " · rút ", short(r.rut))), (r.lai_vay !== 0 || r.co_tuc !== 0 || r.dieu_chinh !== 0) && React.createElement("div", {
    className: "between",
    style: {
      marginTop: 8,
      paddingTop: 8,
      borderTop: `1px solid ${cssVar("--line")}`
    }
  }, React.createElement("span", {
    style: {
      fontSize: 11,
      color: cssVar("--muted")
    }
  }, "Ròng cả kỳ"), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: plColor(r.rong)
    }
  }, sign(r.rong), short(r.rong)))))), view === "ma" && React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, bySym && bySym.rows && bySym.rows.length === 0 && React.createElement(Empty, {
    text: "Chưa bán mã nào."
  }), bySym && (bySym.rows || []).map(r => React.createElement("div", {
    key: r.symbol,
    className: "box",
    style: {
      padding: 14,
      marginBottom: 10
    }
  }, React.createElement("div", {
    className: "between"
  }, React.createElement("span", {
    className: "num",
    style: {
      fontSize: 15,
      fontWeight: 600
    }
  }, r.symbol), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: plColor(r.lai_da_chot)
    }
  }, sign(r.lai_da_chot), short(r.lai_da_chot))), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 5
    }
  }, r.so_lan_ban, " lần bán · thắng ", r.so_lan_ban ? Math.round(r.so_lan_lai / r.so_lan_ban * 100) : 0, "%", " · ", "tỷ suất ", sign(r.ty_suat), r.ty_suat.toFixed(2), "%", " · ", "giữ trung bình ", r.ngay_giu_tb, " ngày", r.dang_giu > 0 && ` · còn giữ ${nf.format(r.dang_giu)}`))))));
}
function PriceAlerts({
  onClose,
  flash
}) {
  const [rows, setRows] = useState([]);
  const [held, setHeld] = useState([]);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    api("/stock/alerts").then(d => setRows(d.rows || [])).catch(() => {});
    api("/portfolio").then(d => setHeld((d.snapshot || {}).positions || [])).catch(() => {});
  }, []);
  useEffect(load, [load]);
  const save = () => {
    setBusy(true);
    setErr("");
    api("/stock/alerts", {
      method: "POST",
      body: {
        symbol: edit.symbol,
        stop: edit.stop === "" ? null : Number(String(edit.stop).replace(/\D/g, "")),
        target: edit.target === "" ? null : Number(String(edit.target).replace(/\D/g, "")),
        note: edit.note || null
      }
    }).then(() => {
      flash("Đã lưu mốc");
      setEdit(null);
      load();
    }).catch(e => setErr(e.message)).finally(() => setBusy(false));
  };
  const priceOf = sym => {
    const p = held.find(x => x.symbol === sym);
    return p ? p.market_price : null;
  };
  return React.createElement(Sheet, {
    title: "Mốc giá theo dõi",
    onClose: onClose
  }, React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 18
    }
  }, React.createElement("p", {
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      lineHeight: 1.7,
      marginTop: 0
    }
  }, "Mốc do bạn tự đặt. Sổ Chi chỉ nhắc khi giá chạm mốc, không gợi ý nên đặt ở đâu và không đưa ra khuyến nghị mua bán."), held.map(p => {
    const a = rows.find(r => r.symbol === p.symbol);
    const px = p.market_price;
    const hitStop = a && a.stop && px && px <= a.stop;
    const hitTarget = a && a.target && px && px >= a.target;
    return React.createElement("div", {
      key: p.symbol,
      className: "box",
      style: {
        padding: 14,
        marginBottom: 10,
        borderColor: hitStop ? cssVar("--red") : hitTarget ? cssVar("--green") : cssVar("--line")
      }
    }, React.createElement("div", {
      className: "between"
    }, React.createElement("span", {
      className: "num",
      style: {
        fontSize: 15,
        fontWeight: 600
      }
    }, p.symbol), React.createElement("button", {
      onClick: () => setEdit({
        symbol: p.symbol,
        stop: a && a.stop ? String(a.stop) : "",
        target: a && a.target ? String(a.target) : "",
        note: a && a.note || ""
      }),
      style: {
        fontSize: 12,
        color: cssVar("--blue")
      }
    }, a ? "Sửa" : "Đặt mốc")), React.createElement("div", {
      className: "num",
      style: {
        fontSize: 11,
        color: cssVar("--muted"),
        marginTop: 5,
        lineHeight: 1.7
      }
    }, "giá hiện tại ", px ? nf.format(px) : "—", a && a.stop && React.createElement(React.Fragment, null, React.createElement("br", null), "cắt lỗ ", nf.format(a.stop), hitStop && React.createElement("b", {
      style: {
        color: cssVar("--red")
      }
    }, " — đã chạm")), a && a.target && React.createElement(React.Fragment, null, React.createElement("br", null), "chốt lời ", nf.format(a.target), hitTarget && React.createElement("b", {
      style: {
        color: cssVar("--green")
      }
    }, " — đã chạm")), a && a.note && React.createElement(React.Fragment, null, React.createElement("br", null), a.note), !a && React.createElement(React.Fragment, null, React.createElement("br", null), "chưa đặt mốc nào")));
  }), held.length === 0 && React.createElement(Empty, {
    text: "Chưa giữ mã nào."
  }), edit && React.createElement(Sheet, {
    title: `Mốc giá ${edit.symbol}`,
    onClose: () => setEdit(null)
  }, React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 18
    }
  }, React.createElement(Field, {
    label: "Cắt lỗ (đồng)",
    hint: "Để trống nếu không đặt"
  }, React.createElement("input", {
    inputMode: "numeric",
    value: edit.stop,
    placeholder: "24000",
    onChange: e => setEdit({
      ...edit,
      stop: e.target.value
    })
  })), React.createElement(Field, {
    label: "Chốt lời (đồng)",
    hint: "Để trống nếu không đặt"
  }, React.createElement("input", {
    inputMode: "numeric",
    value: edit.target,
    placeholder: "30000",
    onChange: e => setEdit({
      ...edit,
      target: e.target.value
    })
  })), React.createElement(Field, {
    label: "Ghi chú"
  }, React.createElement("input", {
    value: edit.note,
    placeholder: "lý do đặt mốc này",
    onChange: e => setEdit({
      ...edit,
      note: e.target.value
    })
  })), err && React.createElement("div", {
    style: {
      color: cssVar("--red"),
      fontSize: 13,
      marginBottom: 10
    }
  }, err), React.createElement("div", {
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      lineHeight: 1.6,
      marginBottom: 14
    }
  }, "Xóa cả hai ô rồi lưu để bỏ mốc."), React.createElement(Button, {
    onClick: save,
    disabled: busy,
    style: {
      width: "100%"
    }
  }, busy ? "Đang lưu…" : "Lưu mốc")))));
}
function InvestAnalysis({
  onClose,
  flash
}) {
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
    api("/stock/margin-interest").then(d => {
      setMi(d);
      setRate(String(d.lai_suat_nam));
    }).catch(() => {});
    api("/stock/unusual").then(setUnusual).catch(e => setUnusual({
      ok: false,
      error: e.message
    }));
    api("/stock/settings").then(d => setFees({
      fee_buy_pct: String(d.fee_buy_pct),
      fee_sell_pct: String(d.fee_sell_pct),
      fee_tax_pct: String(d.fee_tax_pct)
    })).catch(() => {});
  }, []);
  useEffect(load, [load]);
  const saveRate = () => {
    setSaving(true);
    api("/stock/settings", {
      method: "POST",
      body: {
        margin_rate_year: Number(rate)
      }
    }).then(() => {
      flash("Đã lưu lãi suất");
      load();
    }).catch(e => flash(e.message)).finally(() => setSaving(false));
  };
  const HUONG = {
    ben_mua_manh: {
      t: "đóng cửa gần đỉnh ngày",
      c: "--green"
    },
    ben_ban_manh: {
      t: "đóng cửa gần đáy ngày",
      c: "--red"
    },
    khong_ro: {
      t: "đóng cửa giữa biên độ",
      c: "--muted"
    }
  };
  return React.createElement(Sheet, {
    title: "Phân tích danh mục",
    onClose: onClose
  }, React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 18
    }
  }, React.createElement("div", {
    className: "num label"
  }, "Lãi vay margin ước tính"), mi && React.createElement("div", {
    className: "box",
    style: {
      padding: 14,
      marginTop: 8,
      marginBottom: 8
    }
  }, React.createElement("div", {
    className: "num",
    style: {
      fontSize: 22,
      fontWeight: 700,
      color: cssVar("--red")
    }
  }, money(mi.uoc_tinh)), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 6,
      lineHeight: 1.7
    }
  }, mi.tu_ngay, " → ", mi.den_ngay, " · ", mi.so_ngay_vay, " ngày có dư nợ", React.createElement("br", null), "dư nợ cao nhất ", short(mi.du_no_cao_nhat), " ngày ", mi.ngay_du_no_cao_nhat, mi.moc_doi_chieu_truoc ? React.createElement(React.Fragment, null, React.createElement("br", null), "tính từ mốc đối chiếu ", mi.moc_doi_chieu_truoc) : React.createElement(React.Fragment, null, React.createElement("br", null), "chưa có mốc đối chiếu nào"), mi.bo_qua_truoc_khoi_tao && React.createElement(React.Fragment, null, React.createElement("br", null), React.createElement("span", {
    style: {
      color: cssVar("--amber")
    }
  }, "không tính giai đoạn trước ngày khởi tạo sổ (", mi.ngay_khoi_tao, ") — sổ không có thông tin dư nợ của giai đoạn đó"))), React.createElement("div", {
    className: "between",
    style: {
      marginTop: 12,
      gap: 8
    }
  }, React.createElement("input", {
    inputMode: "decimal",
    value: rate,
    onChange: e => setRate(e.target.value),
    style: {
      flex: 1
    },
    placeholder: "14.6"
  }), React.createElement("span", {
    style: {
      fontSize: 12,
      color: cssVar("--muted")
    }
  }, "%/năm ước chừng"), React.createElement(Button, {
    kind: "outline",
    onClick: saveRate,
    disabled: saving,
    style: {
      padding: "6px 12px",
      fontSize: 12
    }
  }, "Lưu"))), React.createElement("p", {
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      lineHeight: 1.7,
      marginTop: 0,
      marginBottom: 24
    }
  }, "Con số ", React.createElement("b", null, "ước chừng"), ", không phải số công ty chứng khoán thu. Lãi suất thay đổi liên tục theo gói và theo thời điểm, lại còn phí ứng trước tiền bán không nằm trong sổ — nên đừng mất công tìm cho ra con số chính xác, để mức áng chừng là đủ. Số thật lấy được khi đối chiếu; cái này chỉ để biết trước khoảng bao nhiêu và để thấy số đối chiếu có hợp lý không."), React.createElement("div", {
    className: "num label"
  }, "Biểu phí"), fees && React.createElement("div", {
    className: "box",
    style: {
      padding: 14,
      marginTop: 8,
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginBottom: 10
    }
  }, [["fee_buy_pct", "Mua"], ["fee_sell_pct", "Bán"], ["fee_tax_pct", "Thuế bán"]].map(([k, ten]) => React.createElement("div", {
    key: k,
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginBottom: 4
    }
  }, ten, " %"), React.createElement("input", {
    inputMode: "decimal",
    value: fees[k],
    style: {
      width: "100%"
    },
    onChange: e => {
      setFees({
        ...fees,
        [k]: e.target.value
      });
      setFeePrev(null);
    }
  })))), feePrev && feePrev.rows && React.createElement("div", {
    style: {
      marginTop: 4,
      paddingTop: 10,
      borderTop: `1px solid ${cssVar("--line")}`
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginBottom: 6
    }
  }, "Giá vốn sẽ đổi thành"), feePrev.rows.map(r => React.createElement("div", {
    key: r.symbol,
    className: "num between",
    style: {
      fontSize: 12,
      marginBottom: 4
    }
  }, React.createElement("span", null, r.symbol), React.createElement("span", null, React.createElement("span", {
    style: {
      color: cssVar("--muted")
    }
  }, nf.format(r.von_cu)), " → ", React.createElement("b", null, nf.format(r.von_moi))))), feePrev.lech_tien_mat !== 0 && React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--amber"),
      marginTop: 6
    }
  }, "tiền mặt đổi ", feePrev.lech_tien_mat > 0 ? "+" : "", money(feePrev.lech_tien_mat))), feeErr && React.createElement("div", {
    style: {
      color: cssVar("--red"),
      fontSize: 12,
      marginTop: 8
    }
  }, feeErr), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 12
    }
  }, React.createElement(Button, {
    kind: "outline",
    style: {
      flex: 1,
      padding: "6px 12px",
      fontSize: 12
    },
    onClick: () => {
      setFeeErr("");
      api("/stock/settings/preview", {
        method: "POST",
        body: {
          fee_buy_pct: Number(fees.fee_buy_pct),
          fee_sell_pct: Number(fees.fee_sell_pct),
          fee_tax_pct: Number(fees.fee_tax_pct)
        }
      }).then(setFeePrev).catch(e => setFeeErr(e.message));
    }
  }, "Xem trước"), feePrev && React.createElement(Button, {
    style: {
      flex: 1,
      padding: "6px 12px",
      fontSize: 12
    },
    onClick: () => {
      api("/stock/settings", {
        method: "POST",
        body: {
          fee_buy_pct: Number(fees.fee_buy_pct),
          fee_sell_pct: Number(fees.fee_sell_pct),
          fee_tax_pct: Number(fees.fee_tax_pct)
        }
      }).then(() => {
        flash("Đã lưu biểu phí");
        setFeePrev(null);
        load();
      }).catch(e => setFeeErr(e.message));
    }
  }, "Lưu biểu phí"))), React.createElement("p", {
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      lineHeight: 1.7,
      marginTop: 0,
      marginBottom: 24
    }
  }, "Phí mua nằm trong giá vốn, nên đổi số ở đây là đổi giá vốn của ", React.createElement("b", null, "mọi lệnh mua đã ghi"), ", kể cả lệnh từ nhiều tháng trước. Đó là đúng — sổ luôn tính lại từ đầu nên không có chuyện hai lệnh cùng loại chịu hai mức phí khác nhau — nhưng nên bấm Xem trước để thấy con số mới rồi hãy lưu."), React.createElement("div", {
    className: "num label"
  }, "Thời gian nắm giữ"), React.createElement("div", {
    style: {
      marginTop: 8,
      marginBottom: 24
    }
  }, hold && (hold.rows || []).map(r => React.createElement("div", {
    key: r.symbol,
    className: "box",
    style: {
      padding: 14,
      marginBottom: 10
    }
  }, React.createElement("div", {
    className: "between"
  }, React.createElement("span", {
    className: "num",
    style: {
      fontSize: 15,
      fontWeight: 600
    }
  }, r.symbol), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 15,
      fontWeight: 600
    }
  }, r.so_ngay_binh_quan, " ngày")), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 5,
      lineHeight: 1.7
    }
  }, nf.format(r.qty), " cp · ", r.so_lo, " lô", React.createElement("br", null), "lô cũ nhất ", r.lo_cu_nhat, " (", r.so_ngay_lo_cu_nhat, " ngày)", r.so_lo > 1 && React.createElement(React.Fragment, null, " · lô mới nhất ", r.lo_moi_nhat)), r.so_lo > 1 && React.createElement("div", {
    style: {
      marginTop: 8,
      paddingTop: 8,
      borderTop: `1px solid ${cssVar("--line")}`
    }
  }, r.lots.map((l, i) => React.createElement("div", {
    key: i,
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginBottom: 2
    }
  }, l.ngay_mua, " · ", nf.format(l.qty), " cp · ", l.so_ngay, " ngày"))))), hold && (hold.rows || []).length === 0 && React.createElement(Empty, {
    text: "Chưa giữ mã nào."
  }), React.createElement("div", {
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      lineHeight: 1.6
    }
  }, "Số ngày bình quân tính theo khối lượng từng lô, không lấy lô cũ nhất — mua thêm nhiều đè lên một ít cổ giữ lâu thì con số phải phản ánh phần lớn.")), React.createElement("div", {
    className: "num label"
  }, "Phiên khối lượng bất thường"), React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, unusual && unusual.ok === false && React.createElement("div", {
    className: "box",
    style: {
      padding: 12,
      borderColor: cssVar("--amber")
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      color: cssVar("--amber")
    }
  }, unusual.error)), unusual && unusual.ok && (unusual.rows || []).filter(r => r.unusual).length === 0 && React.createElement("div", {
    style: {
      fontSize: 12,
      color: cssVar("--muted")
    }
  }, "Không mã nào có khối lượng lạ trong phiên gần nhất."), unusual && unusual.ok && (unusual.rows || []).filter(r => r.unusual).map(r => React.createElement("div", {
    key: r.symbol,
    className: "box",
    style: {
      padding: 14,
      marginBottom: 10,
      borderColor: cssVar(HUONG[r.huong].c)
    }
  }, React.createElement("div", {
    className: "between"
  }, React.createElement("span", {
    className: "num",
    style: {
      fontSize: 15,
      fontWeight: 600
    }
  }, r.symbol), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 14,
      fontWeight: 600
    }
  }, r.times.toFixed(1), "× trung vị")), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 5,
      lineHeight: 1.7
    }
  }, "phiên ", r.date, " · khối lượng ", nf.format(r.volume), " · thường ngày ", nf.format(r.median), React.createElement("br", null), React.createElement("span", {
    style: {
      color: cssVar(HUONG[r.huong].c)
    }
  }, HUONG[r.huong].t), " · ", r.thay_doi_pct >= 0 ? "+" : "", r.thay_doi_pct.toFixed(2), "% so với giá mở cửa"))), React.createElement("div", {
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      lineHeight: 1.6,
      marginTop: 8
    }
  }, "So khối lượng phiên gần nhất với trung vị 20 phiên trước. Dùng trung vị chứ không dùng trung bình vì chỉ một phiên đột biến là trung bình bị kéo lệch. Hướng tiền suy từ vị trí giá đóng cửa trong biên độ ngày — là phỏng đoán, không phải số liệu mua bán thật. Đây là quan sát, không phải khuyến nghị."))));
}
function StockEvents({
  onClose,
  flash
}) {
  const [rows, setRows] = useState([]);
  const [held, setHeld] = useState([]);
  const [add, setAdd] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    api("/stock/events").then(d => setRows(d.rows || [])).catch(() => {});
    api("/portfolio").then(d => setHeld((d.snapshot || {}).positions || [])).catch(() => {});
  }, []);
  useEffect(load, [load]);
  const LOAI = [{
    id: "co_tuc_tien",
    label: "Cổ tức tiền"
  }, {
    id: "co_tuc_cp",
    label: "Cổ tức cổ phiếu"
  }, {
    id: "phat_hanh_them",
    label: "Phát hành thêm"
  }, {
    id: "dhcd",
    label: "Đại hội cổ đông"
  }, {
    id: "khac",
    label: "Khác"
  }];
  const loaiLabel = id => (LOAI.find(l => l.id === id) || {}).label || id;
  const save = () => {
    setErr("");
    api("/stock/events", {
      method: "POST",
      body: add
    }).then(() => {
      flash("Đã thêm sự kiện");
      setAdd(null);
      load();
    }).catch(e => setErr(e.message));
  };
  const del = id => {
    api(`/stock/events/${id}`, {
      method: "DELETE"
    }).then(() => {
      flash("Đã xóa");
      load();
    }).catch(() => {});
  };
  const today = todayISO();
  const sapToi = rows.filter(r => r.ex_date >= today);
  const daQua = rows.filter(r => r.ex_date < today);
  const Row = ({
    r
  }) => {
    const giu = held.find(h => h.symbol === r.symbol);
    const conNgay = Math.round((new Date(r.ex_date) - new Date(today)) / 86400000);
    return React.createElement("div", {
      className: "box",
      style: {
        padding: 14,
        marginBottom: 10
      }
    }, React.createElement("div", {
      className: "between"
    }, React.createElement("span", {
      className: "num",
      style: {
        fontSize: 15,
        fontWeight: 600
      }
    }, r.symbol, " ", React.createElement("span", {
      style: {
        fontSize: 12,
        fontWeight: 400,
        color: cssVar("--muted")
      }
    }, loaiLabel(r.loai))), React.createElement("button", {
      onClick: () => del(r.id),
      style: {
        fontSize: 12,
        color: cssVar("--muted")
      }
    }, "Xóa")), React.createElement("div", {
      className: "num",
      style: {
        fontSize: 12,
        marginTop: 6,
        lineHeight: 1.8
      }
    }, React.createElement("b", null, "GDKHQ ", r.ex_date), conNgay >= 0 && React.createElement("span", {
      style: {
        color: cssVar("--amber")
      }
    }, conNgay === 0 ? "  — hôm nay" : `  — còn ${conNgay} ngày`), r.record_date && React.createElement(React.Fragment, null, React.createElement("br", null), "ngày chốt danh sách ", r.record_date), r.pay_date && React.createElement(React.Fragment, null, React.createElement("br", null), "ngày thanh toán ", r.pay_date), r.ty_le && React.createElement(React.Fragment, null, React.createElement("br", null), "tỷ lệ ", r.ty_le), r.gia_tri && giu && React.createElement(React.Fragment, null, React.createElement("br", null), "ước nhận ", money(r.gia_tri * giu.qty), " cho ", nf.format(giu.qty), " cp"), r.ghi_chu && React.createElement(React.Fragment, null, React.createElement("br", null), React.createElement("span", {
      style: {
        color: cssVar("--muted")
      }
    }, r.ghi_chu))));
  };
  return React.createElement(Sheet, {
    title: "Lịch sự kiện quyền",
    onClose: onClose
  }, React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 18
    }
  }, React.createElement("div", {
    className: "box",
    style: {
      padding: 12,
      marginBottom: 16,
      borderColor: cssVar("--amber")
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      lineHeight: 1.7
    }
  }, "Hiện phải nhập tay. Nguồn lịch quyền tự động (TCBS) chặn máy chủ đặt tại nước ngoài, muốn tự động phải dựng thêm một cầu nối Cloudflare — chưa làm.")), React.createElement(Button, {
    kind: "outline",
    onClick: () => setAdd({
      symbol: held[0] ? held[0].symbol : "",
      loai: "co_tuc_tien"
    }),
    style: {
      width: "100%",
      marginBottom: 18
    }
  }, "+ Thêm sự kiện"), sapToi.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
    className: "num label",
    style: {
      marginBottom: 8
    }
  }, "Sắp tới"), sapToi.slice().reverse().map(r => React.createElement(Row, {
    key: r.id,
    r: r
  }))), daQua.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
    className: "num label",
    style: {
      margin: "18px 0 8px"
    }
  }, "Đã qua"), daQua.map(r => React.createElement(Row, {
    key: r.id,
    r: r
  }))), rows.length === 0 && React.createElement(Empty, {
    text: "Chưa ghi sự kiện nào."
  }), add && React.createElement(Sheet, {
    title: "Thêm sự kiện quyền",
    onClose: () => setAdd(null)
  }, React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 18
    }
  }, React.createElement(Field, {
    label: "Mã"
  }, React.createElement("input", {
    value: add.symbol,
    placeholder: "HCM",
    onChange: e => setAdd({
      ...add,
      symbol: e.target.value.toUpperCase()
    })
  })), React.createElement(Field, {
    label: "Loại"
  }, React.createElement(Chips, {
    value: add.loai,
    onChange: v => setAdd({
      ...add,
      loai: v
    }),
    options: LOAI
  })), React.createElement(Field, {
    label: "Ngày giao dịch không hưởng quyền",
    hint: "Bắt buộc — mua từ ngày này không còn quyền"
  }, React.createElement("input", {
    type: "date",
    value: add.ex_date || "",
    onChange: e => setAdd({
      ...add,
      ex_date: e.target.value
    })
  })), React.createElement(Field, {
    label: "Ngày chốt danh sách"
  }, React.createElement("input", {
    type: "date",
    value: add.record_date || "",
    onChange: e => setAdd({
      ...add,
      record_date: e.target.value
    })
  })), React.createElement(Field, {
    label: "Ngày thanh toán"
  }, React.createElement("input", {
    type: "date",
    value: add.pay_date || "",
    onChange: e => setAdd({
      ...add,
      pay_date: e.target.value
    })
  })), React.createElement(Field, {
    label: "Tỷ lệ",
    hint: "ví dụ 15% hoặc 10:1"
  }, React.createElement("input", {
    value: add.ty_le || "",
    onChange: e => setAdd({
      ...add,
      ty_le: e.target.value
    })
  })), React.createElement(Field, {
    label: "Số tiền trên mỗi cổ phiếu (đồng)",
    hint: "để ước tính số nhận được"
  }, React.createElement("input", {
    inputMode: "numeric",
    value: add.gia_tri || "",
    placeholder: "1500",
    onChange: e => setAdd({
      ...add,
      gia_tri: e.target.value
    })
  })), React.createElement(Field, {
    label: "Ghi chú"
  }, React.createElement("input", {
    value: add.ghi_chu || "",
    onChange: e => setAdd({
      ...add,
      ghi_chu: e.target.value
    })
  })), err && React.createElement("div", {
    style: {
      color: cssVar("--red"),
      fontSize: 13,
      marginBottom: 10
    }
  }, err), React.createElement(Button, {
    onClick: save,
    style: {
      width: "100%"
    }
  }, "Lưu sự kiện")))));
}
function EventLine({
  ev,
  qty
}) {
  const TEN = {
    co_tuc_tien: "cổ tức tiền",
    co_tuc_cp: "cổ tức cổ phiếu",
    phat_hanh_them: "phát hành thêm",
    dhcd: "đại hội cổ đông",
    khac: "sự kiện"
  };
  let mau = "--muted";
  let dau = "";
  if (ev.cho_tien) {
    mau = "--blue";
    dau = "đã qua ngày chốt, chờ nhận";
  } else if (ev.con_ngay === 0) {
    mau = "--amber";
    dau = "hôm nay là ngày không hưởng quyền";
  } else if (ev.con_ngay > 0 && ev.con_ngay <= 5) {
    mau = "--amber";
    dau = `còn ${ev.con_ngay} ngày`;
  } else if (ev.con_ngay > 0) {
    dau = `còn ${ev.con_ngay} ngày`;
  } else {
    dau = "đã qua";
  }
  const tien = ev.gia_tri ? ev.gia_tri * qty : null;
  return React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      marginTop: 6,
      paddingTop: 6,
      borderTop: `1px solid ${cssVar("--line")}`,
      color: cssVar(mau),
      lineHeight: 1.7
    }
  }, TEN[ev.loai] || "sự kiện", ev.gia_tri ? ` ${nf.format(ev.gia_tri)}đ/cp` : "", ev.ty_le ? ` · tỷ lệ ${ev.ty_le}` : "", " · không hưởng quyền ", ev.ex_date, dau ? ` · ${dau}` : "", tien && React.createElement(React.Fragment, null, React.createElement("br", null), "ước nhận ", money(tien), " cho ", nf.format(qty), " cp", ev.pay_date ? ` · thanh toán ${ev.pay_date}` : ""));
}
function Reports({
  month,
  setMonth,
  flash
}) {
  const [rep, setRep] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setRep(null);
    api(`/analytics?month=${month}&months=12`).then(setRep).catch(e => setErr(e.message));
  }, [month]);
  if (err) return React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 30,
      color: cssVar("--red"),
      fontSize: 14
    }
  }, err);
  if (!rep) return React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 40,
      textAlign: "center",
      color: cssVar("--muted"),
      fontSize: 14
    }
  }, "Đang tính…");
  const maxTrend = Math.max(...rep.trend.map(t => t.total), 1);
  const maxCat = Math.max(...rep.byCategory.map(c => c.total), 1);
  const maxWd = Math.max(...rep.byWeekday.map(w => w.total), 1);
  const totalType = rep.byType.reduce((s, t) => s + t.total, 0);
  const avgPerDay = rep.totals.n ? rep.totals.total / new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() : 0;
  return React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 22
    }
  }, React.createElement("section", {
    style: {
      marginBottom: 26
    }
  }, React.createElement("div", {
    className: "num label"
  }, "Tổng chi ", MONTH_VN(month).toLowerCase()), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 30,
      fontWeight: 700,
      marginTop: 4
    }
  }, money(rep.totals.total)), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      marginTop: 3
    }
  }, rep.totals.n, " giao dịch · trung bình ", short(avgPerDay), "/ngày")), React.createElement("section", {
    style: {
      marginBottom: 30
    }
  }, React.createElement(SectionLabel, null, "12 tháng gần nhất"), React.createElement("div", {
    className: "row",
    style: {
      alignItems: "flex-end",
      gap: 4,
      height: 110,
      marginTop: 14
    }
  }, rep.trend.map(t => React.createElement("button", {
    key: t.month,
    onClick: () => setMonth(t.month),
    title: `${t.month} — ${money(t.total)}`,
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
      height: "100%"
    }
  }, React.createElement("div", {
    style: {
      height: Math.max(t.total / maxTrend * 84, t.total > 0 ? 3 : 1),
      background: t.month === month ? cssVar("--ink") : cssVar("--track"),
      borderRadius: "2px 2px 0 0"
    }
  }), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 9,
      marginTop: 5,
      color: t.month === month ? cssVar("--ink") : cssVar("--muted")
    }
  }, Number(t.month.slice(5, 7))))))), rep.byCategory.length > 0 && React.createElement("section", {
    style: {
      marginBottom: 30
    }
  }, React.createElement(SectionLabel, null, "Theo danh mục"), React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, rep.byCategory.map(c => React.createElement("div", {
    key: c.category_id,
    style: {
      marginBottom: 12
    }
  }, React.createElement("div", {
    className: "between",
    style: {
      alignItems: "baseline",
      marginBottom: 6
    }
  }, React.createElement("span", {
    style: {
      fontSize: 14
    }
  }, React.createElement("span", {
    style: {
      marginRight: 8
    }
  }, c.icon), c.name, React.createElement("span", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginLeft: 6
    }
  }, "×", c.n)), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 13,
      fontWeight: 500
    }
  }, money(c.total), React.createElement("span", {
    style: {
      color: cssVar("--muted"),
      fontWeight: 400
    }
  }, " ", Math.round(c.total / rep.totals.total * 100), "%"))), React.createElement(Bar, {
    value: c.total,
    max: maxCat,
    color: c.color
  }))))), totalType > 0 && React.createElement("section", {
    style: {
      marginBottom: 30
    }
  }, React.createElement(SectionLabel, null, "Cá nhân và công ty"), React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, TYPES.map(t => {
    const row = rep.byType.find(x => x.type === t.id);
    if (!row) return null;
    return React.createElement("div", {
      key: t.id,
      className: "between",
      style: {
        padding: "8px 0",
        fontSize: 14
      }
    }, React.createElement("span", {
      className: "row",
      style: {
        gap: 8
      }
    }, React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        borderRadius: 99,
        background: cssVar(t.varname)
      }
    }), t.label), React.createElement("span", {
      className: "num",
      style: {
        fontWeight: 500
      }
    }, money(row.total), React.createElement("span", {
      style: {
        color: cssVar("--muted"),
        fontWeight: 400
      }
    }, " ", Math.round(row.total / totalType * 100), "%")));
  }))), rep.byMethod.length > 0 && React.createElement("section", {
    style: {
      marginBottom: 30
    }
  }, React.createElement(SectionLabel, null, "Theo phương thức"), React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, rep.byMethod.map(m => React.createElement("div", {
    key: m.method,
    className: "between",
    style: {
      padding: "7px 0",
      fontSize: 14
    }
  }, React.createElement("span", null, methodLabel(m.method)), React.createElement("span", {
    className: "num",
    style: {
      fontWeight: 500
    }
  }, money(m.total)))))), rep.byWeekday.length > 0 && React.createElement("section", {
    style: {
      marginBottom: 30
    }
  }, React.createElement(SectionLabel, null, "Theo thứ trong tuần"), React.createElement("div", {
    className: "row",
    style: {
      alignItems: "flex-end",
      gap: 8,
      height: 82,
      marginTop: 14
    }
  }, Array.from({
    length: 7
  }, (_, i) => {
    const row = rep.byWeekday.find(w => w.wd === i) || {
      total: 0
    };
    return React.createElement("div", {
      key: i,
      style: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        height: "100%"
      }
    }, React.createElement("div", {
      style: {
        height: Math.max(row.total / maxWd * 58, row.total > 0 ? 3 : 1),
        background: cssVar("--track"),
        borderRadius: "3px 3px 0 0"
      }
    }), React.createElement("div", {
      className: "num",
      style: {
        fontSize: 10,
        marginTop: 5,
        color: cssVar("--muted"),
        textAlign: "center"
      }
    }, DAY_NAMES[i]));
  }))), rep.top.length > 0 && React.createElement("section", {
    style: {
      marginBottom: 20
    }
  }, React.createElement(SectionLabel, null, "5 khoản lớn nhất"), React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, rep.top.map(t => React.createElement("div", {
    key: t.id,
    className: "tape between",
    style: {
      padding: "11px 0"
    }
  }, React.createElement("span", {
    className: "truncate",
    style: {
      fontSize: 14,
      minWidth: 0
    }
  }, t.note || "Khoản chi"), React.createElement("span", {
    className: "row",
    style: {
      gap: 10
    }
  }, React.createElement("span", {
    className: "num",
    style: {
      fontSize: 11,
      color: cssVar("--muted")
    }
  }, t.date), React.createElement("span", {
    className: "num",
    style: {
      fontSize: 14,
      fontWeight: 500
    }
  }, short(t.amount))))))));
}
function Settings({
  data,
  reload,
  flash,
  theme,
  setTheme,
  onLogout
}) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const setBudget = async (c, value) => {
    try {
      await api("/categories/" + c.id, {
        method: "PUT",
        body: {
          name: c.name,
          icon: c.icon,
          color: c.color,
          budget: Number(value) || 0,
          subs: c.subs
        }
      });
      reload();
    } catch (e) {
      flash(e.message);
    }
  };
  const addCat = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api("/categories", {
        method: "POST",
        body: {
          name,
          icon: "📌",
          color: "#6B7280"
        }
      });
      setNewName("");
      reload();
      flash("Đã thêm danh mục");
    } catch (e) {
      flash(e.message);
    }
    setBusy(false);
  };
  const download = async (path, filename) => {
    try {
      const res = await api(path, {
        raw: true
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      flash("Không tải được: " + e.message);
    }
  };
  const importLocal = async () => {
    let raw;
    try {
      raw = JSON.parse(localStorage.getItem("sochi:v1") || "null");
    } catch {
      raw = null;
    }
    if (!raw || !Array.isArray(raw.txs) || !raw.txs.length) {
      return flash("Không tìm thấy dữ liệu bản GĐ1 trên thiết bị này");
    }
    const catNames = Object.fromEntries((raw.cats || []).map(c => [c.id, c.name]));
    const payload = raw.txs.map(t => ({
      amount: t.amount,
      category_name: catNames[t.categoryId] || "Khác",
      sub: t.sub,
      type: t.type,
      method: t.method,
      note: t.note,
      date: t.date
    }));
    try {
      const r = await api("/import", {
        method: "POST",
        body: {
          transactions: payload
        }
      });
      flash(`Đã nhập ${r.imported} khoản${r.skipped ? `, bỏ qua ${r.skipped}` : ""}`);
      reload();
    } catch (e) {
      flash(e.message);
    }
  };
  const totalBudget = data.categories.reduce((s, c) => s + (c.budget || 0), 0);
  return React.createElement("div", {
    className: "pad",
    style: {
      paddingTop: 22
    }
  }, React.createElement("section", {
    style: {
      marginBottom: 28
    }
  }, React.createElement(SectionLabel, null, "Giao diện"), React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, React.createElement(Chips, {
    options: [{
      id: "light",
      label: "Sáng"
    }, {
      id: "dark",
      label: "Tối"
    }, {
      id: "auto",
      label: "Theo hệ thống"
    }],
    value: theme,
    onChange: setTheme
  }))), React.createElement("section", {
    style: {
      marginBottom: 28
    }
  }, React.createElement(SectionLabel, null, "Danh mục và ngân sách"), totalBudget > 0 && React.createElement("div", {
    className: "num",
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      marginTop: 8
    }
  }, "Tổng ngân sách tháng: ", money(totalBudget)), React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, data.categories.map(c => React.createElement("div", {
    key: c.id,
    className: "tape row",
    style: {
      gap: 12,
      padding: "12px 0"
    }
  }, React.createElement("span", {
    style: {
      fontSize: 18,
      width: 24
    }
  }, c.icon), React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, React.createElement("span", {
    className: "truncate",
    style: {
      display: "block",
      fontSize: 14
    }
  }, c.name), c.subs.length > 0 && React.createElement("span", {
    className: "truncate",
    style: {
      display: "block",
      fontSize: 11,
      color: cssVar("--muted")
    }
  }, c.subs.join(" · "))), React.createElement("input", {
    className: "field num",
    type: "number",
    inputMode: "numeric",
    placeholder: "ngân sách",
    defaultValue: c.budget || "",
    style: {
      width: 116,
      textAlign: "right",
      padding: "6px 8px"
    },
    onBlur: e => Number(e.target.value || 0) !== c.budget && setBudget(c, e.target.value)
  })))), React.createElement("div", {
    className: "row",
    style: {
      gap: 8,
      marginTop: 16
    }
  }, React.createElement("input", {
    className: "field",
    value: newName,
    placeholder: "Tên danh mục mới",
    onChange: e => setNewName(e.target.value),
    onKeyDown: e => e.key === "Enter" && addCat()
  }), React.createElement(Button, {
    onClick: addCat,
    disabled: busy || !newName.trim(),
    style: {
      borderRadius: 8,
      padding: "10px 18px",
      fontSize: 14
    }
  }, "Thêm"))), React.createElement("section", {
    style: {
      marginBottom: 28
    }
  }, React.createElement(SectionLabel, null, "Dữ liệu"), React.createElement("div", {
    className: "wrap",
    style: {
      marginTop: 12
    }
  }, React.createElement(Button, {
    kind: "outline",
    onClick: () => download("/export.csv", `so-chi-${todayISO()}.csv`)
  }, "Xuất CSV"), React.createElement(Button, {
    kind: "outline",
    onClick: () => download("/export.json", `so-chi-${todayISO()}.json`)
  }, "Sao lưu JSON"), React.createElement(Button, {
    kind: "outline",
    onClick: importLocal
  }, "Nhập từ bản GĐ1")), React.createElement("p", {
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      marginTop: 12,
      lineHeight: 1.6
    }
  }, "Dữ liệu nằm trong SQLite trên máy chủ riêng của bạn, đồng bộ giữa các thiết bị. \"Nhập từ bản GĐ1\" đọc dữ liệu cũ còn lưu trong trình duyệt của chính thiết bị này.")), React.createElement("section", {
    style: {
      marginBottom: 28
    }
  }, React.createElement(SectionLabel, null, "Đọc hóa đơn"), React.createElement("p", {
    style: {
      fontSize: 13,
      color: cssVar("--muted"),
      marginTop: 10,
      lineHeight: 1.6
    }
  }, data.ocr_enabled ? "Đang bật. Nút 📷 Quét hóa đơn nằm trong màn hình thêm khoản chi." : "Đang tắt. Thêm GEMINI_API_KEY vào file .env trên máy chủ rồi khởi động lại dịch vụ để bật.")), React.createElement("section", {
    style: {
      paddingTop: 20,
      borderTop: `1px solid ${cssVar("--line")}`
    }
  }, React.createElement("div", {
    className: "between"
  }, React.createElement("span", {
    style: {
      fontSize: 14
    }
  }, "Đang đăng nhập: ", React.createElement("b", null, data.user.username)), React.createElement(Button, {
    kind: "danger",
    onClick: onLogout
  }, "Đăng xuất"))), React.createElement("section", {
    style: {
      marginTop: 28,
      paddingTop: 20,
      borderTop: `1px solid ${cssVar("--line")}`
    }
  }, React.createElement("div", {
    className: "num label",
    style: {
      color: cssVar("--red")
    }
  }, "Vùng nguy hiểm"), React.createElement(ResetData, {
    flash: flash,
    reload: reload
  })));
}
const TABS = [{
  id: "home",
  label: "Tổng quan"
}, {
  id: "bills",
  label: "Hóa đơn"
}, {
  id: "cards",
  label: "Thẻ"
}, {
  id: "invest",
  label: "Đầu tư"
}, {
  id: "reports",
  label: "Báo cáo"
}, {
  id: "assistant",
  label: "Trợ lý"
}];
const ALL_SCREENS = [...TABS, {
  id: "settings",
  label: "Cài đặt"
}];
function App() {
  const [phase, setPhase] = useState("loading");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [data, setData] = useState(null);
  const [txs, setTxs] = useState([]);
  const [tab, setTab] = useState("home");
  const [month, setMonth] = useState(monthOf(todayISO()));
  const [entry, setEntry] = useState(null);
  const [toast, setToast] = useState("");
  const [theme, setThemeState] = useState(localStorage.getItem("sochi:theme") || "auto");
  const flash = useCallback(msg => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }, []);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || theme === "auto" && mq.matches;
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", dark ? "#10131A" : "#FAFAF7");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  const setTheme = t => {
    setThemeState(t);
    localStorage.setItem("sochi:theme", t);
  };
  const loadAll = useCallback(async () => {
    const [boot, tx] = await Promise.all([api("/bootstrap"), api("/transactions?limit=2000")]);
    setData(boot);
    setTxs(tx.transactions);
    setPhase("ready");
  }, []);
  const reload = useCallback(() => {
    loadAll().catch(e => flash(e.message));
  }, [loadAll, flash]);
  useEffect(() => {
    const onLogout = () => {
      setPhase("login");
      setData(null);
      setTxs([]);
    };
    window.addEventListener("sochi:logout", onLogout);
    return () => window.removeEventListener("sochi:logout", onLogout);
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const st = await api("/status");
        setNeedsSetup(st.needs_setup);
        if (st.needs_setup || !localStorage.getItem("sochi:token")) return setPhase("login");
        await loadAll();
      } catch (e) {
        setPhase("login");
      }
    })();
  }, [loadAll]);
  const logout = () => {
    setToken("");
    setPhase("login");
    setData(null);
    setTxs([]);
  };
  const onSaved = (tx, wasEdit) => {
    setTxs(prev => wasEdit ? prev.map(t => t.id === tx.id ? tx : t) : [tx, ...prev]);
    setMonth(monthOf(tx.date));
    setEntry(null);
    setTab("home");
    flash(wasEdit ? "Đã cập nhật" : "Đã lưu khoản chi");
    api("/bootstrap").then(setData).catch(() => {});
  };
  const onDeleted = id => {
    setTxs(prev => prev.filter(t => t.id !== id));
    setEntry(null);
    flash("Đã xóa");
    api("/bootstrap").then(setData).catch(() => {});
  };
  const payBillQuick = async b => {
    try {
      await api(`/bills/${b.id}/pay`, {
        method: "POST",
        body: {
          amount: b.amount
        }
      });
      flash(`Đã ghi nhận thanh toán ${b.name}`);
      reload();
    } catch (e) {
      flash(e.message);
    }
  };
  if (phase === "loading") return React.createElement("div", {
    id: "boot"
  }, "Đang mở sổ…");
  if (phase === "login") {
    return React.createElement(Login, {
      needsSetup: needsSetup,
      onDone: () => {
        setPhase("loading");
        loadAll().catch(() => setPhase("login"));
      }
    });
  }
  const showMonthNav = tab === "home" || tab === "reports";
  return React.createElement("div", null, React.createElement("div", {
    className: "shell"
  }, React.createElement("header", {
    className: "between",
    style: {
      padding: "22px 20px 14px",
      borderBottom: `1px solid ${cssVar("--line")}`
    }
  }, React.createElement("div", null, React.createElement("div", {
    className: "num label"
  }, "Sổ chi"), showMonthNav ? React.createElement("div", {
    className: "row",
    style: {
      gap: 8,
      marginTop: 4
    }
  }, React.createElement("button", {
    onClick: () => setMonth(shiftMonth(month, -1)),
    "aria-label": "Tháng trước",
    style: {
      padding: "0 8px",
      color: cssVar("--muted"),
      fontSize: 20,
      lineHeight: 1
    }
  }, "‹"), React.createElement("span", {
    style: {
      fontSize: 19,
      fontWeight: 600
    }
  }, MONTH_VN(month)), React.createElement("button", {
    onClick: () => setMonth(shiftMonth(month, 1)),
    "aria-label": "Tháng sau",
    style: {
      padding: "0 8px",
      color: cssVar("--muted"),
      fontSize: 20,
      lineHeight: 1
    }
  }, "›")) : React.createElement("div", {
    style: {
      fontSize: 19,
      fontWeight: 600,
      marginTop: 4
    }
  }, (ALL_SCREENS.find(t => t.id === tab) || {}).label)), React.createElement("div", {
    className: "row",
    style: {
      gap: 10
    }
  }, tab === "home" && React.createElement(Button, {
    onClick: () => setEntry({}),
    style: {
      padding: "9px 18px",
      fontSize: 14
    }
  }, "+ Thêm"), React.createElement("button", {
    onClick: () => setTab(tab === "settings" ? "home" : "settings"),
    "aria-label": "Cài đặt",
    title: "Cài đặt",
    style: {
      fontSize: 20,
      lineHeight: 1,
      padding: "4px 2px",
      color: tab === "settings" ? cssVar("--ink") : cssVar("--muted")
    }
  }, tab === "settings" ? "×" : "⚙"))), tab === "home" && React.createElement(Home, {
    data: data,
    month: month,
    setMonth: setMonth,
    txs: txs,
    onEdit: t => setEntry({
      initial: t
    }),
    onAdd: () => setEntry({}),
    onPayBill: payBillQuick,
    goTab: setTab
  }), tab === "bills" && React.createElement(Bills, {
    data: data,
    reload: reload,
    flash: flash
  }), tab === "cards" && React.createElement(Cards, {
    data: data,
    reload: reload,
    flash: flash
  }), tab === "invest" && React.createElement(Invest, {
    flash: flash
  }), tab === "reports" && React.createElement(Reports, {
    month: month,
    setMonth: setMonth,
    flash: flash
  }), tab === "assistant" && React.createElement(Assistant, {
    data: data,
    month: month,
    flash: flash
  }), tab === "settings" && React.createElement(Settings, {
    data: data,
    reload: reload,
    flash: flash,
    theme: theme,
    setTheme: setTheme,
    onLogout: logout
  })), React.createElement("nav", {
    style: {
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      background: cssVar("--card"),
      borderTop: `1px solid ${cssVar("--line")}`,
      paddingBottom: "env(safe-area-inset-bottom)",
      zIndex: 40
    }
  }, React.createElement("div", {
    className: "row",
    style: {
      maxWidth: 620,
      margin: "0 auto"
    }
  }, TABS.map(n => {
    const on = tab === n.id;
    return React.createElement("button", {
      key: n.id,
      onClick: () => setTab(n.id),
      style: {
        flex: 1,
        padding: "14px 2px",
        fontSize: 11,
        fontWeight: on ? 600 : 400,
        whiteSpace: "nowrap",
        color: on ? cssVar("--ink") : cssVar("--muted"),
        borderTop: `2px solid ${on ? cssVar("--ink") : "transparent"}`,
        marginTop: -1
      }
    }, n.label);
  }))), entry && React.createElement(Entry, {
    data: data,
    initial: entry.initial,
    prefill: entry.prefill,
    flash: flash,
    onSaved: onSaved,
    onDeleted: onDeleted,
    onClose: () => setEntry(null)
  }), React.createElement(Toast, {
    msg: toast
  }));
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App, null));
const RESET_SCOPES = [{
  id: "all",
  label: "Toàn bộ",
  desc: "Chi tiêu, hóa đơn, thẻ, sổ chứng khoán, danh mục. Danh mục quay về mặc định."
}, {
  id: "spending",
  label: "Chỉ chi tiêu",
  desc: "Khoản chi, hóa đơn, thẻ tín dụng. Giữ nguyên sổ chứng khoán."
}, {
  id: "stock",
  label: "Chỉ chứng khoán",
  desc: "Sổ giao dịch chứng khoán. Giữ nguyên phần chi tiêu."
}];
function ResetData({
  flash,
  reload
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("all");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [backedUp, setBackedUp] = useState(false);
  const [err, setErr] = useState("");
  const spec = RESET_SCOPES.find(r => r.id === scope);
  const backup = async () => {
    try {
      const res = await api("/export.json", {
        raw: true
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `so-chi-sao-luu-${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackedUp(true);
      flash("Đã tải file sao lưu về máy");
    } catch (e) {
      flash("Không tải được sao lưu: " + e.message);
    }
  };
  const wipe = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api("/reset", {
        method: "POST",
        body: {
          password,
          scope
        }
      });
      const n = Object.values(r.deleted).reduce((a, b) => a + b, 0);
      flash(`Đã xóa ${n} bản ghi`);
      setOpen(false);
      setPassword("");
      setBackedUp(false);
      reload();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  if (!open) {
    return React.createElement("div", {
      style: {
        marginTop: 12
      }
    }, React.createElement("button", {
      onClick: () => setOpen(true),
      style: {
        fontSize: 14,
        fontWeight: 500,
        color: cssVar("--red"),
        border: `1px solid ${cssVar("--red")}`,
        borderRadius: 99,
        padding: "10px 18px"
      }
    }, "Xóa sạch dữ liệu"), React.createElement("p", {
      style: {
        fontSize: 12,
        color: cssVar("--muted"),
        marginTop: 10,
        lineHeight: 1.6
      }
    }, "Đưa app về trạng thái mới hoàn toàn. Tài khoản đăng nhập vẫn giữ nguyên."));
  }
  return React.createElement("div", {
    className: "box",
    style: {
      padding: 16,
      marginTop: 12,
      borderColor: cssVar("--red")
    }
  }, React.createElement(Field, {
    label: "Xóa phần nào"
  }, React.createElement(Chips, {
    options: RESET_SCOPES.map(r => ({
      id: r.id,
      label: r.label
    })),
    value: scope,
    onChange: v => {
      setScope(v);
      setBackedUp(false);
    }
  }), React.createElement("p", {
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      marginTop: 10,
      lineHeight: 1.6
    }
  }, spec.desc)), React.createElement("div", {
    style: {
      marginBottom: 18
    }
  }, React.createElement("div", {
    className: "between",
    style: {
      marginBottom: 8
    }
  }, React.createElement("span", {
    style: {
      fontSize: 12,
      color: cssVar("--muted")
    }
  }, "Bước 1 — sao lưu"), backedUp && React.createElement("span", {
    style: {
      fontSize: 12,
      color: cssVar("--green")
    }
  }, "đã tải về")), React.createElement(Button, {
    kind: "outline",
    onClick: backup,
    style: {
      width: "100%"
    }
  }, backedUp ? "Tải lại file sao lưu" : "Tải file sao lưu về máy"), React.createElement("p", {
    style: {
      fontSize: 12,
      color: cssVar("--muted"),
      marginTop: 8,
      lineHeight: 1.6
    }
  }, "Xóa xong là không khôi phục được. Nên tải file này trước, phòng khi bấm nhầm.")), React.createElement(Field, {
    label: "Bước 2 — nhập mật khẩu đăng nhập để xác nhận"
  }, React.createElement("input", {
    className: "field",
    type: "password",
    value: password,
    autoComplete: "current-password",
    placeholder: "mật khẩu của bạn",
    onChange: e => {
      setPassword(e.target.value);
      setErr("");
    },
    onKeyDown: e => e.key === "Enter" && password && wipe()
  })), err && React.createElement("div", {
    style: {
      fontSize: 13,
      color: cssVar("--red"),
      marginBottom: 14
    }
  }, err), React.createElement("div", {
    className: "row",
    style: {
      gap: 12
    }
  }, React.createElement(Button, {
    kind: "ghost",
    onClick: () => {
      setOpen(false);
      setPassword("");
      setErr("");
    }
  }, "Hủy"), React.createElement("button", {
    onClick: wipe,
    disabled: busy || !password,
    style: {
      flex: 1,
      padding: "12px 0",
      borderRadius: 99,
      fontSize: 15,
      fontWeight: 600,
      color: "#fff",
      background: busy || !password ? cssVar("--track") : cssVar("--red"),
      cursor: busy || !password ? "not-allowed" : "pointer"
    }
  }, busy ? "Đang xóa…" : `Xóa ${spec.label.toLowerCase()}`)));
}