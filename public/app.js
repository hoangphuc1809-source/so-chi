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
function Invest({
  flash
}) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setBusy(true);
    api("/portfolio").then(d => {
      setData(d);
      setErr("");
    }).catch(e => setErr(e.message)).finally(() => setBusy(false));
  }, []);
  useEffect(load, [load]);
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
    }, "Sổ Chi không tự tính danh mục. Số liệu do ", React.createElement("b", null, "portfolio-bot"), " trên máy chủ hermes-gateway tính từ sổ giao dịch FIFO rồi đẩy sang đây theo lịch. Nếu tab này trống, kiểm tra dịch vụ ", React.createElement("span", {
      className: "num"
    }, "portfolio-bot"), " và timer ", React.createElement("span", {
      className: "num"
    }, "portfolio-snapshot"), " bên đó.")));
  }
  const stale = data.age_minutes > 60;
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
  }, "Thiếu giá thị trường của ", (s.price_missing || []).join(", ") || "một số mã", " nên NAV và lãi/lỗ chưa tính được. Giá vốn và số lượng vẫn chính xác.")), React.createElement("section", {
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
  }, s.nav != null ? money(s.nav) : "—"), !s.degraded && React.createElement("div", {
    className: "num",
    style: {
      fontSize: 12,
      marginTop: 4,
      color: plColor(s.unrealized_pl)
    }
  }, sign(s.unrealized_pl), money(s.unrealized_pl), " chưa thực hiện", s.unrealized_pct != null && ` (${sign(s.unrealized_pct)}${s.unrealized_pct.toFixed(2)}%)`), React.createElement("div", {
    className: "num",
    style: {
      fontSize: 11,
      color: stale ? cssVar("--amber") : cssVar("--muted"),
      marginTop: 6
    }
  }, "cập nhật ", data.age_minutes < 1 ? "vừa xong" : `${data.age_minutes} phút trước`, stale && " — số liệu đã cũ", "  ·  ", React.createElement("button", {
    onClick: load,
    style: {
      color: cssVar("--blue"),
      fontSize: 11
    }
  }, "tải lại"))), React.createElement("section", {
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
  }, short(s.margin_debt > 0 ? s.margin_debt : s.cash)))), s.margin_debt > 0 && s.stock_value > 0 && React.createElement("section", {
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
  }, React.createElement("span", null, nf.format(p.qty), " cp · vốn ", nf.format(p.avg_cost), " · giá ", p.market_price != null ? nf.format(p.market_price) : "—"), React.createElement("span", null, p.weight != null ? `${p.weight.toFixed(1)}%` : "")), p.weight != null && React.createElement("div", {
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
  }, "tỷ trọng trên 40%, danh mục đang tập trung vào mã này")))), React.createElement("p", {
    style: {
      fontSize: 11,
      color: cssVar("--muted"),
      marginTop: 24,
      lineHeight: 1.6
    }
  }, "Số liệu ghi chép từ sổ giao dịch FIFO của portfolio-bot, không phải số liệu chính thức từ công ty chứng khoán và không phải khuyến nghị đầu tư. Đối chiếu với app TCBS trước khi ra quyết định."));
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
  }, "Đăng xuất"))));
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