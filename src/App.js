import React, { useState, useEffect, useRef } from "react";
import {
  collection, addDoc, getDocs, doc, updateDoc, setDoc, getDoc, query, where, serverTimestamp, writeBatch, deleteDoc, onSnapshot
} from "firebase/firestore";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { db, auth, googleProvider } from "./firebase";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import toast, { Toaster } from "react-hot-toast";
import "./App.css";

// ─── IMPORTACIÓN DE COMPONENTES EXTERNOS ────────────────
import CamposManager from "./components/CamposManager";
import TarjasManager from "./components/TarjasManager";

const EMPRESAS_MAESTRAS = [
  { id: 0, nombre: "AGRICOLA CONVENTO VIEJO SPA", rut: "79.737.880-1", prefijo: "AAON" },
  { id: 1, nombre: "TORRETAGLE", rut: "76.064.746-2", prefijo: "AAON" }
];

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
  let sum = 0; let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body.charAt(i)) * multiplier;
    multiplier = multiplier < 7 ? multiplier + 1 : 2;
  }
  const expectedDv = 11 - (sum % 11);
  let calculatedDv = expectedDv === 11 ? "0" : expectedDv === 10 ? "K" : expectedDv.toString();
  return dv === calculatedDv;
};

const generateWorkerCode = () => JSON.stringify({ id: uuidv4(), type: "worker" });
const parseDate = (dateStr) => {
  if (!dateStr || !dateStr.includes("-")) return "—";
  const [y, m, d] = dateStr.split("-"); return `${d}/${m}/${y}`;
};

const EMPTY_WORKER_FORM = { rut: "", nombre: "", apellido: "", contratista: "", fechaIngreso: "", estado: "Activo", empresaRut: "" };
const EMPTY_CONTRACTOR_FORM = { rut: "", nombre: "", contacto: "", estado: "Activo", empresaRut: "" };

// ─── Componente QR Canvas (Para Personal) ───────────────
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
    
    const htmlContent = `
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
    `;

    const printFrame = document.createElement("iframe");
    printFrame.style.position = "absolute";
    printFrame.style.width = "0px";
    printFrame.style.height = "0px";
    printFrame.style.border = "none";
    document.body.appendChild(printFrame);
    
    const docFrame = printFrame.contentWindow.document;
    docFrame.open();
    docFrame.write(htmlContent);
    docFrame.close();

    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
      setTimeout(() => document.body.removeChild(printFrame), 1000);
    }, 500);
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

