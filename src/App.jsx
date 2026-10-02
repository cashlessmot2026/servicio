import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ============================================================================
   HOTEL CONCIERGE · PWA de servicios para huéspedes
   Todo el front-end vive en este archivo. Backend: Supabase (ver schema.sql).
   ========================================================================== */

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

/* ---------------------------------- Datos --------------------------------- */

const DEPTS = {
  reception: { name: "Recepción", desc: "Consultas generales, taxis, información y solicitudes especiales.", icon: "bell",
    quick: ["Late check-out", "Solicitar un taxi", "Información de la ciudad", "Reportar un inconveniente"] },
  roomservice: { name: "Servicio a la habitación", desc: "Pedidos a su habitación, limpieza y amenidades.", icon: "bag", menu: true,
    quick: ["Toallas adicionales", "Limpieza de habitación", "Almohadas extra", "Mantenimiento"] },
  restaurant: { name: "Restaurante", desc: "Reserve su mesa, consulte la carta y haga pedidos.", icon: "utensils", menu: true,
    quick: ["Reservar una mesa", "Consulta sobre la carta", "Alergias o dieta especial"] },
};
const ROLE_LABEL = { guest: "Huésped", reception: "Recepción", roomservice: "Servicio a la habitación", restaurant: "Restaurante" };
const STATUS = { pendiente: "Pendiente", en_curso: "En curso", listo: "Listo", cancelado: "Cancelado", confirmada: "Confirmada", cancelada: "Cancelada" };
const NEXT = { pendiente: ["en_curso", "Iniciar"], en_curso: ["listo", "Marcar listo"] };
const KINDS = { deporte: "Deporte", bienestar: "Bienestar", salon: "Salón", otro: "Otro" };

/* -------------------------------- Utilidades ------------------------------ */

const isAdminHash = () => ["#admin", "#/admin"].includes(window.location.hash.toLowerCase());

const toEmail = (u) => `${u.trim().toLowerCase()}@hotel.local`;
const money = (n) => new Intl.NumberFormat("es", { style: "currency", currency: "USD" }).format(n || 0);
const fmtDT = (d) => new Date(d).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("es", { dateStyle: "long" });
const fmtHour = (d) => new Date(d).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
const ymd = (d) => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };
const hh = (t) => parseInt(String(t).slice(0, 2), 10);
const genPass = () => { const c = "abcdefghjkmnpqrstuvwxyz23456789"; return Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => c[x % c.length]).join(""); };

