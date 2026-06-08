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
  writeBatch,
  deleteDoc
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
  if (!value) return "";
  const clean = value.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted}-${dv}`;
};

const validateRut = (rut) => {
  if (!rut) return false;
  const cleanRut = rut.replace(/[^0-9kK]/g, "").toUpperCase();
  if (cleanRut.length < 2) return false;
  const body = cleanRut.slice(0, -1);
  const dv = cleanRut.slice(-1);
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body.charAt(i)) * multiplier;
    multiplier = multiplier < 7 ? multiplier + 1 : 2;
  }
  const expectedDv = 11 - (sum % 11);
  let calculatedDv = expectedDv === 11 ? "0" : expectedDv === 10 ? "K" : expectedDv.toString();
  return dv === calculatedDv;
};

const generateWorkerCode = () => {
  const id = uuidv4();
  return JSON.stringify({ id, type: "worker" });
};

const parseDate = (dateStr) => {
  if (!dateStr || !dateStr.includes("-")) return "—";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
};

const EMPTY_WORKER_FORM = {
  rut: "", nombre: "", apellido: "", contratista: "", fechaIngreso: "", estado: "Activo",
};

const EMPTY_CONTRACTOR_FORM = {
  rut: "", nombre: "", contacto: "", estado: "Activo",
};

// ─── Componente QR Canvas ───────────────────────────────
function QRCard({ worker, logoUrl, onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!worker?.codigoQR) return;
    QRCode.toCanvas(canvasRef.current, worker.codigoQR, {
      width: 200, margin: 2, color: { dark: "#1a1a2e", light: "#ffffff" },
    });
  }, [worker]);

  const handlePrint = () => {
    if (!canvasRef.current) return;
    const qrImageUrl = canvasRef.current.toDataURL("image/png");
    const win = window.open("", "_blank", "width=600,height=700");
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Credencial – ${worker.nombre} ${worker.apellido}</title>
          <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Space+Mono:wght@700&display=swap" rel="stylesheet">
          <style>
            @media print {
              * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
              body { margin: 0; }
              @page { margin: 0.5cm; }
            }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #fff; display: flex; justify-content: center; align-items: flex-start; padding: 20px; min-height: 100vh; font-family: 'DM Sans', sans-serif; }
            .card { background: #fff; border-radius: 12px; width: 340px; overflow: hidden; border: 1px solid #e2e8f0; }
            .header { background: #101c38; padding: 30px 20px 20px; text-align: center; } 
            .logo-area { margin-bottom: 15px; min-height: 50px; display: flex; align-items: center; justify-content: center; }
            .logo-area img { max-height: 50px; max-width: 140px; object-fit: contain; }
            .company-name { color: #8ba2c4; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600; }
            .body { padding: 24px; text-align: center; }
            .name { font-size: 22px; font-weight: 600; color: #1a1a2e; margin-bottom: 4px; text-align: left;}
            .rut { font-family: 'Space Mono', monospace; font-size: 14px; color: #888; margin-bottom: 20px; text-align: left; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; text-align: left; }
            .meta-item { background: #f8fafc; border-radius: 8px; padding: 12px; }
            .meta-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; font-weight: 600;}
            .meta-value { font-size: 14px; font-weight: 500; color: #0f172a; }
            .qr-section { text-align: center; display: flex; flex-direction: column; align-items: center; }
            .qr-section img { border-radius: 8px; margin-bottom: 6px; width: 200px; height: 200px; }
            .folio-text { font-family: 'Space Mono', monospace; font-size: 12px; color: #64748b; margin-bottom: 12px; font-weight: 700; letter-spacing: 1px; }
            .badge { display: inline-block; padding: 6px 20px; border-radius: 20px; font-size: 13px; font-weight: 600; }
            .badge-activo { background: #eefdf4; color: #22c55e; border: 1px solid #bbf7d0;}
            .badge-inactivo { background: #fef2f2; color: #ef4444; border: 1px solid #fecaca;}
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <div class="logo-area">
                ${logoUrl ? `<img src="${logoUrl}" alt="Logo" />` : `<span style="color:white">LOGO EMPRESA</span>`}
              </div>
              <div class="company-name">Credencial de personal</div>
            </div>
            <div class="body">
              <div class="name">${worker.nombre} ${worker.apellido}</div>
              <div class="rut">${formatRut(worker.rut)}</div>
              <div class="meta">
                <div class="meta-item"><div class="meta-label">Contratista</div><div class="meta-value">${worker.contratista || "—"}</div></div>
                <div class="meta-item"><div class="meta-label">Ingreso</div><div class="meta-value">${parseDate(worker.fechaIngreso)}</div></div>
              </div>
              <div class="qr-section">
                <img src="${qrImageUrl}" alt="Código QR" />
                <div class="folio-text">FOLIO: ${worker.folioQR || "S/F"}</div>
                <div class="badge ${worker.estado === "Activo" ? "badge-activo" : "badge-inactivo"}">${worker.estado}</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 250);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>Credencial QR</h2><button className="btn-icon" onClick={onClose}>✕</button></div>
        <div className="card-preview" style={{border: '1px solid #e2e8f0'}}>
          <div className="card-header-stripe" style={{background: '#101c38'}}>
            <div className="card-logo-area">
              {logoUrl ? <img src={logoUrl} alt="Logo" className="card-logo-img" /> : <span className="card-logo-placeholder" style={{color: 'white'}}>LOGO EMPRESA</span>}
            </div>
            <p className="card-company-label" style={{color: '#8ba2c4'}}>Credencial de Personal</p>
          </div>
          <div className="card-body">
            <div className="card-name" style={{textAlign:'left'}}>{worker.nombre} {worker.apellido}</div>
            <div className="card-rut" style={{textAlign:'left', color: '#888', marginBottom:'16px'}}>{formatRut(worker.rut)}</div>
            <div className="card-meta-grid">
              <div className="card-meta-item"><div className="card-meta-label">Contratista</div><div className="card-meta-value">{worker.contratista || "—"}</div></div>
              <div className="card-meta-item"><div className="card-meta-label">Ingreso</div><div className="card-meta-value">{parseDate(worker.fechaIngreso)}</div></div>
            </div>
            <div className="card-qr-section">
              <canvas ref={canvasRef} style={{marginBottom: "4px"}} />
              <div style={{fontFamily: "'Space Mono', monospace", fontSize: "11px", color: "#64748b", fontWeight: "700", marginBottom: "12px", letterSpacing: "1px"}}>
                FOLIO: {worker.folioQR || "S/F"}
              </div>
              <span className={`card-badge badge ${worker.estado === "Activo" ? "badge-activo" : "badge-inactivo"}`}>{worker.estado}</span>
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

// ─── Administrador de Credenciales (Carga Masiva) ───────
function CredentialsManager({ credentialsList, onBulkUpload, onDelete, loading }) {
  const [bulkText, setBulkText] = useState("");

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setBulkText(ev.target.result);
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleUpload = () => {
    if (!bulkText.trim()) return;
    const lines = bulkText.split("\n").map(l => l.trim()).filter(l => l !== "");
    const newCredentials = [];

    for (let line of lines) {
      const separatorIndex = line.search(/[,\t]/);
      if (separatorIndex !== -1) {
        let folio = line.substring(0, separatorIndex).trim();
        let codigo = line.substring(separatorIndex + 1).trim();

        folio = folio.replace(/^"|"$/g, '');
        codigo = codigo.replace(/^"|"$/g, '');
        folio = folio.replace(/""/g, '"');
        codigo = codigo.replace(/""/g, '"');

        if (folio && codigo) {
          newCredentials.push({ folio, codigo });
        }
      }
    }

    if (newCredentials.length === 0) {
      alert("El formato es incorrecto. Asegúrate de usar 'Folio, Código' en cada línea.");
      return;
    }

    onBulkUpload(newCredentials);
    setBulkText("");
  };

  const disponibles = credentialsList
    .filter(c => c.estado === "Disponible")
    .sort((a, b) => String(a.folio).localeCompare(String(b.folio), undefined, { numeric: true, sensitivity: 'base' }));
    
  const asignadas = credentialsList.filter(c => c.estado === "Asignado");

  return (
    <div className="form-card" style={{ maxWidth: "800px", margin: "0 auto" }}>
      <h3 className="form-title">Carga Masiva de Credenciales (Folio y Código)</h3>
      <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "15px" }}>
        Puedes cargar un archivo (.csv o .txt) o pegar tu lista separada por comas. Estas tarjetas quedarán "Disponibles" para asignar automáticamente a los nuevos trabajadores.
      </p>
      
      <div style={{ marginBottom: "15px" }}>
        <label className="btn-secondary" style={{ cursor: "pointer", display: "inline-block" }}>
          📁 Seleccionar Archivo
          <input type="file" accept=".csv, .txt" onChange={handleFileUpload} style={{ display: "none" }} />
        </label>
      </div>

      <textarea
        rows={8}
        value={bulkText}
        onChange={(e) => setBulkText(e.target.value)}
        placeholder="Ejemplo:&#10;1001, {&#34;id&#34;:&#34;123&#34;,&#34;type&#34;:&#34;worker&#34;}&#10;1002, 987654321"
        style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", marginBottom: "15px", fontFamily: "monospace" }}
      />
      <button className="btn-primary" onClick={handleUpload} disabled={loading || !bulkText.trim()}>
        {loading ? "Cargando..." : "📤 Subir Credenciales a la Nube"}
      </button>

      <div style={{ marginTop: "40px", borderTop: "1px solid #e2e8f0", paddingTop: "20px" }}>
        <h4 style={{ marginBottom: "15px", color: "#1e293b" }}>Resumen de Credenciales en Sistema</h4>
        <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
          <div style={{ background: "#eefdf4", color: "#166534", padding: "10px 20px", borderRadius: "8px", fontWeight: "600" }}>
            Disponibles: {disponibles.length}
          </div>
          <div style={{ background: "#f1f5f9", color: "#475569", padding: "10px 20px", borderRadius: "8px", fontWeight: "600" }}>
            Asignadas a personal: {asignadas.length}
          </div>
        </div>

        {disponibles.length > 0 && (
          <div style={{ maxHeight: "300px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
            <table className="workers-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Código QR Interno</th>
                  <th>Estado</th>
                  <th style={{ width: "80px", textAlign: "center" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {disponibles.map(c => (
                  <tr key={c.id}>
                    <td style={{fontWeight: 'bold', color: '#0f172a'}}>{c.folio}</td>
                    <td className="cell-mono">{c.codigo}</td>
                    <td><span className="badge badge-activo">Disponible</span></td>
                    <td style={{ textAlign: "center" }}>
                      <button className="btn-action btn-action-warn" onClick={() => onDelete(c.id)} title="Eliminar código">🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Formulario de Trabajador ───────────────────────────
function WorkerForm({ onSave, onCancel, initial, contractorsList, credentialsList }) {
  const [form, setForm] = useState(initial || EMPTY_WORKER_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleRutChange = (e) => set("rut", formatRut(e.target.value));

  const availableCount = credentialsList?.filter(c => c.estado === "Disponible").length || 0;

  const handleSubmit = async () => {
    if (!form.rut || !form.nombre || !form.apellido || !form.fechaIngreso) {
      setError("Completa los campos obligatorios: RUT, Nombre, Apellido y Fecha de Ingreso.");
      return;
    }
    if (!validateRut(form.rut)) {
      setError("El RUT ingresado no es válido. Verifica que esté correcto.");
      return;
    }

    setError(""); setLoading(true);
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
        <div className="form-group"><label>RUT *</label><input value={form.rut} onChange={handleRutChange} placeholder="12.345.678-9" maxLength={12} /></div>
        <div className="form-group"><label>Nombre *</label><input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Nombre" /></div>
        <div className="form-group"><label>Apellido *</label><input value={form.apellido} onChange={(e) => set("apellido", e.target.value)} placeholder="Apellido" /></div>
        
        <div className="form-group">
          <label>Contratista</label>
          <input 
            list="lista-contratistas" 
            value={form.contratista} 
            onChange={(e) => set("contratista", e.target.value)} 
            placeholder="Escribe para buscar..."
            autoComplete="off"
          />
          <datalist id="lista-contratistas">
            {contractorsList.filter(c => c.estado === "Activo").map((c) => (
              <option key={c.id} value={c.nombre} />
            ))}
          </datalist>
        </div>

        <div className="form-group"><label>Fecha de Ingreso *</label><input type="date" value={form.fechaIngreso} onChange={(e) => set("fechaIngreso", e.target.value)} /></div>
        <div className="form-group"><label>Estado</label><select value={form.estado} onChange={(e) => set("estado", e.target.value)}><option value="Activo">Activo</option><option value="Inactivo">Inactivo</option></select></div>
        
        <div className="form-group" style={{ gridColumn: "1 / -1", background: "#f8fafc", padding: "15px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <label style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a", marginBottom: "8px", display: "block" }}>
            🪪 Credencial Virtual (Asignación Automática)
          </label>
          
          {initial ? (
            <p style={{ margin: 0, fontSize: "14px", color: "#475569" }}>
              ✅ Este trabajador ya tiene asignado un Folio y QR. (Si cambias el estado a Inactivo desde la tabla, la credencial se liberará automáticamente).
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: "14px", color: availableCount > 0 ? "#166534" : "#dc2626" }}>
              {availableCount > 0 
                ? `✨ Al guardar, se le asignará automáticamente el siguiente folio disponible (Quedan ${availableCount}).` 
                : `⚠️ No quedan folios precargados. El sistema generará un folio VIRTUAL de emergencia.`}
            </p>
          )}
        </div>

      </div>
      <div className="form-actions">
        <button className="btn-secondary" onClick={onCancel} disabled={loading}>Cancelar</button>
        <button className="btn-primary" onClick={handleSubmit} disabled={loading}>{loading ? "Guardando…" : initial ? "Actualizar" : "Registrar y Asignar QR"}</button>
      </div>
    </div>
  );
}

// ─── Formulario de Contratista ──────────────────────────
function ContractorForm({ onSave, onCancel, initial }) {
  const [form, setForm] = useState(initial || EMPTY_CONTRACTOR_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleRutChange = (e) => set("rut", formatRut(e.target.value));

  const handleSubmit = async () => {
    if (!form.rut || !form.nombre) {
      setError("Completa los campos obligatorios: RUT y Nombre de Empresa.");
      return;
    }
    if (!validateRut(form.rut)) {
      setError("El RUT de la empresa no es válido. Verifica que esté correcto.");
      return;
    }
    setError(""); setLoading(true);
    try { await onSave(form); } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="form-card">
      <h3 className="form-title">{initial ? "Editar Contratista" : "Registrar Contratista"}</h3>
      {error && <div className="alert-error">{error}</div>}
      <div className="form-grid">
        <div className="form-group"><label>RUT Empresa *</label><input value={form.rut} onChange={handleRutChange} placeholder="76.123.456-7" maxLength={12} /></div>
        <div className="form-group"><label>Nombre Empresa *</label><input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej: Constructora Alfa" /></div>
        <div className="form-group"><label>Contacto (Opcional)</label><input value={form.contacto} onChange={(e) => set("contacto", e.target.value)} placeholder="Nombre o Teléfono" /></div>
        <div className="form-group"><label>Estado</label><select value={form.estado} onChange={(e) => set("estado", e.target.value)}><option value="Activo">Activo</option><option value="Inactivo">Inactivo</option></select></div>
      </div>
      <div className="form-actions">
        <button className="btn-secondary" onClick={onCancel} disabled={loading}>Cancelar</button>
        <button className="btn-primary" onClick={handleSubmit} disabled={loading}>{loading ? "Guardando…" : "Registrar Contratista"}</button>
      </div>
    </div>
  );
}

// ─── App Principal ───────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [workers, setWorkers] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [view, setView] = useState("workers_list"); 
  const [editTarget, setEditTarget] = useState(null);
  const [qrWorker, setQrWorker] = useState(null);
  const [logoUrl, setLogoUrl] = useState(localStorage.getItem("logoUrl") || "");
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState("Todos");
  const logoInputRef = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
    return unsub;
  }, []);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const qw = query(collection(db, "workers"), orderBy("creadoEn", "desc"));
      const qc = query(collection(db, "contractors"), orderBy("creadoEn", "desc"));
      const qcred = query(collection(db, "credentials"), orderBy("creadoEn", "desc"));

      const [snapW, snapC, snapCred] = await Promise.all([getDocs(qw), getDocs(qc), getDocs(qcred)]);
      
      setWorkers(snapW.docs.map(d => ({ id: d.id, ...d.data() })));
      setContractors(snapC.docs.map(d => ({ id: d.id, ...d.data() })));
      setCredentials(snapCred.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
    setLoadingData(false);
  }, []);

  useEffect(() => { if (user) loadData(); }, [user, loadData]);

  const handleLogin = async () => { try { await signInWithPopup(auth, googleProvider); } catch (e) { alert("Error: " + e.message); } };
  const handleLogout = async () => { await signOut(auth); setWorkers([]); setContractors([]); setCredentials([]); setView("workers_list"); };
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { localStorage.setItem("logoUrl", ev.target.result); setLogoUrl(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const handleBulkUploadCredentials = async (credsArray) => {
    setLoadingData(true);
    try {
      const batch = writeBatch(db);
      credsArray.forEach(cred => {
        const docRef = doc(collection(db, "credentials"));
        batch.set(docRef, { folio: cred.folio, codigo: cred.codigo, estado: "Disponible", asignadoA: null, creadoEn: serverTimestamp() });
      });
      await batch.commit();
      await loadData();
    } catch (error) {
      alert("Error al cargar códigos: " + error.message);
    }
    setLoadingData(false);
  };

  const handleDeleteCredential = async (id) => {
    if (!window.confirm("¿Seguro que deseas borrar esta credencial?")) return;
    setLoadingData(true);
    await deleteDoc(doc(db, "credentials", id));
    await loadData();
    setLoadingData(false);
  };

  const handleSaveWorker = async (form) => {
    const q = query(collection(db, "workers"), where("rut", "==", form.rut));
    const snap = await getDocs(q);
    if (!editTarget && !snap.empty) throw new Error("El RUT ya está registrado.");
    if (editTarget && snap.docs.find(doc => doc.id !== editTarget.id)) throw new Error("El RUT pertenece a otro trabajador.");

    if (!editTarget) {
      const availableCredentials = credentials
        .filter(c => c.estado === "Disponible")
        .sort((a, b) => String(a.folio).localeCompare(String(b.folio), undefined, { numeric: true, sensitivity: 'base' }));

      let codigoQR, folioQR;

      if (availableCredentials.length > 0) {
        const nextCred = availableCredentials[0];
        codigoQR = nextCred.codigo;
        folioQR = nextCred.folio;
        await updateDoc(doc(db, "credentials", nextCred.id), { 
          estado: "Asignado", 
          asignadoA: form.rut, 
          actualizadoEn: serverTimestamp() 
        });
      } else {
        codigoQR = generateWorkerCode();
        folioQR = "V-AUTO-" + Math.floor(Math.random() * 10000);
      }

      await addDoc(collection(db, "workers"), { 
        ...form, 
        codigoQR, 
        folioQR, 
        creadoEn: serverTimestamp(), 
        actualizadoEn: serverTimestamp() 
      });

    } else {
      await updateDoc(doc(db, "workers", editTarget.id), { 
        ...form, 
        actualizadoEn: serverTimestamp() 
      });
    }

    await loadData(); 
    setView("workers_list"); 
    setEditTarget(null);
  };

  const handleSaveContractor = async (form) => {
    const q = query(collection(db, "contractors"), where("rut", "==", form.rut));
    const snap = await getDocs(q);
    if (!editTarget && !snap.empty) throw new Error("La empresa con este RUT ya existe.");
    if (editTarget && snap.docs.find(doc => doc.id !== editTarget.id)) throw new Error("El RUT pertenece a otra empresa.");

    if (editTarget) {
      await updateDoc(doc(db, "contractors", editTarget.id), { ...form, actualizadoEn: serverTimestamp() });
    } else {
      await addDoc(collection(db, "contractors"), { ...form, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
    }
    await loadData(); setView("contractors_list"); setEditTarget(null);
  };

  // ── LÓGICA DE BOTÓN DE ESTADO UNIFICADO CON ASIGNACIÓN/LIBERACIÓN ──
  const handleToggleEstado = async (item, collectionName) => {
    const nuevoEstado = item.estado === "Activo" ? "Inactivo" : "Activo";
    
    setLoadingData(true);
    try {
      if (collectionName === "workers") {
        
        // ACCIÓN: REACTIVAR TRABAJADOR
        if (nuevoEstado === "Activo") {
          if (!window.confirm(`¿Seguro que deseas Reactivar a ${item.nombre}? Su fecha de ingreso se actualizará a hoy y se le asignará una nueva credencial si no tiene una.`)) {
            setLoadingData(false);
            return;
          }

          const today = new Date();
          const fechaHoy = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          
          let updates = { estado: nuevoEstado, fechaIngreso: fechaHoy, actualizadoEn: serverTimestamp() };

          // Le asignamos credencial solo si no tiene una
          if (!item.codigoQR) {
            const availableCredentials = credentials
              .filter(c => c.estado === "Disponible")
              .sort((a, b) => String(a.folio).localeCompare(String(b.folio), undefined, { numeric: true, sensitivity: 'base' }));

            if (availableCredentials.length > 0) {
              const nextCred = availableCredentials[0];
              updates.codigoQR = nextCred.codigo;
              updates.folioQR = nextCred.folio;
              
              await updateDoc(doc(db, "credentials", nextCred.id), { 
                estado: "Asignado", asignadoA: item.rut, actualizadoEn: serverTimestamp() 
              });
            } else {
              updates.codigoQR = generateWorkerCode();
              updates.folioQR = "V-AUTO-" + Math.floor(Math.random() * 10000);
            }
          }
          
          await updateDoc(doc(db, collectionName, item.id), updates);

        } 
        // ACCIÓN: DESACTIVAR TRABAJADOR (LIBERA CREDENCIAL)
        else {
          if (!window.confirm(`¿Seguro que deseas Desactivar a ${item.nombre}? Su credencial (Folio: ${item.folioQR || "N/A"}) quedará libre automáticamente para otro uso.`)) {
            setLoadingData(false);
            return;
          }

          if (item.codigoQR) {
            const credDoc = credentials.find(c => c.codigo === item.codigoQR);
            if (credDoc) {
              await updateDoc(doc(db, "credentials", credDoc.id), { 
                estado: "Disponible", asignadoA: null, actualizadoEn: serverTimestamp() 
              });
            } else {
              // Si no existía en el listado, la guardamos para que se pueda reutilizar
              await addDoc(collection(db, "credentials"), { 
                folio: item.folioQR || "RECICLADO-" + Math.floor(Math.random() * 1000), 
                codigo: item.codigoQR, 
                estado: "Disponible", 
                asignadoA: null, 
                creadoEn: serverTimestamp() 
              });
            }
          }

          await updateDoc(doc(db, collectionName, item.id), { 
            estado: nuevoEstado, 
            codigoQR: null, 
            folioQR: null, 
            actualizadoEn: serverTimestamp() 
          });
        }

      } else {
        // Comportamiento normal para contratistas
        await updateDoc(doc(db, collectionName, item.id), { 
          estado: nuevoEstado, 
          actualizadoEn: serverTimestamp() 
        });
      }
    } catch (e) {
      alert("Hubo un error al cambiar el estado: " + e.message);
    }

    await loadData();
    setLoadingData(false);
  };

  const isWorkerView = view.includes("workers");
  const listToFilter = isWorkerView ? workers : contractors;
  
  const filteredList = listToFilter.filter((item) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || 
      item.nombre?.toLowerCase().includes(q) || 
      item.rut?.toLowerCase().includes(q) || 
      item.apellido?.toLowerCase().includes(q) || 
      item.contratista?.toLowerCase().includes(q) ||
      item.folioQR?.toLowerCase().includes(q); 
    const matchesEstado = filterEstado === "Todos" || item.estado === filterEstado;
    return matchesSearch && matchesEstado;
  });

  if (authLoading) return <div className="splash"><div className="splash-spinner" /></div>;

  if (!user) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-icon">👷</div><h1 className="login-title">Registro de Personal</h1><p className="login-sub">Sistema de control y credenciales</p>
          <button className="btn-google" onClick={handleLogin}>Ingresar con Google</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <TopBar user={user} onLogout={handleLogout} />

      <main className="main-content" style={{ padding: "20px" }}>
        
        <div className="view-tabs" style={{ display: "flex", gap: "10px", marginBottom: "25px", borderBottom: "2px solid #e2e8f0", paddingBottom: "12px", flexWrap: "wrap" }}>
          <button 
            onClick={() => { setView("workers_list"); setSearch(""); setEditTarget(null); }} 
            style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view.includes("workers") ? "#101c38" : "#f1f5f9", color: view.includes("workers") ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}
          >
            👥 Personal / Trabajadores
          </button>
          <button 
            onClick={() => { setView("contractors_list"); setSearch(""); setEditTarget(null); }} 
            style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view.includes("contractors") ? "#101c38" : "#f1f5f9", color: view.includes("contractors") ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}
          >
            🏢 Empresas Contratistas
          </button>
          <button 
            onClick={() => { setView("credentials_list"); setSearch(""); setEditTarget(null); }} 
            style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view === "credentials_list" ? "#101c38" : "#f1f5f9", color: view === "credentials_list" ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}
          >
            🪪 Gestión de Credenciales
          </button>
        </div>

        {view === "workers_form" && <WorkerForm onSave={handleSaveWorker} onCancel={() => { setView("workers_list"); setEditTarget(null); }} initial={editTarget} contractorsList={contractors} credentialsList={credentials} />}
        {view === "contractors_form" && <ContractorForm onSave={handleSaveContractor} onCancel={() => { setView("contractors_list"); setEditTarget(null); }} initial={editTarget} />}
        {view === "credentials_list" && <CredentialsManager credentialsList={credentials} onBulkUpload={handleBulkUploadCredentials} onDelete={handleDeleteCredential} loading={loadingData} />}

        {(view === "workers_list" || view === "contractors_list") && (
          <>
            <div className="stats-row">
              <div className="stat-card"><div className="stat-label">Total {isWorkerView ? "Trabajadores" : "Empresas"}</div><div className="stat-num">{listToFilter.length}</div></div>
              <div className="stat-card stat-activo"><div className="stat-label">Activos</div><div className="stat-num">{listToFilter.filter(w => w.estado === "Activo").length}</div></div>
              <div className="stat-card stat-inactivo"><div className="stat-label">Inactivos</div><div className="stat-num">{listToFilter.filter(w => w.estado === "Inactivo").length}</div></div>
              <div className="stat-card stat-logo" onClick={() => logoInputRef.current.click()} title="Cambiar logo">
                {logoUrl ? <img src={logoUrl} alt="Logo empresa" className="stat-logo-img" /> : <span className="stat-logo-placeholder">📷 Logo</span>}
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
              </div>
            </div>

            <div className="toolbar">
              <input className="search-input" placeholder={isWorkerView ? "Buscar trabajador por nombre, RUT, folio..." : "Buscar contratista por empresa, RUT..."} value={search} onChange={(e) => setSearch(e.target.value)} />
              <select className="filter-select" value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)}>
                <option value="Todos">Todos</option><option value="Activo">Activos</option><option value="Inactivo">Inactivos</option>
              </select>

              <button className="btn-primary" onClick={() => { setEditTarget(null); setView(isWorkerView ? "workers_form" : "contractors_form"); }}>
                + Nuevo {isWorkerView ? "Trabajador" : "Contratista"}
              </button>
            </div>

            {loadingData ? (
              <div className="loading-wrap"><div className="splash-spinner" /></div>
            ) : filteredList.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">🔍</div><p>No se encontraron resultados.</p></div>
            ) : (
              <div className="table-wrap">
                <table className="workers-table">
                  <thead>
                    <tr>
                      <th>RUT</th>
                      <th>Nombre</th>
                      {isWorkerView ? <th>Contratista</th> : <th>Contacto</th>}
                      {isWorkerView && <th>Folio Credencial</th>}
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.map((item) => (
                      <tr key={item.id}>
                        <td className="cell-mono">{formatRut(item.rut)}</td>
                        <td className="cell-name">{item.nombre} {isWorkerView ? item.apellido : ""}</td>
                        <td>{isWorkerView ? (item.contratista || "—") : (item.contacto || "—")}</td>
                        {isWorkerView && <td className="cell-mono" style={{color: "#64748b", fontWeight: "600"}}>{item.folioQR || "—"}</td>}
                        <td><span className={`badge ${item.estado === "Activo" ? "badge-activo" : "badge-inactivo"}`}>{item.estado}</span></td>
                        <td className="cell-actions">
                          {isWorkerView && item.codigoQR && (
                            <button className="btn-action" title="Ver QR" onClick={() => setQrWorker(item)}>QR</button>
                          )}
                          <button className="btn-action" title="Editar" onClick={() => { setEditTarget(item); setView(isWorkerView ? "workers_form" : "contractors_form"); }}>✏️</button>
                          <button className={`btn-action ${item.estado === "Activo" ? "btn-action-warn" : "btn-action-ok"}`} onClick={() => handleToggleEstado(item, isWorkerView ? "workers" : "contractors")}>
                            {item.estado === "Activo" ? "🔴" : "🟢"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>

      {qrWorker && <QRCard worker={qrWorker} logoUrl={logoUrl} onClose={() => setQrWorker(null)} />}
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