import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { db, auth, googleProvider } from "./firebase";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import "./App.css";

// ─── Helpers ────────────────────────────────────────────
const formatRut = (value) => {
  const clean = value.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted}-${dv}`;
};

const generateWorkerCode = () => {
  const id = uuidv4();
  return JSON.stringify({ id, type: "worker" });
};

const parseDate = (dateStr) => {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
};

const EMPTY_FORM = {
  rut: "",
  nombre: "",
  apellido: "",
  contratista: "",
  fechaIngreso: "",
  estado: "Activo",
};

// ─── Componente QR Canvas ───────────────────────────────
function QRCard({ worker, logoUrl, onClose }) {
  const canvasRef = useRef(null);
  const printRef = useRef(null);

  useEffect(() => {
    if (!worker?.codigoQR) return;
    QRCode.toCanvas(canvasRef.current, worker.codigoQR, {
      width: 200,
      margin: 2,
      color: { dark: "#1a1a2e", light: "#ffffff" },
    });
  }, [worker]);

  const handlePrint = () => {
    const printContent = printRef.current.innerHTML;
    const win = window.open("", "_blank", "width=600,height=700");
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Credencial – ${worker.nombre} ${worker.apellido}</title>
          <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Space+Mono:wght@700&display=swap" rel="stylesheet">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #f0f2f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: 'DM Sans', sans-serif; }
            .card { background: #fff; border-radius: 16px; width: 320px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.15); }
            .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 24px 20px 20px; text-align: center; }
            .logo-area { margin-bottom: 12px; min-height: 50px; display: flex; align-items: center; justify-content: center; }
            .logo-area img { max-height: 50px; max-width: 140px; object-fit: contain; }
            .company-name { color: #e0e0e0; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; font-weight: 500; }
            .body { padding: 20px; }
            .name { font-size: 20px; font-weight: 600; color: #1a1a2e; margin-bottom: 2px; }
            .rut { font-family: 'Space Mono', monospace; font-size: 13px; color: #666; margin-bottom: 16px; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
            .meta-item { background: #f8f9ff; border-radius: 8px; padding: 10px 12px; }
            .meta-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
            .meta-value { font-size: 13px; font-weight: 500; color: #1a1a2e; }
            .qr-section { text-align: center; border-top: 1px solid #f0f0f0; padding-top: 16px; }
            .qr-section canvas { border-radius: 8px; }
            .badge { display: inline-block; margin-top: 10px; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; }
            .badge-activo { background: #e8f5e9; color: #2e7d32; }
            .badge-inactivo { background: #fce4ec; color: #c62828; }
          </style>
        </head>
        <body>${printContent}</body>
      </html>
    `);
    win.document.close();
    win.onload = () => { win.print(); };
  };

  const estadoBadge = worker.estado === "Activo" ? "badge-activo" : "badge-inactivo";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Credencial QR</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div ref={printRef}>
          <div className="card-preview">
            <div className="card-header-stripe">
              <div className="card-logo-area">
                {logoUrl
                  ? <img src={logoUrl} alt="Logo" className="card-logo-img" />
                  : <span className="card-logo-placeholder">TU EMPRESA</span>
                }
              </div>
              <p className="card-company-label">Credencial de Personal</p>
            </div>
            <div className="card-body">
              <div className="card-name">{worker.nombre} {worker.apellido}</div>
              <div className="card-rut">{worker.rut}</div>
              <div className="card-meta-grid">
                <div className="card-meta-item">
                  <div className="card-meta-label">Contratista</div>
                  <div className="card-meta-value">{worker.contratista || "—"}</div>
                </div>
                <div className="card-meta-item">
                  <div className="card-meta-label">Ingreso</div>
                  <div className="card-meta-value">{parseDate(worker.fechaIngreso)}</div>
                </div>
              </div>
              <div className="card-qr-section">
                <canvas ref={canvasRef} />
                <span className={`card-badge ${estadoBadge}`}>{worker.estado}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
          <button className="btn-primary" onClick={handlePrint}>🖨️ Imprimir</button>
        </div>
      </div>
    </div>
  );
}

