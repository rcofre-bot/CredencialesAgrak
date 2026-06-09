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

// ─── MÓDULO: Tarjas de Cosecha (Zebra ZT230 - 100x70mm) ─
const EMPRESAS_TARJAS = [
  { id: 0, nombre: "AGRICOLA CONVENTO VIEJO SPA", rut: "76.843.510-2", fundo: "FUNDO CONVENTO VIEJO" },
  { id: 1, nombre: "OTRA AGRICOLA EJEMPLO SPA", rut: "77.123.456-9", fundo: "FUNDO LOS NOGALES" }
];

function TarjasManager() {
  const [empresaIdx, setEmpresaIdx] = useState(0);
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [cuartel, setCuartel] = useState("");
  const [corte, setCorte] = useState("");
  const [cantidad, setCantidad] = useState(10);
  
  const [historial, setHistorial] = useState([]);
  const [inicio, setInicio] = useState(1);
  const [ultimoCodigo, setUltimoCodigo] = useState("Cargando...");
  
  const [tarjas, setTarjas] = useState([]);
  const [procesando, setProcesando] = useState(false);
  const prefijo = "AAON"; 

  const empresaActiva = EMPRESAS_TARJAS[empresaIdx];

  const cargarHistorial = useCallback(async () => {
    try {
      const q = query(collection(db, "tarjas_history"), orderBy("creadoEn", "desc"));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setHistorial(docs);

      let maxFin = 0;
      docs.forEach(d => {
        if (d.fin && d.fin > maxFin) maxFin = d.fin;
      });
      
      setInicio(maxFin + 1);
      
      if (maxFin > 0) {
        setUltimoCodigo(`bin;${prefijo}${String(maxFin).padStart(4, '0')}`);
      } else {
        setUltimoCodigo("Ninguno");
      }
      
    } catch (e) {
      console.error("Error al cargar historial de tarjas:", e);
      setUltimoCodigo("Error al cargar");
    }
  }, []);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  const generarPrevisualizacion = async () => {
    if (!cuartel || !corte) {
      alert("Por favor, ingresa el Cuartel y el Corte antes de previsualizar.");
      return;
    }
    const nuevasTarjas = [];
    const [y, m, d] = fecha.split("-");
    const fechaStr = `${d}-${m}-${y}`;

    for (let i = 0; i < cantidad; i++) {
      const numActual = inicio + i;
      const numStr = String(numActual).padStart(4, '0');
      const codigoQRData = `bin;${prefijo}${numStr}`;
      
      // Código QR limpio para Zebra
      const qrDataUrl = await QRCode.toDataURL(codigoQRData, {
        width: 300, margin: 0, color: { dark: "#000000", light: "#ffffff" }
      });

      nuevasTarjas.push({ codigo: codigoQRData, qrUrl: qrDataUrl, fechaStr, cuartel, corte });
    }
    setTarjas(nuevasTarjas);
  };

  const registrarEImprimirZebra = async () => {
    if (tarjas.length === 0) {
      alert("Primero debes previsualizar el lote generado.");
      return;
    }

    setProcesando(true);
    const numFin = inicio + parseInt(cantidad) - 1;

    // 1. Guardar historial
    try {
      await addDoc(collection(db, "tarjas_history"), {
        empresa: empresaActiva.nombre,
        fundo: empresaActiva.fundo,
        fechaCosecha: fecha,
        cuartel: cuartel.toUpperCase(),
        corte: corte.toUpperCase(),
        prefijo: prefijo,
        inicio: inicio,
        cantidad: parseInt(cantidad),
        fin: numFin,
        creadoEn: serverTimestamp()
      });
    } catch(e) {
      console.error("Error al guardar historial de tarjas", e);
      alert("Hubo un error al guardar el registro en la nube.");
      setProcesando(false);
      return;
    }

    // 2. Construir ventana de impresión ZEBRA STRICT
    const win = window.open("", "_blank");
    let html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Impresión Zebra</title>
          <style>
            /* Reset absoluto */
            * { box-sizing: border-box; margin: 0; padding: 0; }
            
            /* Configuramos el tamaño del papel exacto para que el navegador no adivine */
            @page { size: 100mm 70mm; margin: 0; padding: 0; }
            
            body { 
              font-family: 'Arial', sans-serif; 
              background: #fff; 
              color: #000; 
            }

            @media print {
              html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; }
              .label { 
                width: 100vw !important; 
                height: 100vh !important;
                border: none !important; 
                margin: 0 !important; 
                page-break-after: always; 
                page-break-inside: avoid; 
              }
            }

            /* Etiqueta base ampliada al máximo */
            .label { 
              width: 100mm; 
              height: 70mm; 
              padding: 3mm 4mm; /* Margen de seguridad interno muy pequeño */
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              overflow: hidden; 
              background: #fff;
              border: 1px dashed #ccc; 
            }
            
            .header { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; border-bottom: 3px solid #000; padding-bottom: 2px; margin-bottom: 2px;}
            .sub-header { display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; border-bottom: 3px solid #000; padding-bottom: 2px; }
            
            /* El cuerpo central donde vive el QR y el Código */
            .body { display: flex; align-items: center; justify-content: space-between; flex-grow: 1; padding: 2mm 0;}
            
            /* Hacemos el QR inmenso (50x50 milímetros) */
            .qr-container { width: 50mm; height: 50mm; display: flex; align-items: center; justify-content: flex-start; }
            .qr-img { width: 100%; height: 100%; object-fit: contain; }
            
            /* Código a la derecha */
            .text-container { display: flex; align-items: center; justify-content: flex-end; width: 42mm; }
            .text-code { font-size: 32px; font-weight: 900; letter-spacing: -1px; text-align: right; word-break: break-all; line-height: 1.1;}
            
            .footer { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; border-top: 3px solid #000; padding-top: 2px; margin-top: 2px;}
          </style>
        </head>
        <body>
    `;
    
    tarjas.forEach(t => {
      html += `
        <div class="label">
          <div>
            <div class="header">
              <span>${empresaActiva.nombre.substring(0, 22)}...</span>
              <span>${t.fechaStr}</span>
            </div>
            <div class="sub-header">
              <span>CUARTEL: ${t.cuartel}</span>
              <span>CORTE: ${t.corte}</span>
            </div>
          </div>
          <div class="body">
            <div class="qr-container"><img class="qr-img" src="${t.qrUrl}" alt="QR" /></div>
            <div class="text-container">
              <div class="text-code">${t.codigo}</div>
            </div>
          </div>
          <div class="footer">
            <span>${empresaActiva.fundo.substring(0, 18)}</span>
            <span>RUT: ${empresaActiva.rut}</span>
          </div>
        </div>
      `;
    });

    html += `</body></html>`;
    win.document.write(html);
    win.document.close();
    win.focus();
    
    // 3. Limpiar y refrescar
    await cargarHistorial();
    setTarjas([]);
    setProcesando(false);
    
    setTimeout(() => { win.print(); }, 500);
  };

  const numFinVista = inicio + parseInt(cantidad || 0) - 1;
  const siguienteCodigoVista = `bin;${prefijo}${String(inicio).padStart(4, '0')}`;
  const finVistaCompleto = `bin;${prefijo}${String(numFinVista).padStart(4, '0')}`;

  return (
    <div className="form-card" style={{ maxWidth: "1000px", margin: "0 auto" }}>
      <h3 className="form-title">Generador de Tarjas de Cosecha (Zebra 100x70mm)</h3>
      <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px" }}>
        El número de folio se asigna automáticamente. Ingresa los datos, previsualiza la etiqueta y luego regístrala para imprimir.
      </p>

      <div className="form-grid" style={{ marginBottom: "20px", background: "#f8fafc", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label>Empresa y Fundo</label>
          <select value={empresaIdx} onChange={e => setEmpresaIdx(e.target.value)} style={{ fontWeight: "bold", width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
            {EMPRESAS_TARJAS.map((emp, idx) => (
              <option key={idx} value={idx}>{emp.nombre} - {emp.fundo}</option>
            ))}
          </select>
        </div>

        <div className="form-group"><label>Fecha de Cosecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></div>
        <div className="form-group"><label>Cuartel *</label><input value={cuartel} onChange={e => setCuartel(e.target.value.toUpperCase())} placeholder="Ej: LOS NOGALES 1" /></div>
        <div className="form-group"><label>Corte *</label><input value={corte} onChange={e => setCorte(e.target.value.toUpperCase())} placeholder="Ej: 1" /></div>
        
        <div className="form-group">
          <label>Último Código Impreso</label>
          <input value={ultimoCodigo} disabled style={{ background: "#e2e8f0", color: "#64748b", fontWeight: "bold", cursor: "not-allowed", fontFamily: "monospace" }} />
        </div>
        <div className="form-group">
          <label>Siguiente Código Libre</label>
          <input value={siguienteCodigoVista} disabled style={{ background: "#e2e8f0", color: "#0f172a", fontWeight: "bold", cursor: "not-allowed", fontFamily: "monospace" }} />
        </div>
        <div className="form-group">
          <label>Cantidad a Imprimir *</label>
          <input type="number" min="1" max="1000" value={cantidad} onChange={e => setCantidad(e.target.value)} style={{ borderColor: "#16a34a", borderWidth: "2px", fontWeight: "bold" }} />
        </div>
        
        <div style={{ gridColumn: "1 / -1", textAlign: "center", marginTop: "10px", color: "#16a34a", fontWeight: "bold" }}>
          ℹ️ Generarás {cantidad || 0} etiquetas: Desde <span style={{fontFamily:"monospace", background:"#dcfce7", padding:"2px 6px", borderRadius:"4px"}}>{siguienteCodigoVista}</span> hasta <span style={{fontFamily:"monospace", background:"#dcfce7", padding:"2px 6px", borderRadius:"4px"}}>{finVistaCompleto}</span>
        </div>
      </div>

      <div className="form-actions" style={{ justifyContent: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "25px", marginBottom: "25px" }}>
        <button className="btn-secondary" onClick={generarPrevisualizacion} style={{ fontSize: "16px", padding: "12px 30px" }}>
          👁️ Previsualizar Lote
        </button>
        
        {tarjas.length > 0 && (
          <button className="btn-primary" onClick={registrarEImprimirZebra} disabled={procesando} style={{ background: "#16a34a", fontSize: "16px", padding: "12px 30px" }}>
            {procesando ? "Guardando..." : "🖨️ Guardar Historial e Imprimir Zebra"}
          </button>
        )}
      </div>

      {tarjas.length > 0 && (
        <div>
          <h4 style={{ marginBottom: "15px", color: "#1e293b" }}>Vista Previa ({tarjas.length} etiquetas listas para guardar)</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "15px", maxHeight: "400px", overflowY: "auto", background: "#f8fafc", padding: "15px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            {tarjas.map(t => (
              <div key={t.codigo} style={{ background: "#fff", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", width: "320px", display: "flex", flexDirection: "column", color: "#000" }}>
                
                <div style={{ fontSize: "11px", fontWeight: "bold", display: "flex", justifyContent: "space-between", borderBottom: "3px solid #000", paddingBottom: "3px", marginBottom: "3px" }}>
                  <span>{empresaActiva.nombre.substring(0,22)}...</span><span>{t.fechaStr}</span>
                </div>
                
                <div style={{ fontSize: "12px", fontWeight: "bold", display: "flex", justifyContent: "space-between", borderBottom: "3px solid #000", paddingBottom: "3px", marginBottom: "3px" }}>
                  <span>CUARTEL: {t.cuartel}</span><span>CORTE: {t.corte}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
                  <img src={t.qrUrl} alt="QR" style={{ width: "120px", height: "120px" }} />
                  <div style={{ textAlign: "right", paddingLeft: "10px" }}>
                    <div style={{ fontWeight: "900", fontSize: "22px", letterSpacing: "0px", wordBreak: "break-all", lineHeight: "1.1" }}>{t.codigo}</div>
                  </div>
                </div>

                <div style={{ fontSize: "11px", fontWeight: "bold", display: "flex", justifyContent: "space-between", borderTop: "3px solid #000", paddingTop: "3px", marginTop: "3px" }}>
                  <span>{empresaActiva.fundo.substring(0,20)}</span><span>RUT: {empresaActiva.rut}</span>
                </div>

              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: "40px" }}>
        <h4 style={{ marginBottom: "15px", color: "#1e293b" }}>Auditoría: Historial de Impresiones Guardadas</h4>
        {historial.length === 0 ? (
           <div className="empty-state"><p>Aún no se han impreso tarjas.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="workers-table">
              <thead>
                <tr>
                  <th>Fecha Emisión</th>
                  <th>Empresa / Cuartel / Corte</th>
                  <th>Rango Impreso</th>
                  <th style={{textAlign: "center"}}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((lote) => (
                  <tr key={lote.id}>
                    <td>
                      {lote.creadoEn ? new Date(lote.creadoEn.seconds * 1000).toLocaleString() : "Recién..."}
                    </td>
                    <td>
                      <div style={{fontWeight: "bold"}}>{lote.empresa}</div>
                      <div style={{fontSize: "12px", color: "#64748b"}}>Cuartel: {lote.cuartel} | Corte: {lote.corte}</div>
                    </td>
                    <td className="cell-mono" style={{fontWeight: "600"}}>
                      bin;{lote.prefijo}{String(lote.inicio).padStart(4, '0')} - bin;{lote.prefijo}{String(lote.fin).padStart(4, '0')}
                    </td>
                    <td style={{textAlign: "center", fontWeight: "bold", color: "#16a34a"}}>{lote.cantidad}</td>
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

// ─── Administrador de Credenciales (Para Trabajadores) ──
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
          <label>Contratista (Empresa o Contacto)</label>
          <input 
            list="lista-contratistas" 
            value={form.contratista} 
            onChange={(e) => set("contratista", e.target.value)} 
            placeholder="Escribe el nombre o contacto..."
            autoComplete="off"
          />
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
            <p style={{ margin: 0, fontSize: "14px", color: "#475569" }}>
              ✅ Este perfil ya tiene su QR guardado. (Si el estado cambia a Inactivo, la credencial se liberará automáticamente).
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
    } catch (error) { alert("Error al cargar códigos: " + error.message); }
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

    let finalForm = { ...form };

    if (!editTarget) {
      const availableCredentials = credentials
        .filter(c => c.estado === "Disponible")
        .sort((a, b) => String(a.folio).localeCompare(String(b.folio), undefined, { numeric: true, sensitivity: 'base' }));

      if (availableCredentials.length > 0) {
        const nextCred = availableCredentials[0];
        finalForm.codigoQR = nextCred.codigo;
        finalForm.folioQR = nextCred.folio;
        await updateDoc(doc(db, "credentials", nextCred.id), { estado: "Asignado", asignadoA: form.rut, actualizadoEn: serverTimestamp() });
      } else {
        finalForm.codigoQR = generateWorkerCode();
        finalForm.folioQR = "V-AUTO-" + Math.floor(Math.random() * 10000);
      }

      await addDoc(collection(db, "workers"), { ...finalForm, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });

    } else {
      if (form.estado === "Inactivo" && editTarget.codigoQR) {
        const credDoc = credentials.find(c => c.codigo === editTarget.codigoQR);
        if (credDoc) {
          await updateDoc(doc(db, "credentials", credDoc.id), { estado: "Disponible", asignadoA: null, actualizadoEn: serverTimestamp() });
        } else {
          await addDoc(collection(db, "credentials"), { folio: editTarget.folioQR || "RECICLADO-" + Math.floor(Math.random() * 1000), codigo: editTarget.codigoQR, estado: "Disponible", asignadoA: null, creadoEn: serverTimestamp() });
        }
        finalForm.codigoQR = null;
        finalForm.folioQR = null;
      }
      else if (form.estado === "Activo" && editTarget.estado === "Inactivo" && !editTarget.codigoQR) {
        const today = new Date();
        finalForm.fechaIngreso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const availableCredentials = credentials
          .filter(c => c.estado === "Disponible")
          .sort((a, b) => String(a.folio).localeCompare(String(b.folio), undefined, { numeric: true, sensitivity: 'base' }));

        if (availableCredentials.length > 0) {
          const nextCred = availableCredentials[0];
          finalForm.codigoQR = nextCred.codigo;
          finalForm.folioQR = nextCred.folio;
          await updateDoc(doc(db, "credentials", nextCred.id), { estado: "Asignado", asignadoA: form.rut, actualizadoEn: serverTimestamp() });
        } else {
          finalForm.codigoQR = generateWorkerCode();
          finalForm.folioQR = "V-AUTO-" + Math.floor(Math.random() * 10000);
        }
      }

      await updateDoc(doc(db, "workers", editTarget.id), { ...finalForm, actualizadoEn: serverTimestamp() });
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

  const handleToggleEstado = async (item, collectionName) => {
    const nuevoEstado = item.estado === "Activo" ? "Inactivo" : "Activo";
    setLoadingData(true);
    try {
      if (collectionName === "workers") {
        if (nuevoEstado === "Activo") {
          if (!window.confirm(`¿Seguro que deseas Reactivar a ${item.nombre}? Su fecha de ingreso se actualizará a hoy y se le asignará una nueva credencial si no tiene una.`)) {
            setLoadingData(false); return;
          }

          const today = new Date();
          const fechaHoy = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          let updates = { estado: nuevoEstado, fechaIngreso: fechaHoy, actualizadoEn: serverTimestamp() };

          if (!item.codigoQR) {
            const availableCredentials = credentials
              .filter(c => c.estado === "Disponible")
              .sort((a, b) => String(a.folio).localeCompare(String(b.folio), undefined, { numeric: true, sensitivity: 'base' }));

            if (availableCredentials.length > 0) {
              const nextCred = availableCredentials[0];
              updates.codigoQR = nextCred.codigo;
              updates.folioQR = nextCred.folio;
              await updateDoc(doc(db, "credentials", nextCred.id), { estado: "Asignado", asignadoA: item.rut, actualizadoEn: serverTimestamp() });
            } else {
              updates.codigoQR = generateWorkerCode();
              updates.folioQR = "V-AUTO-" + Math.floor(Math.random() * 10000);
            }
          }
          await updateDoc(doc(db, collectionName, item.id), updates);
        } else {
          if (!window.confirm(`¿Seguro que deseas Desactivar a ${item.nombre}? Su credencial quedará libre automáticamente para otro uso.`)) {
            setLoadingData(false); return;
          }

          if (item.codigoQR) {
            const credDoc = credentials.find(c => c.codigo === item.codigoQR);
            if (credDoc) {
              await updateDoc(doc(db, "credentials", credDoc.id), { estado: "Disponible", asignadoA: null, actualizadoEn: serverTimestamp() });
            } else {
              await addDoc(collection(db, "credentials"), { folio: item.folioQR || "RECICLADO-" + Math.floor(Math.random() * 1000), codigo: item.codigoQR, estado: "Disponible", asignadoA: null, creadoEn: serverTimestamp() });
            }
          }

          await updateDoc(doc(db, collectionName, item.id), { estado: nuevoEstado, codigoQR: null, folioQR: null, actualizadoEn: serverTimestamp() });
        }
      } else {
        await updateDoc(doc(db, collectionName, item.id), { estado: nuevoEstado, actualizadoEn: serverTimestamp() });
      }
    } catch (e) { alert("Hubo un error al cambiar el estado: " + e.message); }

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
          <button onClick={() => { setView("workers_list"); setSearch(""); setEditTarget(null); }} style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view.includes("workers") ? "#101c38" : "#f1f5f9", color: view.includes("workers") ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}>👥 Personal</button>
          <button onClick={() => { setView("contractors_list"); setSearch(""); setEditTarget(null); }} style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view.includes("contractors") ? "#101c38" : "#f1f5f9", color: view.includes("contractors") ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}>🏢 Contratistas</button>
          <button onClick={() => { setView("credentials_list"); setSearch(""); setEditTarget(null); }} style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view === "credentials_list" ? "#101c38" : "#f1f5f9", color: view === "credentials_list" ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}>🪪 Gestión Credenciales</button>
          <button onClick={() => { setView("tarjas"); setSearch(""); setEditTarget(null); }} style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view === "tarjas" ? "#16a34a" : "#f1f5f9", color: view === "tarjas" ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}>🏷️ Tarjas de Cosecha</button>
        </div>

        {view === "workers_form" && <WorkerForm onSave={handleSaveWorker} onCancel={() => { setView("workers_list"); setEditTarget(null); }} initial={editTarget} contractorsList={contractors} credentialsList={credentials} />}
        {view === "contractors_form" && <ContractorForm onSave={handleSaveContractor} onCancel={() => { setView("contractors_list"); setEditTarget(null); }} initial={editTarget} />}
        {view === "credentials_list" && <CredentialsManager credentialsList={credentials} onBulkUpload={handleBulkUploadCredentials} onDelete={handleDeleteCredential} loading={loadingData} />}
        {view === "tarjas" && <TarjasManager />}

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