function parseRange(s) {
  const m = /"?([^",]+)"?,"?([^")\]]+)"?/.exec(String(s).slice(1));
  const p = (v) => new Date(/[+-]\d\d$/.test(v) ? v.replace(" ", "T") + ":00" : v.replace(" ", "T"));
  return m ? [p(m[1]), p(m[2])] : [new Date(), new Date()];
}
const q = async (promise) => { const { data, error } = await promise; if (error) throw error; return data; };
const friendly = (e) => {
  const m = e?.message || String(e);
  if (e?.code === "23P01" || /no_overlap/.test(m)) return "Ese horario ya fue reservado. Elija otro.";
  if (/already exists|ya existe/i.test(m)) return m.replace(/^.*?(El usuario)/, "$1");
  return m;
};

/* --------------------------------- Hooks ---------------------------------- */

function useLive(tables, cb) {
  const ref = useRef(cb); ref.current = cb;
  const key = tables.join(",");
  useEffect(() => {
    if (!key) return;
    const ch = supabase.channel("live-" + Math.random().toString(36).slice(2));
    key.split(",").forEach((t) => ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => ref.current()));
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [key]);
}

function useData(loader, deps = [], live = []) {
  const [st, setSt] = useState({ data: null, loading: true, error: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    try { setSt({ data: await loader(), loading: false, error: null }); }
    catch (e) { setSt((s) => ({ ...s, loading: false, error: friendly(e) })); }
  }, deps);
  useEffect(() => { load(); }, [load]);
  useLive(live, load);
  return { ...st, reload: load };
}

function useSettings() {
  const { data, reload } = useData(async () => {
    const { data: row, error } = await supabase.from("hotel_settings").select("*").eq("id", 1).maybeSingle();
    return error ? {} : row || {};
  }, [], ["hotel_settings"]);
  return { settings: data || {}, reload };
}

const Notify = createContext(() => {});
const useNotify = () => useContext(Notify);

/* ---------------------------------- Estilos -------------------------------- */

const CSS = `
:root{--bg:#f6f2ea;--surface:#fff;--ink:#14243b;--muted:#6b7788;--line:#e4dccd;--navy:#0f2742;--gold:#b08d4f;--gold-d:#8f6f38;
--ok:#2f7d5b;--warn:#b7791f;--info:#2b6cb0;--bad:#b03a3a;--shadow:0 1px 2px rgba(15,39,66,.06),0 8px 24px rgba(15,39,66,.06);--r:14px}
@media(prefers-color-scheme:dark){:root{--bg:#0a1423;--surface:#12213a;--ink:#f1e9d9;--muted:#98a5b8;--line:#223452;--gold:#c9a566;--gold-d:#d8b97c;
--ok:#4cb58a;--warn:#e0a63f;--info:#63a4e8;--bad:#e07474;--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.25)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:"Cormorant Garamond",Georgia,serif;margin:0;font-weight:600;letter-spacing:.01em}
h2{font-size:1.9rem}h3{font-size:1.35rem}p{margin:0}button,input,select,textarea{font:inherit;color:inherit}
.shell{min-height:100%;display:flex;flex-direction:column}
.top{background:var(--navy);color:#f3ece0;padding:calc(10px + env(safe-area-inset-top)) 18px 10px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:20;border-bottom:2px solid var(--gold)}
.brand{font-family:"Cormorant Garamond",serif;font-size:1.35rem;letter-spacing:.16em;font-weight:700;flex:1;color:#e7d3a8}
.who{font-size:.78rem;text-align:right;line-height:1.25;opacity:.9}.who b{display:block;font-weight:600}
.main{flex:1;width:100%;max-width:960px;margin:0 auto;padding:20px 16px calc(96px + env(safe-area-inset-bottom))}
.nav{position:fixed;left:0;right:0;bottom:0;background:var(--surface);border-top:1px solid var(--line);display:flex;z-index:20;padding-bottom:env(safe-area-inset-bottom)}
.nav button{flex:1;background:none;border:0;padding:9px 2px 8px;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:.66rem;color:var(--muted);cursor:pointer;letter-spacing:.02em}
.nav button.on{color:var(--gold-d);font-weight:600}.nav svg{width:22px;height:22px}
@media(min-width:820px){.nav{top:60px;right:auto;bottom:0;width:210px;flex-direction:column;border-top:0;border-right:1px solid var(--line);padding:16px 10px}
.nav button{flex:0;flex-direction:row;gap:12px;font-size:.92rem;padding:12px 14px;border-radius:10px;text-align:left}.nav button.on{background:var(--bg)}
.main{padding-left:232px;max-width:1180px;margin:0}.shell{align-items:stretch}}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:18px}
.grid{display:grid;gap:14px}.g2{grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.sp{justify-content:space-between}.mt{margin-top:18px}.mt2{margin-top:10px}.muted{color:var(--muted);font-size:.88rem}.sm{font-size:.82rem}
.kicker{font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:var(--gold-d);font-weight:600}
.btn{border:1px solid var(--navy);background:var(--navy);color:#f3ece0;padding:10px 18px;border-radius:10px;cursor:pointer;font-weight:500;letter-spacing:.02em;transition:.15s}
.btn:hover{filter:brightness(1.15)}.btn:disabled{opacity:.5;cursor:not-allowed}
.btn.gold{background:var(--gold);border-color:var(--gold);color:#fff}.btn.ghost{background:transparent;color:var(--ink);border-color:var(--line)}
.btn.danger{background:transparent;color:var(--bad);border-color:var(--bad)}.btn.sm{padding:6px 12px;font-size:.82rem}
.chip{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:7px 14px;font-size:.84rem;cursor:pointer}
.chip:hover,.chip.on{border-color:var(--gold);color:var(--gold-d);font-weight:600}
.tabs{display:flex;gap:6px;border-bottom:1px solid var(--line);margin:16px 0;overflow-x:auto}
.tabs button{background:none;border:0;padding:10px 14px;cursor:pointer;color:var(--muted);border-bottom:2px solid transparent;white-space:nowrap}
.tabs button.on{color:var(--ink);border-color:var(--gold);font-weight:600}
label.f{display:flex;flex-direction:column;gap:5px;font-size:.8rem;color:var(--muted);font-weight:500}
input,select,textarea{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px;width:100%;color:var(--ink)}
input:focus,select:focus,textarea:focus{outline:2px solid var(--gold);outline-offset:-1px}
.form{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));align-items:end}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.72rem;font-weight:600;border:1px solid currentColor}
.s-pendiente{color:var(--warn)}.s-en_curso{color:var(--info)}.s-listo,.s-confirmada{color:var(--ok)}.s-cancelado,.s-cancelada{color:var(--bad)}
.dept{cursor:pointer;display:flex;gap:14px;align-items:flex-start;text-align:left;width:100%;transition:.15s}.dept:hover{border-color:var(--gold);transform:translateY(-1px)}
.ico{width:44px;height:44px;border-radius:12px;background:var(--navy);color:#e7d3a8;display:grid;place-items:center;flex:none}.ico svg{width:22px;height:22px}
svg.i{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.chat{display:flex;flex-direction:column;height:min(62vh,560px)}.msgs{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:6px 2px}
.bub{max-width:80%;padding:9px 13px;border-radius:14px;background:var(--bg);border:1px solid var(--line);font-size:.92rem;white-space:pre-wrap;word-break:break-word}
.bub.me{align-self:flex-end;background:var(--navy);color:#f3ece0;border-color:var(--navy)}.bub small{display:block;opacity:.65;font-size:.68rem;margin-top:3px}
.slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
.slot{padding:10px 4px;text-align:center;border:1px solid var(--line);border-radius:10px;background:var(--surface);cursor:pointer;font-size:.88rem}
.slot:hover:not(:disabled){border-color:var(--gold)}.slot.on{background:var(--gold);color:#fff;border-color:var(--gold)}.slot:disabled{opacity:.35;cursor:not-allowed;text-decoration:line-through}
.qty{display:flex;align-items:center;gap:10px}.qty button{width:30px;height:30px;border-radius:50%;border:1px solid var(--line);background:var(--surface);cursor:pointer;font-size:1.1rem}
.item{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)}.item:last-child{border:0}
.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(88px + env(safe-area-inset-bottom));background:var(--navy);color:#f3ece0;padding:11px 20px;border-radius:12px;z-index:50;box-shadow:var(--shadow);max-width:92vw;font-size:.9rem;border-left:4px solid var(--gold)}
.toast.bad{border-color:var(--bad)}.banner{background:var(--warn);color:#fff;text-align:center;font-size:.8rem;padding:6px}
.login{min-height:100%;display:grid;place-items:center;padding:20px;background:linear-gradient(160deg,var(--navy),#17385f 60%,#0b1a2e)}
.login .card{width:100%;max-width:400px;padding:34px 28px}.login h1{font-size:2.1rem;text-align:center;letter-spacing:.14em;color:var(--gold-d)}
.rule{height:2px;width:56px;background:var(--gold);margin:12px auto 22px}
.cred{border:2px dashed var(--gold);border-radius:12px;padding:16px;background:var(--bg)}.cred code{font-size:1.1rem;font-weight:700;letter-spacing:.06em}
.empty{text-align:center;color:var(--muted);padding:28px 10px;font-size:.92rem}.err{color:var(--bad);font-size:.88rem}
table{width:100%;border-collapse:collapse;font-size:.9rem}th{text-align:left;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:8px}td{padding:11px 8px;border-top:1px solid var(--line);vertical-align:middle}
.scroll{overflow-x:auto}
.pc{background:#fff;color:#14243b;border:1px solid #e4dccd;border-radius:14px;padding:30px 28px;max-width:560px;box-shadow:var(--shadow)}
.pc-k{font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:#8f6f38;font-weight:600;margin:0}
.pc-h{font-family:"Cormorant Garamond",serif;font-size:1.9rem;letter-spacing:.12em;text-transform:uppercase;margin:6px 0 0;color:#14243b}
.pc-rule{height:2px;width:56px;background:#b08d4f;margin:12px 0 18px}
.pc-name{font-family:"Cormorant Garamond",serif;font-size:1.5rem;font-weight:600}
.pc-s{font-size:.8rem;color:#6b7788;margin-top:8px}
.pc-v{font-size:1.05rem;font-weight:600;letter-spacing:.03em;word-break:break-all}
.pc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:18px}
.pc-box{border:1px solid #e4dccd;border-radius:10px;padding:14px 16px;background:#faf7f2}
.pc-foot{margin-top:20px;font-size:.78rem;color:#6b7788;border-top:1px solid #e4dccd;padding-top:12px}
@media print{@page{margin:18mm}body *{visibility:hidden!important}.print-card,.print-card *{visibility:visible!important}
.print-card{position:absolute;left:0;top:0;width:100%;max-width:none;border:0;box-shadow:none}.noprint{display:none!important}}
`;

/* -------------------------------- Componentes UI --------------------------- */

const PATHS = {
  home: "M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  calendar: "M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4",
  bag: "M6 2L3 6v14h18V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8",
  logout: "M9 21H5V3h4 M16 17l5-5-5-5 M21 12H9",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2 M5.5 5h13l3.5 7v7H2v-7z",
  utensils: "M4 3v7a3 3 0 0 0 3 3v8 M7 3v7 M10 3v7a3 3 0 0 1-3 3 M18 21V3c-3 2-4 5-4 8h4",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
};
const Icon = ({ n }) => (<svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS[n]} /></svg>);
const Badge = ({ s }) => <span className={`badge s-${s}`}>{STATUS[s] || s}</span>;
const Empty = ({ children }) => <div className="empty">{children}</div>;
const Loading = () => <Empty>Cargando…</Empty>;
const Field = ({ label, children }) => (<label className="f">{label}{children}</label>);

function Nav({ items, active, onSelect }) {
  return (
    <nav className="nav">
      {items.map((it) => (
        <button key={it.id} className={active === it.id ? "on" : ""} onClick={() => onSelect(it.id)}>
          <Icon n={it.icon} />{it.label}
        </button>
      ))}
    </nav>
  );
}

function Tabs({ items, active, onSelect }) {
  return (
    <div className="tabs">
      {items.map(([id, label]) => (<button key={id} className={active === id ? "on" : ""} onClick={() => onSelect(id)}>{label}</button>))}
    </div>
  );
}

/* ----------------------------------- Login --------------------------------- */

