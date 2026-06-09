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