// ─── Administrador de Credenciales (BOLSILLOS POR EMPRESA) ──
function CredentialsManager({ credentialsList, onBulkUpload, onDelete, loading, userEmpresa }) {
  const [bulkText, setBulkText] = useState("");
  const [empresaDestino, setEmpresaDestino] = useState(userEmpresa === "TODAS" ? "" : userEmpresa);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setBulkText(ev.target.result);
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleUpload = () => {
    if (!empresaDestino) { toast.error("Selecciona la empresa dueña de estas credenciales."); return; }
    if (!bulkText.trim()) return;
    const lines = bulkText.split("\n").map(l => l.trim()).filter(l => l !== "");
    const newCredentials = [];

    for (let line of lines) {
      const separatorIndex = line.search(/[,\t]/);
      if (separatorIndex !== -1) {
        let folio = line.substring(0, separatorIndex).trim();
        let codigo = line.substring(separatorIndex + 1).trim();
        folio = folio.replace(/^"|"$/g, '').replace(/""/g, '"');
        codigo = codigo.replace(/^"|"$/g, '').replace(/""/g, '"');

        if (folio && codigo) {
          newCredentials.push({ folio, codigo });
        }
      }
    }

    if (newCredentials.length === 0) {
      toast.error("El formato es incorrecto. Usa 'Folio, Código' por línea.");
      return;
    }

    onBulkUpload(newCredentials, empresaDestino);
    setBulkText("");
  };

  const credsFiltradas = credentialsList.filter(c => c.empresaRut === empresaDestino);
  const disponibles = credsFiltradas.filter(c => c.estado === "Disponible").sort((a, b) => String(a.folio).localeCompare(String(b.folio), undefined, { numeric: true, sensitivity: 'base' }));
  const asignadas = credsFiltradas.filter(c => c.estado === "Asignado");

  return (
    <div className="form-card" style={{ maxWidth: "800px", width: "100%", margin: "0 auto" }}>
      <h3 className="form-title">Carga Masiva de Credenciales (Bolsillos por Empresa)</h3>
      <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "15px" }}>
        Como Agrak maneja las empresas por separado, debes cargar las tarjetas QRs en el "bolsillo" de cada empresa. Así, el código "001" de Torretagle no interfiere con el "001" de Convento Viejo.
      </p>
      
      <div className="form-grid" style={{ background: "#f8fafc", padding: "15px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label>¿A qué empresa le vas a inyectar estos códigos? *</label>
          <select value={empresaDestino} onChange={e => setEmpresaDestino(e.target.value)} style={{ fontWeight: "bold", borderColor: "#16a34a" }}>
            <option value="">Selecciona una empresa...</option>
            {EMPRESAS_MAESTRAS.map(emp => <option key={emp.rut} value={emp.rut}>🏢 {emp.nombre}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: "15px" }}>
        <label className="btn-secondary" style={{ cursor: "pointer", display: "inline-block" }}>
          📁 Seleccionar Archivo (.csv o .txt)
          <input type="file" accept=".csv, .txt" onChange={handleFileUpload} style={{ display: "none" }} />
        </label>
      </div>

      <textarea
        rows={8}
        value={bulkText}
        onChange={(e) => setBulkText(e.target.value)}
        placeholder="Ejemplo:&#10;1001, {&#34;id&#34;:&#34;123&#34;,&#34;type&#34;:&#34;worker&#34;}"
        style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", marginBottom: "15px", fontFamily: "monospace" }}
      />
      <button className="btn-primary" onClick={handleUpload} disabled={loading || !bulkText.trim()}>
        {loading ? "Cargando..." : "📤 Inyectar QRs a la Empresa"}
      </button>

      {empresaDestino && (
        <div style={{ marginTop: "40px", borderTop: "1px solid #e2e8f0", paddingTop: "20px" }}>
          <h4 style={{ marginBottom: "15px", color: "#1e293b" }}>QRs Disponibles en el bolsillo de esta empresa</h4>
          <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
            <div style={{ background: "#eefdf4", color: "#166534", padding: "10px 20px", borderRadius: "8px", fontWeight: "600" }}>Libres: {disponibles.length}</div>
            <div style={{ background: "#f1f5f9", color: "#475569", padding: "10px 20px", borderRadius: "8px", fontWeight: "600" }}>En uso por personal: {asignadas.length}</div>
          </div>

          {disponibles.length > 0 && (
            <div style={{ maxHeight: "300px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
              <table className="workers-table" style={{ margin: 0 }}>
                <thead><tr><th>Folio</th><th>Código QR Interno</th><th>Estado</th><th style={{ width: "80px", textAlign: "center" }}>Acción</th></tr></thead>
                <tbody>
                  {disponibles.map(c => (
                    <tr key={c.id}>
                      <td style={{fontWeight: 'bold', color: '#0f172a'}}>{c.folio}</td>
                      <td className="cell-mono">{c.codigo}</td>
                      <td><span className="badge badge-activo">Disponible</span></td>
                      <td style={{ textAlign: "center" }}><button className="btn-action btn-action-warn" onClick={() => onDelete(c.id)} title="Eliminar código">🗑️</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FORMULARIOS ───
function WorkerForm({ onSave, onCancel, initial, contractorsList, credentialsList, userEmpresa }) {
  const [form, setForm] = useState(initial || EMPTY_WORKER_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleRutChange = (e) => set("rut", formatRut(e.target.value));

  const targetRut = userEmpresa !== "TODAS" ? userEmpresa : form.empresaRut;
  const availableCount = targetRut ? credentialsList.filter(c => c.estado === "Disponible" && c.empresaRut === targetRut).length : 0;

  const handleSubmit = async () => {
    if (!form.rut || !form.nombre || !form.apellido || !form.fechaIngreso) {
      toast.error("Completa RUT, Nombre, Apellido y Fecha de Ingreso.");
      return;
    }
    if (userEmpresa === "TODAS" && !form.empresaRut) {
      toast.error("Debes seleccionar la empresa a la que pertenece el trabajador.");
      return;
    }
    if (!validateRut(form.rut)) {
      toast.error("El RUT ingresado no es válido.");
      return;
    }

    setError(""); setLoading(true);
    try { await onSave(form); } catch (e) { toast.error(e.message); }
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
        
        {userEmpresa === "TODAS" && (
          <div className="form-group">
            <label>Empresa de Destino *</label>
            <select value={form.empresaRut} onChange={(e) => set("empresaRut", e.target.value)}>
              <option value="">Selecciona una empresa...</option>
              {EMPRESAS_MAESTRAS.map(emp => <option key={emp.rut} value={emp.rut}>{emp.nombre}</option>)}
            </select>
          </div>
        )}

        <div className="form-group">
          <label>Contratista (Empresa o Contacto)</label>
          <input list="lista-contratistas" value={form.contratista} onChange={(e) => set("contratista", e.target.value)} placeholder="Escribe el nombre o contacto..." autoComplete="off" />
          <datalist id="lista-contratistas">
            {contractorsList.filter(c => c.estado === "Activo").map((c) => (
              <option key={c.id} value={`${c.nombre}${c.contacto ? ` - Contacto: ${c.contacto}` : ""}`} />
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
            <p style={{ margin: 0, fontSize: "14px", color: "#475569" }}>✅ Este perfil ya tiene su QR guardado. (Si el estado cambia a Inactivo, la credencial se liberará para su empresa).</p>
          ) : (
            <p style={{ margin: 0, fontSize: "14px", color: availableCount > 0 ? "#166534" : "#dc2626" }}>
              {targetRut === "" ? "Selecciona la empresa arriba para ver QRs disponibles." : 
               availableCount > 0 ? `✨ Al guardar, se le asignará automáticamente el siguiente folio disponible (Quedan ${availableCount} en esta empresa).` : 
               `⚠️ Esta empresa no tiene folios disponibles. Se generará un folio VIRTUAL de emergencia.`}
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

function ContractorForm({ onSave, onCancel, initial, userEmpresa }) {
  const [form, setForm] = useState(initial || EMPTY_CONTRACTOR_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleRutChange = (e) => set("rut", formatRut(e.target.value));

  const handleSubmit = async () => {
    if (!form.rut || !form.nombre) { toast.error("Completa RUT y Nombre de Empresa."); return; }
    if (userEmpresa === "TODAS" && !form.empresaRut) { toast.error("Selecciona a qué empresa mandante pertenece este contratista."); return; }
    if (!validateRut(form.rut)) { toast.error("El RUT de la empresa no es válido."); return; }
    setError(""); setLoading(true);
    try { await onSave(form); } catch (e) { toast.error(e.message); }
    setLoading(false);
  };

  return (
    <div className="form-card">
      <h3 className="form-title">{initial ? "Editar Contratista" : "Registrar Contratista"}</h3>
      {error && <div className="alert-error">{error}</div>}
      <div className="form-grid">
        <div className="form-group"><label>RUT Empresa *</label><input value={form.rut} onChange={handleRutChange} placeholder="76.123.456-7" maxLength={12} /></div>
        <div className="form-group"><label>Nombre Empresa *</label><input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej: Constructora Alfa" /></div>
        
        {userEmpresa === "TODAS" && (
          <div className="form-group">
            <label>Empresa Mandante Asociada *</label>
            <select value={form.empresaRut} onChange={(e) => set("empresaRut", e.target.value)}>
              <option value="">Selecciona una empresa...</option>
              {EMPRESAS_MAESTRAS.map(emp => <option key={emp.rut} value={emp.rut}>{emp.nombre}</option>)}
            </select>
          </div>
        )}

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

// ─── MÓDULO DE GESTIÓN DE USUARIOS Y ROLES ──────
function UsersManager({ rolesList, onSaveUser, onDeleteUser }) {
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("Operador");
  const [empresaRut, setEmpresaRut] = useState("TODAS");

  const isEditing = rolesList.some(u => u.id === email.toLowerCase().trim());

  const handleSave = () => {
    if (!email.includes("@")) return toast.error("Ingresa un correo electrónico válido.");
    onSaveUser(email.toLowerCase().trim(), rol, empresaRut);
    setEmail("");
    setRol("Operador");
    setEmpresaRut("TODAS");
  };

  const handleEdit = (usuario) => {
    setEmail(usuario.id);
    setRol(usuario.rol);
    setEmpresaRut(usuario.empresaRut || "TODAS");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div style={{ maxWidth: "800px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
      
      <div className="form-card" style={{ width: "100%", boxSizing: "border-box" }}>
        <h3 className="form-title">{isEditing ? "Actualizar Permisos de Usuario" : "Autorizar Nuevo Usuario"}</h3>
        <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "15px" }}>Segmenta el acceso vinculando el correo de Google a una empresa específica.</p>
        <div className="form-grid" style={{ background: "#f8fafc", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          
          <div className="form-group">
            <label>Correo de Google *</label>
            <input 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="ejemplo@gmail.com" 
              disabled={isEditing} 
              style={isEditing ? { background: "#e2e8f0", cursor: "not-allowed" } : {}}
            />
          </div>
          
          <div className="form-group">
            <label>Rol de Acceso *</label>
            <select value={rol} onChange={e => setRol(e.target.value)} style={{ fontWeight: "bold" }}>
              <option value="Operador">Operador (Solo imprime tarjas)</option>
              <option value="Supervisor">Supervisor (Personal y Tarjas)</option>
              <option value="Admin">Administrador (Acceso Total de la Empresa)</option>
            </select>
          </div>

          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label>Restringir a Empresa *</label>
            <select value={empresaRut} onChange={e => setEmpresaRut(e.target.value)} style={{ fontWeight: "bold", borderColor: "#ef4444" }}>
              <option value="TODAS">🔓 ACCESO GLOBAL (Todas las empresas)</option>
              {EMPRESAS_MAESTRAS.map(emp => (
                <option key={emp.rut} value={emp.rut}>🏢 {emp.nombre}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ gridColumn: "1 / -1", display: "flex", gap: "10px" }}>
            {isEditing && (
              <button className="btn-secondary" onClick={() => { setEmail(""); setRol("Operador"); setEmpresaRut("TODAS"); }} style={{ width: "30%" }}>
                Cancelar
              </button>
            )}
            <button className="btn-primary" onClick={handleSave} style={{ flexGrow: 1 }}>
              {isEditing ? "🔄 Actualizar Permisos" : "➕ Dar Acceso y Segmentar"}
            </button>
          </div>
        </div>
      </div>

      <div className="form-card" style={{ width: "100%", boxSizing: "border-box" }}>
        <h3 className="form-title">Usuarios Autorizados ({rolesList.length})</h3>
        <div className="table-wrap">
          <table className="workers-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Correo Electrónico</th>
                <th>Nivel</th>
                <th>Empresa Asignada</th>
                <th style={{textAlign: "center"}}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rolesList.map(u => {
                const empAsociada = EMPRESAS_MAESTRAS.find(e => e.rut === u.empresaRut);
                return (
                  <tr key={u.id}>
                    <td style={{fontWeight: u.rol === 'Admin' ? 'bold' : 'normal'}}>{u.id}</td>
                    <td><span className={`badge ${u.rol === 'Admin' ? 'badge-activo' : 'badge-inactivo'}`}>{u.rol}</span></td>
                    <td style={{fontSize: "13px", fontWeight: "600", color: u.empresaRut === "TODAS" ? "#dc2626" : "#0f172a"}}>
                      {u.empresaRut === "TODAS" ? "🌍 GLOBAL (Acceso Total)" : empAsociada ? empAsociada.nombre : u.empresaRut}
                    </td>
                    <td style={{textAlign: "center"}}>
                      <button className="btn-action" onClick={() => handleEdit(u)} title="Editar Permisos">✏️</button>
                      <button className="btn-action btn-action-warn" onClick={() => onDeleteUser(u.id)} title="Revocar Acceso">🗑️</button>
                    </td>
                  </tr>
                );
              })}
              {rolesList.length === 0 && (
                <tr><td colSpan="4" style={{textAlign:"center", padding: "20px", color: "#64748b"}}>No hay usuarios registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

// ─── APP PRINCIPAL ───────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [userRole, setUserRole] = useState(null); 
  const [userEmpresa, setUserEmpresa] = useState(null); 
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  
  const [workers, setWorkers] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [camposList, setCamposList] = useState([]); 
  const [rolesList, setRolesList] = useState([]); 
  
  const [loadingData, setLoadingData] = useState(true);
  const [view, setView] = useState("tarjas"); 
  const [editTarget, setEditTarget] = useState(null);
  const [qrWorker, setQrWorker] = useState(null);
  const [logoUrl, setLogoUrl] = useState(localStorage.getItem("logoUrl") || "");
  
  // Estados para los filtros de la tabla
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState("Todos");
  const [filterEmpresaList, setFilterEmpresaList] = useState("TODAS"); // NUEVO FILTRO
  
  const logoInputRef = useRef(null);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); toast.success("Conexión restablecida."); };
    const handleOffline = () => { setIsOnline(false); toast.error("Sin internet. Trabajando offline."); };
    window.addEventListener("online", handleOnline); window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const roleDoc = await getDoc(doc(db, "userRoles", u.email.toLowerCase()));
          if (roleDoc.exists()) {
            const assignedRole = roleDoc.data().rol;
            const assignedEmpresa = roleDoc.data().empresaRut || "TODAS";
            
            setUserRole(assignedRole);
            setUserEmpresa(assignedEmpresa);
            
            if (assignedRole === "Operador") setView("tarjas");
            else setView("workers_list");
          } else {
            setUserRole("Desconocido"); 
            setUserEmpresa(null);
          }
        } catch (error) {
          console.error("Acceso al rol denegado:", error);
          setUserRole("Desconocido");
          setUserEmpresa(null);
        }
      } else {
        setUserRole(null);
        setUserEmpresa(null);
      }
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user || userRole === "Desconocido" || userRole === null || userEmpresa === null) return;
    setLoadingData(true);

    const unsubs = [];
    const handleError = (error) => {
      console.warn("Filtro de seguridad actuando:", error.message);
      if (error.code === "permission-denied") setUserRole("Desconocido");
    };

    let qcampos = collection(db, "campos");
    let qworkers = collection(db, "workers");
    let qcontractors = collection(db, "contractors");
    let qcred = collection(db, "credentials");

    if (userEmpresa !== "TODAS") {
      qcampos = query(qcampos, where("empresaRut", "==", userEmpresa));
      qworkers = query(qworkers, where("empresaRut", "==", userEmpresa));
      qcontractors = query(qcontractors, where("empresaRut", "==", userEmpresa));
      qcred = query(qcred, where("empresaRut", "==", userEmpresa));
    }

    unsubs.push(onSnapshot(qcampos, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a,b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
      setCamposList(docs.filter(i => !i.eliminado));
    }, handleError));

    if (userRole === "Admin" || userRole === "Supervisor") {
      unsubs.push(onSnapshot(qworkers, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a,b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
        setWorkers(docs);
      }, handleError));
      unsubs.push(onSnapshot(qcontractors, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a,b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
        setContractors(docs);
      }, handleError));
      
      unsubs.push(onSnapshot(qcred, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => !i.eliminado);
        docs.sort((a,b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
        setCredentials(docs);
      }, handleError));
    }

    if (userRole === "Admin") {
      const qroles = query(collection(db, "userRoles"));
      unsubs.push(onSnapshot(qroles, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a,b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
        setRolesList(docs);
      }, handleError));
    }

    setLoadingData(false);
    return () => unsubs.forEach(unsub => unsub());
  }, [user, userRole, userEmpresa]);

  const handleLogin = async () => { try { await signInWithPopup(auth, googleProvider); } catch (e) { toast.error("Error al ingresar"); } };
  const handleLogout = async () => { await signOut(auth); setView("tarjas"); setUserRole(null); setUserEmpresa(null); };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { localStorage.setItem("logoUrl", ev.target.result); setLogoUrl(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const handleBulkUploadCredentials = async (credsArray, targetEmpresa) => {
    setLoadingData(true);
    try {
      const batch = writeBatch(db);
      credsArray.forEach(cred => {
        const docRef = doc(collection(db, "credentials"));
        batch.set(docRef, { folio: cred.folio, codigo: cred.codigo, empresaRut: targetEmpresa, estado: "Disponible", asignadoA: null, creadoEn: serverTimestamp(), eliminado: false });
      });
      await batch.commit();
      toast.success("Credenciales inyectadas al bolsillo de la empresa");
    } catch (error) { toast.error("Error al cargar códigos: " + error.message); }
    setLoadingData(false);
  };

  const handleDeleteCredential = async (id) => {
    if (!window.confirm("¿Seguro que deseas borrar esta credencial?")) return;
    setLoadingData(true);
    try {
      await updateDoc(doc(db, "credentials", id), { eliminado: true, eliminadoEn: serverTimestamp() });
      toast.success("Credencial eliminada");
    } catch (e) {
      toast.error("Error al eliminar: " + e.message);
    }
    setLoadingData(false);
  };

  const handleSaveUserRole = async (emailToSave, rolToSave, empresaRutToSave) => {
    try { 
      await setDoc(doc(db, "userRoles", emailToSave), { rol: rolToSave, empresaRut: empresaRutToSave, creadoEn: serverTimestamp() }); 
      toast.success(`Acceso guardado para ${emailToSave}`); 
    } catch (e) { toast.error("Error al guardar usuario"); }
  };

  const handleDeleteUserRole = async (emailToDelete) => {
    if (emailToDelete === user.email.toLowerCase()) return toast.error("No puedes revocar tu propio acceso.");
    if(!window.confirm(`¿Quitar el acceso a ${emailToDelete}?`)) return;
    await deleteDoc(doc(db, "userRoles", emailToDelete)); toast.success("Acceso revocado");
  };

  const handleSaveCampo = async (data, id) => {
    setLoadingData(true);
    const finalData = { ...data, empresaRut: userEmpresa !== "TODAS" ? userEmpresa : data.empresaRut };
    try {
      if (id) { await updateDoc(doc(db, "campos", id), { ...finalData, actualizadoEn: serverTimestamp() }); toast.success("Centro actualizado"); } 
      else { await addDoc(collection(db, "campos"), { ...finalData, creadoEn: serverTimestamp() }); toast.success("Centro registrado"); }
    } catch (error) { toast.error("Error al guardar: " + error.message); }
    setLoadingData(false);
  };

  const handleDeleteCampo = async (id) => {
    if (!window.confirm("¿Seguro que deseas ocultar este Centro de Costo?")) return;
    setLoadingData(true); try { await updateDoc(doc(db, "campos", id), { eliminado: true, eliminadoEn: serverTimestamp() }); toast.success("Centro ocultado"); } catch (e) { toast.error("Error: " + e.message); } setLoadingData(false);
  };

  const handleSaveWorker = async (form) => {
    const q = query(collection(db, "workers"), where("rut", "==", form.rut));
    const snap = await getDocs(q);
    if (!editTarget && !snap.empty) throw new Error("RUT ya registrado.");
    
    let finalForm = { ...form, empresaRut: userEmpresa !== "TODAS" ? userEmpresa : form.empresaRut };
    const targetRut = finalForm.empresaRut;
    
    if (!editTarget) {
      const availableCredentials = credentials.filter(c => c.estado === "Disponible" && c.empresaRut === targetRut).sort((a, b) => String(a.folio).localeCompare(String(b.folio), undefined, { numeric: true, sensitivity: 'base' }));
      if (availableCredentials.length > 0) {
        const nextCred = availableCredentials[0]; finalForm.codigoQR = nextCred.codigo; finalForm.folioQR = nextCred.folio;
        await updateDoc(doc(db, "credentials", nextCred.id), { estado: "Asignado", asignadoA: form.rut, actualizadoEn: serverTimestamp() });
      } else { finalForm.codigoQR = generateWorkerCode(); finalForm.folioQR = "V-AUTO-" + Math.floor(Math.random() * 10000); }
      await addDoc(collection(db, "workers"), { ...finalForm, creadoEn: serverTimestamp() }); toast.success("Trabajador registrado");
    } else {
      if (form.estado === "Inactivo" && editTarget.codigoQR) {
        const credDoc = credentials.find(c => c.codigo === editTarget.codigoQR && c.empresaRut === targetRut);
        if (credDoc) { await updateDoc(doc(db, "credentials", credDoc.id), { estado: "Disponible", asignadoA: null, actualizadoEn: serverTimestamp() }); } 
        else { await addDoc(collection(db, "credentials"), { folio: editTarget.folioQR || "RECICLADO-" + Math.floor(Math.random() * 1000), codigo: editTarget.codigoQR, empresaRut: targetRut, estado: "Disponible", asignadoA: null, creadoEn: serverTimestamp(), eliminado: false }); }
        finalForm.codigoQR = null; finalForm.folioQR = null;
      } else if (form.estado === "Activo" && editTarget.estado === "Inactivo" && !editTarget.codigoQR) {
        const today = new Date(); finalForm.fechaIngreso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const availableCredentials = credentials.filter(c => c.estado === "Disponible" && c.empresaRut === targetRut).sort((a, b) => String(a.folio).localeCompare(String(b.folio), undefined, { numeric: true, sensitivity: 'base' }));
        if (availableCredentials.length > 0) {
          const nextCred = availableCredentials[0]; finalForm.codigoQR = nextCred.codigo; finalForm.folioQR = nextCred.folio;
          await updateDoc(doc(db, "credentials", nextCred.id), { estado: "Asignado", asignadoA: form.rut, actualizadoEn: serverTimestamp() });
        } else { finalForm.codigoQR = generateWorkerCode(); finalForm.folioQR = "V-AUTO-" + Math.floor(Math.random() * 10000); }
      }
      await updateDoc(doc(db, "workers", editTarget.id), { ...finalForm, actualizadoEn: serverTimestamp() }); toast.success("Ficha actualizada");
    }
    setView("workers_list"); setEditTarget(null);
  };

  const handleSaveContractor = async (form) => {
    let finalForm = { ...form, empresaRut: userEmpresa !== "TODAS" ? userEmpresa : form.empresaRut };
    if (editTarget) { await updateDoc(doc(db, "contractors", editTarget.id), { ...finalForm, actualizadoEn: serverTimestamp() }); toast.success("Contratista actualizado"); } 
    else { await addDoc(collection(db, "contractors"), { ...finalForm, creadoEn: serverTimestamp() }); toast.success("Contratista registrado"); }
    setView("contractors_list"); setEditTarget(null);
  };

  const handleToggleEstado = async (item, collectionName) => {
    const nuevoEstado = item.estado === "Activo" ? "Inactivo" : "Activo";
    
    if (collectionName === "workers") {
      const targetRut = item.empresaRut || userEmpresa;
      if (nuevoEstado === "Activo") {
        if (!window.confirm(`¿Seguro que deseas Reactivar a ${item.nombre}? Su fecha de ingreso se actualizará a hoy.`)) return;
        const today = new Date(); const fechaHoy = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        let updates = { estado: nuevoEstado, fechaIngreso: fechaHoy, actualizadoEn: serverTimestamp() };
        if (!item.codigoQR) {
          const availableCredentials = credentials.filter(c => c.estado === "Disponible" && c.empresaRut === targetRut).sort((a, b) => String(a.folio).localeCompare(String(b.folio), undefined, { numeric: true, sensitivity: 'base' }));
          if (availableCredentials.length > 0) {
            const nextCred = availableCredentials[0]; updates.codigoQR = nextCred.codigo; updates.folioQR = nextCred.folio;
            await updateDoc(doc(db, "credentials", nextCred.id), { estado: "Asignado", asignadoA: item.rut, actualizadoEn: serverTimestamp() });
          } else { updates.codigoQR = generateWorkerCode(); updates.folioQR = "V-AUTO-" + Math.floor(Math.random() * 10000); }
        }
        await updateDoc(doc(db, collectionName, item.id), updates);
      } else {
        if (!window.confirm(`¿Seguro que deseas Desactivar a ${item.nombre}? Su credencial quedará libre para su empresa.`)) return;
        if (item.codigoQR) {
          const credDoc = credentials.find(c => c.codigo === item.codigoQR && c.empresaRut === targetRut);
          if (credDoc) { await updateDoc(doc(db, "credentials", credDoc.id), { estado: "Disponible", asignadoA: null, actualizadoEn: serverTimestamp() }); } 
          else { await addDoc(collection(db, "credentials"), { folio: item.folioQR || "RECICLADO-" + Math.floor(Math.random() * 1000), codigo: item.codigoQR, empresaRut: targetRut, estado: "Disponible", asignadoA: null, creadoEn: serverTimestamp(), eliminado: false }); }
        }
        await updateDoc(doc(db, collectionName, item.id), { estado: nuevoEstado, codigoQR: null, folioQR: null, actualizadoEn: serverTimestamp() });
      }
    } else {
      await updateDoc(doc(db, collectionName, item.id), { estado: nuevoEstado, actualizadoEn: serverTimestamp() });
    }
    toast.success("Estado actualizado");
  };

  const isWorkerView = view.includes("workers");
  const listToFilter = isWorkerView ? workers : contractors;
  const filteredList = listToFilter.filter((item) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || item.nombre?.toLowerCase().includes(q) || item.rut?.toLowerCase().includes(q) || item.apellido?.toLowerCase().includes(q) || item.contratista?.toLowerCase().includes(q) || item.folioQR?.toLowerCase().includes(q); 
    const matchesEstado = filterEstado === "Todos" || item.estado === filterEstado;
    const matchesEmpresa = filterEmpresaList === "TODAS" || item.empresaRut === filterEmpresaList; // 🔥 FILTRO APLICADO
    return matchesSearch && matchesEstado && matchesEmpresa;
  });

  if (authLoading || (user && userRole === null)) return <div className="splash"><div className="splash-spinner" /></div>;
  if (!user) return (
    <div className="login-screen">
      <Toaster position="top-center" />
      <div className="login-card">
        <img src="/logo.png" alt="Logo Corporativo" className="login-logo" />
        <h1 className="login-title">Control de Campo</h1>
        <p className="login-sub">Control de trazabilidad, personal y cosecha</p>
        <button className="btn-google" onClick={handleLogin}>Ingresar con Google</button>
      </div>
    </div>
  );
  if (userRole === "Desconocido") return (
    <div className="login-screen">
      <div className="login-card" style={{ borderTop: "4px solid #ef4444" }}>
        <h1 className="login-title" style={{color: "#ef4444"}}>Acceso Denegado</h1>
        <p className="login-sub">El correo <b>{user.email}</b> no está autorizado en el sistema.</p>
        <button className="btn-secondary" onClick={handleLogout} style={{marginTop: "20px"}}>Cerrar Sesión</button>
      </div>
    </div>
  );

  const empresasDisponiblesPanel = userEmpresa === "TODAS" ? EMPRESAS_MAESTRAS : EMPRESAS_MAESTRAS.filter(e => e.rut === userEmpresa);

  return (
    <div className="app-layout">
      <Toaster position="top-center" />
      <TopBar user={user} userRole={userRole} onLogout={handleLogout} isOnline={isOnline} />

      <main className="main-content" style={{ padding: "20px" }}>
        
        <div className="view-tabs" style={{ display: "flex", gap: "10px", marginBottom: "25px", borderBottom: "2px solid #e2e8f0", paddingBottom: "12px", flexWrap: "wrap" }}>
          {(userRole === "Admin" || userRole === "Supervisor") && (
            <>
              <button onClick={() => { setView("workers_list"); setSearch(""); setEditTarget(null); }} style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view.includes("workers") ? "#101c38" : "#f1f5f9", color: view.includes("workers") ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}>👥 Personal</button>
              <button onClick={() => { setView("contractors_list"); setSearch(""); setEditTarget(null); }} style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view.includes("contractors") ? "#101c38" : "#f1f5f9", color: view.includes("contractors") ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}>🏢 Contratistas</button>
            </>
          )}

          <button onClick={() => { setView("tarjas"); setSearch(""); setEditTarget(null); }} style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view === "tarjas" ? "#16a34a" : "#f1f5f9", color: view === "tarjas" ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}>🏷️ Tarjas de Cosecha</button>
          
          {userRole === "Admin" && (
            <>
              <button onClick={() => { setView("campos"); setSearch(""); setEditTarget(null); }} style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view === "campos" ? "#b45309" : "#f1f5f9", color: view === "campos" ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}>📍 Campos y C. Costo</button>
              {userEmpresa === "TODAS" && <button onClick={() => { setView("credentials_list"); setSearch(""); setEditTarget(null); }} style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view === "credentials_list" ? "#101c38" : "#f1f5f9", color: view === "credentials_list" ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}>🪪 Gestión Credenciales</button>}
              <button onClick={() => { setView("users"); setSearch(""); setEditTarget(null); }} style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view === "users" ? "#ef4444" : "#f1f5f9", color: view === "users" ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}>🛡️ Usuarios</button>
            </>
          )}
        </div>

        {view === "workers_form" && <WorkerForm onSave={handleSaveWorker} onCancel={() => setView("workers_list")} initial={editTarget} contractorsList={contractors} credentialsList={credentials} userEmpresa={userEmpresa} />}
        {view === "contractors_form" && <ContractorForm onSave={handleSaveContractor} onCancel={() => setView("contractors_list")} initial={editTarget} userEmpresa={userEmpresa} />}
        {view === "tarjas" && <TarjasManager camposList={camposList} empresasMaestras={empresasDisponiblesPanel} />}
        {view === "campos" && userRole === "Admin" && <CamposManager camposList={camposList} onSave={handleSaveCampo} onDelete={handleDeleteCampo} loading={loadingData} empresasMaestras={empresasDisponiblesPanel} userEmpresa={userEmpresa} />}
        {view === "users" && userRole === "Admin" && <UsersManager rolesList={rolesList} onSaveUser={handleSaveUserRole} onDeleteUser={handleDeleteUserRole} />}
        {view === "credentials_list" && userRole === "Admin" && userEmpresa === "TODAS" && <CredentialsManager credentialsList={credentials} onBulkUpload={handleBulkUploadCredentials} onDelete={handleDeleteCredential} loading={loadingData} userEmpresa={userEmpresa} />}

        {(view === "workers_list" || view === "contractors_list") && (userRole === "Admin" || userRole === "Supervisor") && (
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
              <input className="search-input" placeholder={isWorkerView ? "Buscar trabajador..." : "Buscar contratista..."} value={search} onChange={(e) => setSearch(e.target.value)} />
              
              {/* 🔥 NUEVO FILTRO POR EMPRESA (Solo para el Súper Admin) 🔥 */}
              {userEmpresa === "TODAS" && (
                <select className="filter-select" value={filterEmpresaList} onChange={(e) => setFilterEmpresaList(e.target.value)}>
                  <option value="TODAS">Todas las Empresas</option>
                  {EMPRESAS_MAESTRAS.map(emp => <option key={emp.rut} value={emp.rut}>{emp.nombre.replace("AGRICOLA ", "")}</option>)}
                </select>
              )}

              <select className="filter-select" value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)}>
                <option value="Todos">Todos los Estados</option><option value="Activo">Activos</option><option value="Inactivo">Inactivos</option>
              </select>
              <button className="btn-primary" onClick={() => { setEditTarget(null); setView(isWorkerView ? "workers_form" : "contractors_form"); }}>+ Nuevo {isWorkerView ? "Trabajador" : "Contratista"}</button>
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
                      {/* 🔥 NUEVA COLUMNA DE EMPRESA 🔥 */}
                      {userEmpresa === "TODAS" && <th>Empresa</th>}
                      {isWorkerView ? <th>Contratista</th> : <th>Contacto</th>}
                      {isWorkerView && <th>Folio Credencial</th>}
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.map((item) => {
                      const empAsociada = EMPRESAS_MAESTRAS.find(e => e.rut === item.empresaRut);
                      return (
                      <tr key={item.id}>
                        <td className="cell-mono">{formatRut(item.rut)}</td>
                        <td className="cell-name">{item.nombre} {isWorkerView ? item.apellido : ""}</td>
                        
                        {/* Renderizado del nombre de la empresa para el Super Admin */}
                        {userEmpresa === "TODAS" && (
                          <td style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>
                            {empAsociada ? empAsociada.nombre.replace("AGRICOLA ", "") : "—"}
                          </td>
                        )}

                        <td>{isWorkerView ? (item.contratista || "—") : (item.contacto || "—")}</td>
                        
                        {isWorkerView && (
                          <td className="cell-mono" style={{color: "#64748b", fontWeight: "600"}}>
                            {item.estado === "Inactivo" ? "—" : (item.folioQR || "—")}
                          </td>
                        )}

                        <td><span className={`badge ${item.estado === "Activo" ? "badge-activo" : "badge-inactivo"}`}>{item.estado}</span></td>
                        <td className="cell-actions">
                          
                          {isWorkerView && item.codigoQR && item.estado === "Activo" && (
                            <button className="btn-action" title="Ver QR" onClick={() => setQrWorker(item)}>QR</button>
                          )}

                          <button className="btn-action" title="Editar" onClick={() => { setEditTarget(item); setView(isWorkerView ? "workers_form" : "contractors_form"); }}>✏️</button>
                          <button className={`btn-action ${item.estado === "Activo" ? "btn-action-warn" : "btn-action-ok"}`} onClick={() => handleToggleEstado(item, isWorkerView ? "workers" : "contractors")}>
                            {item.estado === "Activo" ? "🔴" : "🟢"}
                          </button>
                        </td>
                      </tr>
                    )})}
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

function TopBar({ user, userRole, onLogout, isOnline }) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <img src="/logo.png" alt="Logo Corporativo" className="topbar-logo" />
        <span className="topbar-title">Control de Campo</span>
      </div>
      <div className="topbar-user">
        {!isOnline && <span style={{ background: "#ef4444", color: "white", padding: "4px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: "bold", marginRight: "12px" }}>📵 OFFLINE</span>}
        <span style={{color: "#8ba2c4", fontSize: "11px", fontWeight: "bold", marginRight: "10px", textTransform: "uppercase"}}>{userRole}</span>
        <img src={user.photoURL} alt={user.displayName} className="user-avatar" />
        <span className="user-name">{user.displayName}</span>
        <button className="btn-logout" onClick={onLogout}>Salir</button>
      </div>
    </header>
  );
}