function Login({ notice, admin }) {
  const [u, setU] = useState(admin ? "recepcion" : "");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(notice || "");
  useEffect(() => { setErr(notice || ""); }, [notice]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: toEmail(u), password: p });
    if (error) setErr(/fetch|network/i.test(error.message) ? "Sin conexión. Intente nuevamente." : "Usuario o contraseña incorrectos.");
    setBusy(false);
  }

  return (
    <div className="login">
      <form className="card grid" onSubmit={submit}>
        <div><p className="kicker" style={{ textAlign: "center" }}>{admin ? "Administración" : "Bienvenido"}</p><h1>CONCIERGE</h1><div className="rule" /></div>
        <Field label="Usuario"><input value={u} onChange={(e) => setU(e.target.value)} autoCapitalize="none" autoComplete="username" required /></Field>
        <Field label="Contraseña"><input type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required /></Field>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn gold" disabled={busy}>{busy ? "Ingresando…" : "Ingresar"}</button>
        <p className="muted sm" style={{ textAlign: "center" }}>{admin ? "Acceso exclusivo para el personal del hotel." : "Su usuario y contraseña le fueron entregados en recepción al registrarse."}</p>
      </form>
    </div>
  );
}

/* ------------------------------------ Chat --------------------------------- */

function Chat({ guestId, dept, me }) {
  const { data: msgs, loading, reload } = useData(
    () => q(supabase.from("messages").select("*").eq("guest_id", guestId).eq("department", dept).order("created_at")),
    [guestId, dept], ["messages"]);
  const [text, setText] = useState("");
  const end = useRef(null);
  const notify = useNotify();
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs?.length]);

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    const { error } = await supabase.from("messages").insert({ guest_id: guestId, department: dept, sender_id: me.id, body });
    if (error) { setText(body); notify(friendly(error), true); } else reload();
  }

  return (
    <div className="chat">
      <div className="msgs">
        {loading ? <Loading /> : !msgs?.length ? <Empty>Escriba su primer mensaje a {DEPTS[dept].name}.</Empty> :
          msgs.map((m) => (
            <div key={m.id} className={"bub" + (m.sender_id === me.id ? " me" : "")}>{m.body}<small>{fmtDT(m.created_at)}</small></div>
          ))}
        <div ref={end} />
      </div>
      <form className="row mt2" onSubmit={send}>
        <input style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escriba un mensaje…" maxLength={2000} />
        <button className="btn">Enviar</button>
      </form>
    </div>
  );
}

/* ------------------------------ Pedidos y solicitudes ---------------------- */

function OrderCard({ o, who, actions }) {
  return (
    <div className="card">
      <div className="row sp">
        <div><b>{DEPTS[o.department].name}</b>{who && <span className="muted"> · {who}</span>}<div className="muted sm">{fmtDT(o.created_at)}</div></div>
        <Badge s={o.status} />
      </div>
      <div className="mt2">
        {o.order_items?.map((i) => (<div key={i.id} className="row sp sm"><span>{i.qty} × {i.name}</span><span>{money(i.qty * i.price)}</span></div>))}
      </div>
      {o.notes && <p className="muted sm mt2">Nota: {o.notes}</p>}
      <div className="row sp mt2"><b>Total {money(o.total)}</b>{actions}</div>
    </div>
  );
}

function StatusActions({ table, row, onDone }) {
  const notify = useNotify();
  async function set(status) {
    const { error } = await supabase.from(table).update({ status }).eq("id", row.id);
    if (error) notify(friendly(error), true); else onDone?.();
  }
  const nx = NEXT[row.status];
  if (!nx) return null;
  return (
    <div className="row">
      <button className="btn sm" onClick={() => set(nx[0])}>{nx[1]}</button>
      <button className="btn sm danger" onClick={() => set("cancelado")}>Cancelar</button>
    </div>
  );
}

/* ================================ HUÉSPED =================================== */

function Menu({ dept, me }) {
  const notify = useNotify();
  const { data: items, loading } = useData(
    () => q(supabase.from("menu_items").select("*").eq("department", dept).eq("active", true).order("category").order("name")),
    [dept], ["menu_items"]);
  const [cart, setCart] = useState({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const lines = (items || []).filter((i) => cart[i.id]);
  const total = lines.reduce((s, i) => s + i.price * cart[i.id], 0);
  const change = (id, d) => setCart((c) => { const n = Math.max(0, (c[id] || 0) + d); const x = { ...c }; if (n) x[id] = n; else delete x[id]; return x; });
  const cats = [...new Set((items || []).map((i) => i.category))];

  async function order() {
    setBusy(true);
    const { error } = await supabase.rpc("place_order", {
      p_department: dept, p_items: lines.map((i) => ({ id: i.id, qty: cart[i.id] })), p_notes: notes || null });
    setBusy(false);
    if (error) return notify(friendly(error), true);
    setCart({}); setNotes(""); notify("Pedido enviado. Puede seguirlo en «Mi actividad».");
  }

  if (loading) return <Loading />;
  if (!items.length) return <Empty>La carta no está disponible por el momento.</Empty>;
  return (
    <div>
      {cats.map((c) => (
        <div key={c} className="card mt2"><p className="kicker">{c}</p>
          {items.filter((i) => i.category === c).map((i) => (
            <div className="item" key={i.id}>
              <div><b>{i.name}</b><div className="muted sm">{i.description}</div><div className="sm">{money(i.price)}</div></div>
              <div className="qty"><button onClick={() => change(i.id, -1)} aria-label="Quitar">−</button><span>{cart[i.id] || 0}</span><button onClick={() => change(i.id, 1)} aria-label="Agregar">+</button></div>
            </div>))}
        </div>))}
      {lines.length > 0 && (
        <div className="card mt grid">
          <h3>Su pedido</h3>
          {lines.map((i) => (<div key={i.id} className="row sp sm"><span>{cart[i.id]} × {i.name}</span><span>{money(i.price * cart[i.id])}</span></div>))}
          <Field label="Indicaciones (opcional)"><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <div className="row sp"><b>Total {money(total)}</b><button className="btn gold" disabled={busy} onClick={order}>{busy ? "Enviando…" : "Confirmar pedido"}</button></div>
        </div>)}
    </div>
  );
}

function QuickRequests({ dept, me }) {
  const notify = useNotify();
  const [custom, setCustom] = useState("");
  const { data: reqs, reload } = useData(
    () => q(supabase.from("requests").select("*").eq("guest_id", me.id).eq("department", dept).order("created_at", { ascending: false })),
    [dept, me.id], ["requests"]);

  async function create(title) {
    if (!title.trim()) return;
    const { error } = await supabase.from("requests").insert({ guest_id: me.id, department: dept, title: title.trim() });
    if (error) return notify(friendly(error), true);
    setCustom(""); notify("Solicitud enviada."); reload();
  }

  return (
    <div>
      <div className="row">{DEPTS[dept].quick.map((t) => (<button key={t} className="chip" onClick={() => create(t)}>{t}</button>))}</div>
      <form className="row mt2" onSubmit={(e) => { e.preventDefault(); create(custom); }}>
        <input style={{ flex: 1 }} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Otra solicitud…" />
        <button className="btn">Solicitar</button>
      </form>
      <div className="grid mt">
        {reqs?.map((r) => (<div key={r.id} className="card row sp"><div><b>{r.title}</b><div className="muted sm">{fmtDT(r.created_at)}</div></div><Badge s={r.status} /></div>))}
        {reqs && !reqs.length && <Empty>Aún no tiene solicitudes en este departamento.</Empty>}
      </div>
    </div>
  );
}

function GuestServices({ me, dept, setDept }) {
  const [sub, setSub] = useState("chat");
  useEffect(() => setSub("chat"), [dept]);
  if (!dept) {
    return (
      <div>
        <p className="kicker">Servicios</p><h2>¿En qué podemos ayudarle?</h2>
        <div className="grid g2 mt">
          {Object.entries(DEPTS).map(([id, d]) => (
            <button key={id} className="card dept" onClick={() => setDept(id)}>
              <span className="ico"><Icon n={d.icon} /></span><span><h3>{d.name}</h3><span className="muted">{d.desc}</span></span>
            </button>))}
        </div>
      </div>
    );
  }
  const d = DEPTS[dept];
  return (
    <div>
      <button className="btn ghost sm" onClick={() => setDept(null)}>← Servicios</button>
      <h2 className="mt2">{d.name}</h2>
      <Tabs items={[["chat", "Mensajes"], ["req", "Solicitudes"], ...(d.menu ? [["menu", "Carta y pedidos"]] : [])]} active={sub} onSelect={setSub} />
      {sub === "chat" && <div className="card"><Chat guestId={me.id} dept={dept} me={me} /></div>}
      {sub === "req" && <QuickRequests dept={dept} me={me} />}
      {sub === "menu" && <Menu dept={dept} me={me} />}
    </div>
  );
}

function Booking({ space, me, onBack }) {
  const notify = useNotify();
  const [day, setDay] = useState(ymd(new Date()));
  const [dur, setDur] = useState(1);
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadBusy = useCallback(async () => {
    const base = new Date(day + "T00:00:00");
    const days = [-1, 0, 1].map((o) => ymd(new Date(base.getTime() + o * 864e5)));
    const res = await Promise.all(days.map((d) => supabase.rpc("busy_slots", { p_space: space.id, p_day: d })));
    setBusy(res.flatMap((r) => r.data || []).map((r) => [new Date(r.starts), new Date(r.ends)]));
  }, [day, space.id]);
  useEffect(() => { setPick(null); loadBusy(); }, [loadBusy]);
  useLive(["reservations"], loadBusy);

  const hours = [];
  for (let h = hh(space.open_time); h + dur <= hh(space.close_time); h++) hours.push(h);
  const mk = (h) => { const s = new Date(day + "T00:00:00"); s.setHours(h); return [s, new Date(s.getTime() + dur * 36e5)]; };
  const taken = (h) => { const [s, e] = mk(h); return s < new Date() || busy.some(([bs, be]) => s < be && e > bs); };

  async function reserve() {
    const [s, e] = mk(pick);
    setSaving(true);
    const { error } = await supabase.from("reservations").insert({
      space_id: space.id, guest_id: me.id, during: `["${s.toISOString()}","${e.toISOString()}")` });
    setSaving(false);
    if (error) { notify(friendly(error), true); return loadBusy(); }
    notify("Reserva confirmada."); setPick(null); loadBusy();
  }

  return (
    <div>
      <button className="btn ghost sm" onClick={onBack}>← Espacios</button>
      <h2 className="mt2">{space.name}</h2>
      <p className="muted">{space.description} · Horario {space.open_time.slice(0, 5)}–{space.close_time.slice(0, 5)}</p>
      <div className="form mt">
        <Field label="Fecha"><input type="date" value={day} min={ymd(new Date())} onChange={(e) => setDay(e.target.value)} /></Field>
        <Field label="Duración"><select value={dur} onChange={(e) => setDur(+e.target.value)}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} hora{n > 1 ? "s" : ""}</option>)}</select></Field>
      </div>
      <p className="kicker mt">Horarios disponibles</p>
      <div className="slots mt2">
        {hours.map((h) => (<button key={h} className={"slot" + (pick === h ? " on" : "")} disabled={taken(h)} onClick={() => setPick(h)}>{String(h).padStart(2, "0")}:00</button>))}
        {!hours.length && <Empty>No hay horarios para esa duración.</Empty>}
      </div>
      {pick !== null && (
        <div className="card mt row sp">
          <span>{fmtDate(day)} · {String(pick).padStart(2, "0")}:00 – {String((pick + dur) % 24).padStart(2, "0")}:00</span>
          <button className="btn gold" disabled={saving} onClick={reserve}>{saving ? "Reservando…" : "Confirmar reserva"}</button>
        </div>)}
    </div>
  );
}