// ─── Formulario ─────────────────────────────────────────
function WorkerForm({ onSave, onCancel, initial }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleRut = (e) => {
    const raw = e.target.value.replace(/[^0-9kK.\-]/g, "");
    set("rut", raw);
  };

  const handleSubmit = async () => {
    if (!form.rut || !form.nombre || !form.apellido || !form.fechaIngreso) {
      setError("Completa los campos obligatorios: RUT, Nombre, Apellido y Fecha de Ingreso.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onSave(form);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="form-card">
      <h3 className="form-title">{initial ? "Editar Trabajador" : "Registrar Trabajador"}</h3>
      {error && <div className="alert-error">{error}</div>}
      <div className="form-grid">
        <div className="form-group">
          <label>RUT *</label>
          <input
            value={form.rut}
            onChange={handleRut}
            placeholder="12.345.678-9"
            maxLength={12}
          />
        </div>
        <div className="form-group">
          <label>Nombre *</label>
          <input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Nombre" />
        </div>
        <div className="form-group">
          <label>Apellido *</label>
          <input value={form.apellido} onChange={(e) => set("apellido", e.target.value)} placeholder="Apellido" />
        </div>
        <div className="form-group">
          <label>Contratista</label>
          <input value={form.contratista} onChange={(e) => set("contratista", e.target.value)} placeholder="Nombre del contratista" />
        </div>
        <div className="form-group">
          <label>Fecha de Ingreso *</label>
          <input type="date" value={form.fechaIngreso} onChange={(e) => set("fechaIngreso", e.target.value)} />
        </div>
        <div className="form-group">
          <label>Estado</label>
          <select value={form.estado} onChange={(e) => set("estado", e.target.value)}>
            <option value="Activo">Activo</option>
            <option value="Inactivo">Inactivo</option>
          </select>
        </div>
      </div>
      <div className="form-actions">
        <button className="btn-secondary" onClick={onCancel} disabled={loading}>Cancelar</button>
        <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
          {loading ? "Guardando…" : initial ? "Actualizar" : "Registrar y Generar QR"}
        </button>
      </div>
    </div>
  );
}

// ─── App Principal ───────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("list"); // list | add | edit
  const [editTarget, setEditTarget] = useState(null);
  const [qrWorker, setQrWorker] = useState(null);
  const [logoUrl, setLogoUrl] = useState(localStorage.getItem("logoUrl") || "");
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState("Todos");
  const logoInputRef = useRef(null);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Cargar trabajadores
  const loadWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "workers"), orderBy("creadoEn", "desc"));
      const snap = await getDocs(q);
      setWorkers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) loadWorkers();
  }, [user, loadWorkers]);

  // Login Google
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      alert("Error al iniciar sesión: " + e.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setWorkers([]);
    setView("list");
  };

  // Logo
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      localStorage.setItem("logoUrl", ev.target.result);
      setLogoUrl(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  // Guardar trabajador
  const handleSave = async (form) => {
    // Verificar RUT duplicado (solo en creación)
    if (!editTarget) {
      const q = query(collection(db, "workers"), where("rut", "==", form.rut));
      const snap = await getDocs(q);
      if (!snap.empty) throw new Error("El RUT ya está registrado en el sistema.");
    }

    const codigoQR = editTarget?.codigoQR || generateWorkerCode();

    if (editTarget) {
      await updateDoc(doc(db, "workers", editTarget.id), {
        ...form,
        actualizadoEn: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, "workers"), {
        ...form,
        codigoQR,
        creadoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      });
    }

    await loadWorkers();
    setView("list");
    setEditTarget(null);
  };

  const handleEdit = (worker) => {
    setEditTarget(worker);
    setView("edit");
  };

  const handleToggleEstado = async (worker) => {
    const nuevoEstado = worker.estado === "Activo" ? "Inactivo" : "Activo";
    await updateDoc(doc(db, "workers", worker.id), { estado: nuevoEstado });
    await loadWorkers();
  };

  // Filtros
  const filtered = workers.filter((w) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      w.nombre?.toLowerCase().includes(q) ||
      w.apellido?.toLowerCase().includes(q) ||
      w.rut?.toLowerCase().includes(q) ||
      w.contratista?.toLowerCase().includes(q);
    const matchEstado = filterEstado === "Todos" || w.estado === filterEstado;
    return matchSearch && matchEstado;
  });

  const totales = {
    total: workers.length,
    activos: workers.filter((w) => w.estado === "Activo").length,
    inactivos: workers.filter((w) => w.estado === "Inactivo").length,
  };

  // ── Pantalla de carga ──
  if (authLoading) {
    return (
      <div className="splash">
        <div className="splash-spinner" />
      </div>
    );
  }

  // ── Login ──
  if (!user) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-icon">👷</div>
          <h1 className="login-title">Registro de Personal</h1>
          <p className="login-sub">Sistema de control y credenciales QR</p>
          <button className="btn-google" onClick={handleLogin}>
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
              <path d="M47.5 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h13.2c-.6 3-2.3 5.5-4.8 7.2v6h7.7c4.5-4.2 7.4-10.3 7.4-17.4z" fill="#4285F4"/>
              <path d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-9.9H2.5v6.2C6.5 42.7 14.7 48 24 48z" fill="#34A853"/>
              <path d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6V13.2H2.5C.9 16.3 0 19.9 0 24s.9 7.7 2.5 10.8l8-6.2z" fill="#FBBC05"/>
              <path d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.8 2.4 30.4 0 24 0 14.7 0 6.5 5.3 2.5 13.2l8 6.2c1.9-5.7 7.2-9.9 13.5-9.9z" fill="#EA4335"/>
            </svg>
            Ingresar con Google
          </button>
        </div>
      </div>
    );
  }

  // ── Formulario ──
  if (view === "add" || view === "edit") {
    return (
      <div className="app-layout">
        <TopBar user={user} onLogout={handleLogout} />
        <main className="main-content">
          <WorkerForm
            onSave={handleSave}
            onCancel={() => { setView("list"); setEditTarget(null); }}
            initial={editTarget}
          />
        </main>
      </div>
    );
  }

  // ── Lista principal ──
  return (
    <div className="app-layout">
      <TopBar user={user} onLogout={handleLogout} />

      <main className="main-content">
        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Total</div>
            <div className="stat-num">{totales.total}</div>
          </div>
          <div className="stat-card stat-activo">
            <div className="stat-label">Activos</div>
            <div className="stat-num">{totales.activos}</div>
          </div>
          <div className="stat-card stat-inactivo">
            <div className="stat-label">Inactivos</div>
            <div className="stat-num">{totales.inactivos}</div>
          </div>
          <div className="stat-card stat-logo" onClick={() => logoInputRef.current.click()} title="Cambiar logo">
            {logoUrl
              ? <img src={logoUrl} alt="Logo empresa" className="stat-logo-img" />
              : <span className="stat-logo-placeholder">📷 Logo empresa</span>
            }
            <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
          </div>
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          <div className="search-wrap">
            <input
              className="search-input"
              placeholder="Buscar por nombre, RUT o contratista…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="filter-select" value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)}>
            <option value="Todos">Todos</option>
            <option value="Activo">Activos</option>
            <option value="Inactivo">Inactivos</option>
          </select>
          <button className="btn-primary" onClick={() => setView("add")}>+ Nuevo trabajador</button>
        </div>

        {/* Tabla */}
        {loading ? (
          <div className="loading-wrap"><div className="splash-spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <p>{workers.length === 0 ? "No hay trabajadores registrados aún." : "No se encontraron resultados."}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="workers-table">
              <thead>
                <tr>
                  <th>RUT</th>
                  <th>Nombre</th>
                  <th>Contratista</th>
                  <th>Ingreso</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => (
                  <tr key={w.id}>
                    <td className="cell-mono">{w.rut}</td>
                    <td className="cell-name">{w.nombre} {w.apellido}</td>
                    <td>{w.contratista || "—"}</td>
                    <td>{parseDate(w.fechaIngreso)}</td>
                    <td>
                      <span className={`badge ${w.estado === "Activo" ? "badge-activo" : "badge-inactivo"}`}>
                        {w.estado}
                      </span>
                    </td>
                    <td className="cell-actions">
                      <button className="btn-action" title="Ver QR" onClick={() => setQrWorker(w)}>QR</button>
                      <button className="btn-action" title="Editar" onClick={() => handleEdit(w)}>✏️</button>
                      <button
                        className={`btn-action ${w.estado === "Activo" ? "btn-action-warn" : "btn-action-ok"}`}
                        title={w.estado === "Activo" ? "Desactivar" : "Activar"}
                        onClick={() => handleToggleEstado(w)}
                      >
                        {w.estado === "Activo" ? "🔴" : "🟢"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {qrWorker && (
        <QRCard worker={qrWorker} logoUrl={logoUrl} onClose={() => setQrWorker(null)} />
      )}
    </div>
  );
}

function TopBar({ user, onLogout }) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-icon">👷</span>
        <span className="topbar-title">Registro de Personal</span>
      </div>
      <div className="topbar-user">
        <img src={user.photoURL} alt={user.displayName} className="user-avatar" />
        <span className="user-name">{user.displayName}</span>
        <button className="btn-logout" onClick={onLogout}>Salir</button>
      </div>
    </header>
  );
}