function GuestReservations({ me }) {
  const [space, setSpace] = useState(null);
  const { data: spaces, loading } = useData(() => q(supabase.from("spaces").select("*").eq("active", true).order("name")), [], ["spaces"]);
  if (space) return <Booking space={space} me={me} onBack={() => setSpace(null)} />;
  return (
    <div>
      <p className="kicker">Reservas</p><h2>Espacios del hotel</h2>
      {loading ? <Loading /> : (
        <div className="grid g2 mt">
          {spaces.map((s) => (
            <button key={s.id} className="card dept" onClick={() => setSpace(s)}>
              <span className="ico"><Icon n="calendar" /></span>
              <span><h3>{s.name}</h3><span className="muted">{s.description}</span>
                <span className="muted sm" style={{ display: "block" }}>{KINDS[s.kind] || s.kind}{s.capacity ? ` · hasta ${s.capacity} personas` : ""}</span></span>
            </button>))}
          {!spaces.length && <Empty>No hay espacios disponibles.</Empty>}
        </div>)}
    </div>
  );
}

function ReservationRow({ r, who, onChange }) {
  const notify = useNotify();
  const [s, e] = parseRange(r.during);
  async function cancel() {
    if (!window.confirm("¿Cancelar esta reserva?")) return;
    const { error } = await supabase.rpc("cancel_reservation", { p_id: r.id });
    if (error) notify(friendly(error), true); else onChange?.();
  }
  return (
    <div className="card row sp">
      <div><b>{r.spaces?.name}</b>{who && <span className="muted"> · {who}</span>}
        <div className="muted sm">{fmtDT(s)} – {fmtHour(e)}</div></div>
      <div className="row"><Badge s={r.status} />{r.status === "confirmada" && e > new Date() && <button className="btn sm danger" onClick={cancel}>Cancelar</button>}</div>
    </div>
  );
}

function Activity({ me }) {
  const ords = useData(() => q(supabase.from("orders").select("*, order_items(*)").eq("guest_id", me.id).order("created_at", { ascending: false })), [me.id], ["orders"]);
  const ress = useData(() => q(supabase.from("reservations").select("*, spaces(name)").eq("guest_id", me.id).order("created_at", { ascending: false })), [me.id], ["reservations"]);
  const reqs = useData(() => q(supabase.from("requests").select("*").eq("guest_id", me.id).order("created_at", { ascending: false })), [me.id], ["requests"]);
  return (
    <div>
      <p className="kicker">Mi estancia</p><h2>Mi actividad</h2>
      <h3 className="mt">Reservas</h3>
      <div className="grid mt2">{ress.data?.map((r) => <ReservationRow key={r.id} r={r} onChange={ress.reload} />)}{ress.data && !ress.data.length && <Empty>Sin reservas.</Empty>}</div>
      <h3 className="mt">Pedidos</h3>
      <div className="grid mt2">{ords.data?.map((o) => <OrderCard key={o.id} o={o} />)}{ords.data && !ords.data.length && <Empty>Sin pedidos.</Empty>}</div>
      <h3 className="mt">Solicitudes</h3>
      <div className="grid mt2">
        {reqs.data?.map((r) => (<div key={r.id} className="card row sp"><div><b>{r.title}</b><div className="muted sm">{DEPTS[r.department].name} · {fmtDT(r.created_at)}</div></div><Badge s={r.status} /></div>))}
        {reqs.data && !reqs.data.length && <Empty>Sin solicitudes.</Empty>}
      </div>
    </div>
  );
}

function GuestHome({ me, open, go }) {
  const { data: ress } = useData(() => q(supabase.from("reservations").select("*, spaces(name)").eq("guest_id", me.id).eq("status", "confirmada")), [me.id], ["reservations"]);
  const { data: ords } = useData(() => q(supabase.from("orders").select("id,status").eq("guest_id", me.id).in("status", ["pendiente", "en_curso"])), [me.id], ["orders"]);
  const { settings } = useSettings();
  const next = (ress || []).map((r) => ({ r, s: parseRange(r.during)[0] })).filter((x) => x.s > new Date()).sort((a, b) => a.s - b.s)[0];
  return (
    <div>
      <p className="kicker">Habitación {me.room || "—"}</p>
      <h2>Bienvenido, {me.full_name.split(" ")[0]}</h2>
      {me.check_out && <p className="muted">Su salida está prevista para el {fmtDate(me.check_out)}.</p>}
      <div className="grid g2 mt">
        <div className="card"><p className="kicker">Próxima reserva</p>
          {next ? <p className="mt2"><b>{next.r.spaces?.name}</b><br /><span className="muted">{fmtDT(next.s)}</span></p> : <p className="muted mt2">No tiene reservas próximas.</p>}
          <button className="btn ghost sm mt2" onClick={() => go("reservations")}>Reservar un espacio</button></div>
        <div className="card"><p className="kicker">Pedidos en curso</p>
          <p className="mt2" style={{ fontSize: "2rem", fontFamily: "Cormorant Garamond,serif" }}>{ords?.length ?? "—"}</p>
          <button className="btn ghost sm mt2" onClick={() => go("activity")}>Ver actividad</button></div>
      </div>
      {settings.wifi_name && (
        <div className="card mt"><p className="kicker">Wi‑Fi del hotel</p>
          <p className="mt2"><b>{settings.wifi_name}</b>{settings.wifi_password && <> · clave <code>{settings.wifi_password}</code></>}</p></div>)}
      <h3 className="mt">Departamentos</h3>
      <div className="grid g2 mt2">
        {Object.entries(DEPTS).map(([id, d]) => (
          <button key={id} className="card dept" onClick={() => open(id)}><span className="ico"><Icon n={d.icon} /></span><span><b>{d.name}</b><br /><span className="muted sm">{d.desc}</span></span></button>))}
      </div>
    </div>
  );
}

function GuestApp({ me }) {
  const [tab, setTab] = useState("home");
  const [dept, setDept] = useState(null);
  const open = (d) => { setDept(d); setTab("services"); };
  const items = [
    { id: "home", label: "Inicio", icon: "home" }, { id: "services", label: "Servicios", icon: "bell" },
    { id: "reservations", label: "Reservas", icon: "calendar" }, { id: "activity", label: "Mi actividad", icon: "list" },
  ];
  return (
    <>
      <Nav items={items} active={tab} onSelect={(t) => { if (t === "services") setDept(null); setTab(t); }} />
      <main className="main">
        {tab === "home" && <GuestHome me={me} open={open} go={setTab} />}
        {tab === "services" && <GuestServices me={me} dept={dept} setDept={setDept} />}
        {tab === "reservations" && <GuestReservations me={me} />}
        {tab === "activity" && <Activity me={me} />}
      </main>
    </>
  );
}

/* ================================= PERSONAL ================================= */

function useProfiles() {
  const { data } = useData(() => q(supabase.from("profiles").select("*").order("full_name")), [], ["profiles"]);
  return useMemo(() => Object.fromEntries((data || []).map((p) => [p.id, p])), [data]);
}
const whoIs = (p) => (p ? `${p.full_name}${p.room ? ` · Hab. ${p.room}` : ""}` : "");

function Inbox({ me }) {
  const isRec = me.role === "reception";
  const [dept, setDept] = useState(isRec ? "all" : me.role);
  const [sub, setSub] = useState("chats");
  const [thread, setThread] = useState(null);
  const profiles = useProfiles();
  const match = (d) => dept === "all" || d === dept;

  const msgs = useData(() => q(supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(400)), [], ["messages"]);
  const ords = useData(() => q(supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(100)), [], ["orders"]);
  const reqs = useData(() => q(supabase.from("requests").select("*").order("created_at", { ascending: false }).limit(100)), [], ["requests"]);

  const threads = useMemo(() => {
    const m = new Map();
    (msgs.data || []).filter((x) => match(x.department)).forEach((x) => { const k = x.guest_id + "|" + x.department; if (!m.has(k)) m.set(k, x); });
    return [...m.values()];
  }, [msgs.data, dept]); // eslint-disable-line

  const open = (list) => (list || []).filter((x) => match(x.department));
  const pending = open(ords.data).filter((o) => o.status === "pendiente").length + open(reqs.data).filter((r) => r.status === "pendiente").length;

  return (
    <div>
      <p className="kicker">Bandeja</p><h2>{isRec ? "Todos los departamentos" : DEPTS[me.role].name}</h2>
      {isRec && <div className="row mt2">{[["all", "Todos"], ...Object.entries(DEPTS).map(([k, v]) => [k, v.name])].map(([k, v]) => (
        <button key={k} className={"chip" + (dept === k ? " on" : "")} onClick={() => { setDept(k); setThread(null); }}>{v}</button>))}</div>}
      <Tabs items={[["chats", "Conversaciones"], ["orders", "Pedidos"], ["reqs", `Solicitudes${pending ? ` (${pending})` : ""}`]]} active={sub} onSelect={(s) => { setSub(s); setThread(null); }} />

      {sub === "chats" && (thread ? (
        <div>
          <button className="btn ghost sm" onClick={() => setThread(null)}>← Conversaciones</button>
          <h3 className="mt2">{whoIs(profiles[thread.guest_id])} <span className="muted sm">· {DEPTS[thread.department].name}</span></h3>
          <div className="card mt2"><Chat guestId={thread.guest_id} dept={thread.department} me={me} /></div>
        </div>
      ) : (
        <div className="grid">
          {threads.map((t) => (
            <button key={t.guest_id + t.department} className="card dept" onClick={() => setThread(t)}>
              <span className="ico"><Icon n="chat" /></span>
              <span style={{ flex: 1 }}><b>{whoIs(profiles[t.guest_id]) || "Huésped"}</b> <span className="muted sm">· {DEPTS[t.department].name}</span>
                <span className="muted sm" style={{ display: "block" }}>{t.sender_id === t.guest_id ? "" : "Usted: "}{t.body.slice(0, 90)} · {fmtDT(t.created_at)}</span></span>
            </button>))}
          {!threads.length && !msgs.loading && <Empty>No hay conversaciones.</Empty>}
        </div>))}

      {sub === "orders" && <div className="grid g2">
        {open(ords.data).map((o) => <OrderCard key={o.id} o={o} who={whoIs(profiles[o.guest_id])} actions={<StatusActions table="orders" row={o} onDone={ords.reload} />} />)}
        {ords.data && !open(ords.data).length && <Empty>No hay pedidos.</Empty>}</div>}

      {sub === "reqs" && <div className="grid">
        {open(reqs.data).map((r) => (
          <div key={r.id} className="card row sp"><div><b>{r.title}</b><div className="muted sm">{whoIs(profiles[r.guest_id])} · {DEPTS[r.department].name} · {fmtDT(r.created_at)}</div></div>
            <div className="row"><Badge s={r.status} /><StatusActions table="requests" row={r} onDone={reqs.reload} /></div></div>))}
        {reqs.data && !open(reqs.data).length && <Empty>No hay solicitudes.</Empty>}</div>}
    </div>
  );
}

const appUrl = () => window.location.origin + import.meta.env.BASE_URL;

function WelcomeCard({ info, settings, onClose }) {
  const hotel = settings.hotel_name || "Hotel Concierge";
  const [email, setEmail] = useState(info.email || "");
  const lines = [
    `Estimado/a ${info.full_name}:`, "",
    `Bienvenido/a a ${hotel}. Estos son sus datos de acceso:`, "",
    `Habitación: ${info.room}`,
    info.check_out ? `Salida prevista: ${fmtDate(info.check_out)}` : null, "",
    "APLICACIÓN DEL HOTEL", `Dirección: ${appUrl()}`, `Usuario: ${info.username}`, `Contraseña: ${info.password}`, "",
    ...(settings.wifi_name ? ["WI-FI DEL HOTEL", `Red: ${settings.wifi_name}`, settings.wifi_password ? `Clave: ${settings.wifi_password}` : null, ""] : []),
    settings.welcome_note || null, settings.welcome_note ? "" : null,
    "Sus credenciales dejarán de ser válidas al realizar el check-out.", "", hotel,
  ].filter((l) => l !== null);
  const subject = `Bienvenido a ${hotel} · Sus datos de acceso`;
  const enc = encodeURIComponent;
  const mailto = `mailto:${enc(email)}?subject=${enc(subject)}&body=${enc(lines.join("\n"))}`;
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(email)}&su=${enc(subject)}&body=${enc(lines.join("\n"))}`;

  return (
    <div className="mt">
      <p className="kicker noprint">{info.reset ? "Nueva contraseña" : "Huésped registrado"} · la contraseña solo se muestra ahora</p>
      <div className="pc print-card mt2">
        <p className="pc-k">Tarjeta de bienvenida</p>
        <h3 className="pc-h">{hotel}</h3><div className="pc-rule" />
        <p className="pc-name">{info.full_name}</p>
        <p className="pc-s">Habitación {info.room}{info.check_out ? ` · Salida ${fmtDate(info.check_out)}` : ""}</p>
        <div className="pc-grid">
          <div className="pc-box"><p className="pc-k">Aplicación del hotel</p>
            <p className="pc-s">Dirección</p><p className="pc-v">{appUrl()}</p>
            <p className="pc-s">Usuario</p><p className="pc-v">{info.username}</p>
            <p className="pc-s">Contraseña</p><p className="pc-v">{info.password}</p></div>
          {settings.wifi_name && (
            <div className="pc-box"><p className="pc-k">Wi‑Fi del hotel</p>
              <p className="pc-s">Red</p><p className="pc-v">{settings.wifi_name}</p>
              {settings.wifi_password && (<><p className="pc-s">Clave</p><p className="pc-v">{settings.wifi_password}</p></>)}</div>)}
        </div>
        {settings.welcome_note && <p className="pc-s" style={{ marginTop: 14 }}>{settings.welcome_note}</p>}
        <p className="pc-foot">Sus credenciales dejarán de ser válidas al realizar el check-out.</p>
      </div>
      <div className="card mt2 grid noprint">
        <div className="form">
          <Field label="Correo del huésped"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="huesped@correo.com" /></Field>
          <div className="row">
            <button className="btn gold" disabled={!email} onClick={() => { window.location.href = mailto; }}>Enviar por correo</button>
            <button className="btn ghost" disabled={!email} onClick={() => window.open(gmail, "_blank", "noopener")}>Abrir en Gmail</button>
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => window.print()}>Imprimir tarjeta</button>
          <button className="btn ghost" onClick={onClose}>Cerrar</button>
        </div>
        {!settings.wifi_name && <p className="muted sm">Para incluir el Wi‑Fi, configúrelo en la pestaña Ajustes.</p>}
        <p className="muted sm">«Enviar por correo» abre su programa de correo con el mensaje listo; usted solo pulsa enviar.</p>
      </div>
    </div>
  );
}

function Guests() {
  const notify = useNotify();
  const blank = { username: "", password: genPass(), full_name: "", room: "", email: "", check_out: "" };
  const [f, setF] = useState(blank);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const { settings } = useSettings();
  const { data: guests, reload } = useData(() => q(supabase.from("profiles").select("*").eq("role", "guest").order("room")), [], ["profiles"]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value, ...(k === "room" && !s.username ? { username: e.target.value ? `hab${e.target.value}` : "" } : {}) }));

  async function create(e) {
    e.preventDefault(); setBusy(true);
    const { data: id, error } = await supabase.rpc("create_guest", {
      p_username: f.username, p_password: f.password, p_full_name: f.full_name, p_room: f.room, p_check_in: ymd(new Date()), p_check_out: f.check_out || null });
    setBusy(false);
    if (error) return notify(friendly(error), true);
    if (f.email.trim()) {
      const r = await supabase.from("profiles").update({ email: f.email.trim() }).eq("id", id);
      if (r.error) notify("Huésped registrado, pero no se guardó el correo (falta ejecutar la migración SQL).", true);
    }
    setCreated({ ...f, email: f.email.trim() }); setF({ ...blank, password: genPass() }); reload();
  }
  async function checkout(g) {
    if (!window.confirm(`¿Realizar el checkout de ${g.full_name}?\nSu acceso se eliminará de inmediato junto con su actividad.`)) return;
    const { error } = await supabase.rpc("checkout_guest", { p_guest: g.id });
    if (error) notify(friendly(error), true); else { notify("Checkout realizado. Acceso eliminado."); reload(); }
  }
  async function reset(g) {
    const p = genPass();
    if (!window.confirm(`Se asignará una nueva contraseña a ${g.full_name}. ¿Continuar?`)) return;
    const { error } = await supabase.rpc("reset_guest_password", { p_guest: g.id, p_password: p });
    if (error) notify(friendly(error), true); else setCreated({ username: g.username, password: p, full_name: g.full_name, room: g.room, email: g.email || "", check_out: g.check_out, reset: true });
  }

  return (
    <div>
      <p className="kicker">Recepción</p><h2>Huéspedes</h2>
      <form className="card mt grid" onSubmit={create}>
        <h3>Registrar huésped</h3>
        <div className="form">
          <Field label="Nombre completo"><input value={f.full_name} onChange={set("full_name")} required /></Field>
          <Field label="Habitación"><input value={f.room} onChange={set("room")} required /></Field>
          <Field label="Correo del huésped (opcional)"><input type="email" value={f.email} onChange={set("email")} /></Field>
          <Field label="Usuario"><input value={f.username} onChange={set("username")} autoCapitalize="none" required /></Field>
          <Field label="Contraseña"><input value={f.password} onChange={set("password")} minLength={6} required /></Field>
          <Field label="Fecha de salida"><input type="date" value={f.check_out} onChange={set("check_out")} min={ymd(new Date())} /></Field>
          <button className="btn gold" disabled={busy}>{busy ? "Registrando…" : "Registrar"}</button>
        </div>
      </form>
      {created && <WelcomeCard key={created.username + created.password} info={created} settings={settings} onClose={() => setCreated(null)} />}
      <div className="card mt scroll">
        <table><thead><tr><th>Huésped</th><th>Hab.</th><th>Usuario</th><th>Salida</th><th /></tr></thead>
          <tbody>{guests?.map((g) => (
            <tr key={g.id}><td>{g.full_name}</td><td>{g.room}</td><td>{g.username}</td><td>{g.check_out ? fmtDate(g.check_out) : "—"}</td>
              <td><div className="row"><button className="btn sm ghost" onClick={() => reset(g)}>Nueva clave</button><button className="btn sm danger" onClick={() => checkout(g)}>Checkout</button></div></td></tr>))}</tbody></table>
        {guests && !guests.length && <Empty>No hay huéspedes registrados.</Empty>}
      </div>
    </div>
  );
}

function StaffReservations() {
  const profiles = useProfiles();
  const { data, reload } = useData(() => q(supabase.from("reservations").select("*, spaces(name)").eq("status", "confirmada")), [], ["reservations"]);
  const rows = (data || []).map((r) => ({ r, s: parseRange(r.during)[0], e: parseRange(r.during)[1] })).filter((x) => x.e > new Date()).sort((a, b) => a.s - b.s);
  return (
    <div>
      <p className="kicker">Recepción</p><h2>Reservas próximas</h2>
      <div className="grid mt">{rows.map(({ r }) => <ReservationRow key={r.id} r={r} who={whoIs(profiles[r.guest_id])} onChange={reload} />)}
        {data && !rows.length && <Empty>No hay reservas próximas.</Empty>}</div>
    </div>
  );
}

function Spaces() {
  const notify = useNotify();
  const blank = { name: "", kind: "otro", description: "", capacity: "", open_time: "07:00", close_time: "22:00", active: true };
  const [f, setF] = useState(blank);
  const [editing, setEditing] = useState(null);
  const { data: spaces, reload } = useData(() => q(supabase.from("spaces").select("*").order("name")), [], ["spaces"]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function save(e) {
    e.preventDefault();
    const row = { name: f.name, kind: f.kind, description: f.description, capacity: f.capacity ? +f.capacity : null, open_time: f.open_time, close_time: f.close_time, active: f.active };
    const { error } = editing ? await supabase.from("spaces").update(row).eq("id", editing) : await supabase.from("spaces").insert(row);
    if (error) return notify(friendly(error), true);
    notify(editing ? "Espacio actualizado." : "Espacio agregado."); setF(blank); setEditing(null); reload();
  }
  const edit = (s) => { setEditing(s.id); setF({ ...s, capacity: s.capacity ?? "", description: s.description ?? "", open_time: s.open_time.slice(0, 5), close_time: s.close_time.slice(0, 5) }); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div>
      <p className="kicker">Recepción</p><h2>Espacios reservables</h2>
      <form className="card mt grid" onSubmit={save}>
        <h3>{editing ? "Editar espacio" : "Agregar espacio"}</h3>
        <div className="form">
          <Field label="Nombre"><input value={f.name} onChange={set("name")} required /></Field>
          <Field label="Tipo"><select value={f.kind} onChange={set("kind")}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Capacidad"><input type="number" min="1" value={f.capacity} onChange={set("capacity")} /></Field>
          <Field label="Apertura"><input type="time" value={f.open_time} onChange={set("open_time")} required /></Field>
          <Field label="Cierre"><input type="time" value={f.close_time} onChange={set("close_time")} required /></Field>
          <Field label="Descripción"><input value={f.description} onChange={set("description")} /></Field>
          <label className="row"><input type="checkbox" style={{ width: "auto" }} checked={f.active} onChange={set("active")} /> Disponible para reservas</label>
          <div className="row"><button className="btn gold">{editing ? "Guardar cambios" : "Agregar"}</button>{editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setF(blank); }}>Cancelar</button>}</div>
        </div>
      </form>
      <div className="grid g2 mt">
        {spaces?.map((s) => (
          <div key={s.id} className="card"><div className="row sp"><h3>{s.name}</h3><span className={`badge ${s.active ? "s-listo" : "s-cancelado"}`}>{s.active ? "Activo" : "Inactivo"}</span></div>
            <p className="muted sm">{KINDS[s.kind]} · {s.open_time.slice(0, 5)}–{s.close_time.slice(0, 5)}{s.capacity ? ` · ${s.capacity} pers.` : ""}</p>
            <p className="muted sm">{s.description}</p><button className="btn sm ghost mt2" onClick={() => edit(s)}>Editar</button></div>))}
      </div>
    </div>
  );
}

function MenuAdmin({ me }) {
  const notify = useNotify();
  const isRec = me.role === "reception";
  const [dept, setDept] = useState(isRec ? "restaurant" : me.role);
  const blank = { category: "General", name: "", description: "", price: "" };
  const [f, setF] = useState(blank);
  const { data: items, reload } = useData(() => q(supabase.from("menu_items").select("*").eq("department", dept).order("category").order("name")), [dept], ["menu_items"]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function add(e) {
    e.preventDefault();
    const { error } = await supabase.from("menu_items").insert({ ...f, price: +f.price, department: dept });
    if (error) return notify(friendly(error), true);
    setF(blank); reload();
  }
  const toggle = async (i) => { const { error } = await supabase.from("menu_items").update({ active: !i.active }).eq("id", i.id); if (error) notify(friendly(error), true); else reload(); };
  const del = async (i) => { if (!window.confirm(`¿Eliminar «${i.name}»?`)) return; const { error } = await supabase.from("menu_items").delete().eq("id", i.id); if (error) notify(friendly(error), true); else reload(); };

  return (
    <div>
      <p className="kicker">Carta</p><h2>Carta y precios</h2>
      {isRec && <div className="row mt2">{["restaurant", "roomservice"].map((d) => <button key={d} className={"chip" + (dept === d ? " on" : "")} onClick={() => setDept(d)}>{DEPTS[d].name}</button>)}</div>}
      <form className="card mt grid" onSubmit={add}>
        <h3>Agregar artículo</h3>
        <div className="form">
          <Field label="Categoría"><input value={f.category} onChange={set("category")} required /></Field>
          <Field label="Nombre"><input value={f.name} onChange={set("name")} required /></Field>
          <Field label="Descripción"><input value={f.description} onChange={set("description")} /></Field>
          <Field label="Precio"><input type="number" step="0.01" min="0" value={f.price} onChange={set("price")} required /></Field>
          <button className="btn gold">Agregar</button>
        </div>
      </form>
      <div className="card mt">
        {items?.map((i) => (
          <div key={i.id} className="item"><div><b>{i.name}</b> <span className="muted sm">· {i.category}</span><div className="muted sm">{i.description}</div></div>
            <div className="row"><b>{money(i.price)}</b><button className="btn sm ghost" onClick={() => toggle(i)}>{i.active ? "Ocultar" : "Mostrar"}</button><button className="btn sm danger" onClick={() => del(i)}>Eliminar</button></div></div>))}
        {items && !items.length && <Empty>Sin artículos.</Empty>}
      </div>
    </div>
  );
}

function HotelSettings() {
  const notify = useNotify();
  const { settings, reload } = useSettings();
  const [f, setF] = useState(null);
  useEffect(() => {
    setF({ hotel_name: settings.hotel_name || "Hotel Concierge", wifi_name: settings.wifi_name || "", wifi_password: settings.wifi_password || "", welcome_note: settings.welcome_note || "" });
  }, [settings.hotel_name, settings.wifi_name, settings.wifi_password, settings.welcome_note]);
  if (!f) return null;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save(e) {
    e.preventDefault();
    const { error } = await supabase.from("hotel_settings").upsert({ id: 1, ...f, updated_at: new Date().toISOString() });
    if (error) notify(["42P01", "PGRST205"].includes(error.code) ? "Falta ejecutar la migración SQL (Wi‑Fi y correo) en Supabase." : friendly(error), true);
    else { notify("Ajustes guardados."); reload(); }
  }
  return (
    <div>
      <p className="kicker">Recepción</p><h2>Ajustes del hotel</h2>
      <form className="card mt grid" onSubmit={save}>
        <h3>Datos para la tarjeta de bienvenida</h3>
        <div className="form">
          <Field label="Nombre del hotel"><input value={f.hotel_name} onChange={set("hotel_name")} required /></Field>
          <Field label="Red Wi‑Fi"><input value={f.wifi_name} onChange={set("wifi_name")} /></Field>
          <Field label="Clave del Wi‑Fi"><input value={f.wifi_password} onChange={set("wifi_password")} /></Field>
          <Field label="Mensaje de bienvenida (opcional)"><input value={f.welcome_note} onChange={set("welcome_note")} /></Field>
          <button className="btn gold">Guardar</button>
        </div>
        <p className="muted sm">El Wi‑Fi se imprime en la tarjeta, se incluye en el correo y se muestra en el inicio de cada huésped.</p>
      </form>
    </div>
  );
}

function StaffAdmin() {
  const notify = useNotify();
  const blank = { username: "", password: genPass(), full_name: "", role: "restaurant" };
  const [f, setF] = useState(blank);
  const [created, setCreated] = useState(null);
  const { data: staff, reload } = useData(() => q(supabase.from("profiles").select("*").neq("role", "guest").order("role")), [], ["profiles"]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function create(e) {
    e.preventDefault();
    const { error } = await supabase.rpc("create_staff", { p_username: f.username, p_password: f.password, p_full_name: f.full_name, p_role: f.role });
    if (error) return notify(friendly(error), true);
    setCreated({ ...f }); setF({ ...blank, password: genPass() }); reload();
  }
  return (
    <div>
      <p className="kicker">Recepción</p><h2>Personal</h2>
      <form className="card mt grid" onSubmit={create}>
        <h3>Crear usuario de personal</h3>
        <div className="form">
          <Field label="Nombre"><input value={f.full_name} onChange={set("full_name")} required /></Field>
          <Field label="Usuario"><input value={f.username} onChange={set("username")} autoCapitalize="none" required /></Field>
          <Field label="Contraseña"><input value={f.password} onChange={set("password")} minLength={6} required /></Field>
          <Field label="Departamento"><select value={f.role} onChange={set("role")}>{["restaurant", "roomservice", "reception"].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
          <button className="btn gold">Crear</button>
        </div>
      </form>
      {created && <div className="cred mt"><p className="kicker">Usuario creado (se muestra una sola vez)</p>
        <p className="mt2">Usuario: <code>{created.username}</code></p><p>Contraseña: <code>{created.password}</code></p>
        <button className="btn ghost sm mt2" onClick={() => setCreated(null)}>Cerrar</button></div>}
      <div className="card mt scroll"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Departamento</th></tr></thead>
        <tbody>{staff?.map((s) => (<tr key={s.id}><td>{s.full_name}</td><td>{s.username}</td><td>{ROLE_LABEL[s.role]}</td></tr>))}</tbody></table></div>
    </div>
  );
}

function StaffApp({ me }) {
  const isRec = me.role === "reception";
  const items = isRec
    ? [{ id: "inbox", label: "Bandeja", icon: "inbox" }, { id: "guests", label: "Huéspedes", icon: "users" }, { id: "res", label: "Reservas", icon: "calendar" },
       { id: "spaces", label: "Espacios", icon: "grid" }, { id: "menu", label: "Carta", icon: "utensils" }, { id: "staff", label: "Ajustes", icon: "user" }]
    : [{ id: "inbox", label: "Bandeja", icon: "inbox" }, { id: "menu", label: "Carta", icon: "utensils" }];
  const [tab, setTab] = useState("inbox");
  return (
    <>
      <Nav items={items} active={tab} onSelect={setTab} />
      <main className="main">
        {tab === "inbox" && <Inbox me={me} />}
        {tab === "guests" && <Guests />}
        {tab === "res" && <StaffReservations />}
        {tab === "spaces" && <Spaces />}
        {tab === "menu" && <MenuAdmin me={me} />}
        {tab === "staff" && <><HotelSettings /><div className="mt"><StaffAdmin /></div></>}
      </main>
    </>
  );
}

/* ==================================== APP =================================== */

export default function App() {
  const [session, setSession] = useState(undefined);
  const [me, setMe] = useState(undefined);
  const [notice, setNotice] = useState("");
  const [toast, setToast] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [installEvt, setInstallEvt] = useState(null);
  const [isAdmin, setIsAdmin] = useState(isAdminHash());

  const notify = useCallback((msg, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), 3800); }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    const on = () => setOnline(true), off = () => setOnline(false);
    const bip = (e) => { e.preventDefault(); setInstallEvt(e); };
    const hc = () => setIsAdmin(isAdminHash());
    window.addEventListener("hashchange", hc);
    window.addEventListener("online", on); window.addEventListener("offline", off); window.addEventListener("beforeinstallprompt", bip);
    return () => { sub.subscription.unsubscribe(); window.removeEventListener("online", on); window.removeEventListener("offline", off); window.removeEventListener("beforeinstallprompt", bip); window.removeEventListener("hashchange", hc); };
  }, []);

  const uid = session?.user?.id;
  useEffect(() => {
    if (session === undefined) return;
    if (!uid) { setMe(null); return; }
    setMe(undefined);
    supabase.from("profiles").select("*").eq("id", uid).maybeSingle().then(({ data, error }) => {
      if (error) return;
      if (!data) { setNotice("Su acceso ha finalizado. Gracias por su estadía."); supabase.auth.signOut(); } else setMe(data);
    });
  }, [uid, session === undefined]); // eslint-disable-line

  // Tras el checkout el usuario deja de existir: se verifica periódicamente y al volver a la app.
  useEffect(() => {
    if (!uid) return;
    const check = async () => {
      const { error } = await supabase.auth.getUser();
      if (error && [401, 403, 404].includes(error.status)) { setNotice("Su acceso ha finalizado. Gracias por su estadía."); supabase.auth.signOut(); }
    };
    const t = setInterval(check, 60000);
    const vis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [uid]);

  // Dos accesos: "/" para huéspedes y "/#admin" para el personal. Si alguien entra por el que no
  // le corresponde, se corrige la dirección (no se cierra la sesión).
  const wrongRoute = !!me && (me.role !== "guest") !== isAdmin;
  useEffect(() => {
    if (!wrongRoute) return;
    const staff = me.role !== "guest";
    window.history.replaceState(null, "", window.location.pathname + window.location.search + (staff ? "#admin" : ""));
    setIsAdmin(staff);
  }, [wrongRoute]); // eslint-disable-line

  let body;
  if (session === undefined || (uid && me === undefined)) body = <div className="login"><p className="kicker" style={{ color: "#e7d3a8" }}>Cargando…</p></div>;
  else if (!uid || !me) body = <Login notice={notice} admin={isAdmin} />;
  else body = (
    <div className="shell">
      {!online && <div className="banner">Sin conexión · algunas funciones no están disponibles</div>}
      <header className="top">
        <span className="brand">{me.role === "guest" ? "CONCIERGE" : "CONCIERGE · ADMIN"}</span>
        {installEvt && <button className="btn sm gold" onClick={() => { installEvt.prompt(); setInstallEvt(null); }}>Instalar app</button>}
        <div className="who"><b>{me.full_name}</b>{ROLE_LABEL[me.role]}{me.room ? ` · Hab. ${me.room}` : ""}</div>
        <button className="btn sm ghost" style={{ color: "#f3ece0", borderColor: "#ffffff55" }} onClick={() => { setNotice(""); setMe(undefined); supabase.auth.signOut(); }} aria-label="Cerrar sesión"><Icon n="logout" /></button>
      </header>
      {me.role === "guest" ? <GuestApp me={me} /> : <StaffApp me={me} />}
    </div>
  );

  return (
    <Notify.Provider value={notify}>
      <style>{CSS}</style>
      {body}
      {toast && <div className={"toast" + (toast.err ? " bad" : "")} role="status">{toast.msg}</div>}
    </Notify.Provider>
  );
}
