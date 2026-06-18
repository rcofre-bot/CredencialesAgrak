import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, serverTimestamp, where } from "firebase/firestore";
import { db } from "../firebase"; 
import QRCode from "qrcode";
import toast from "react-hot-toast";

export default function TarjasManager({ camposList, empresasMaestras }) {
  const [empresaIdx, setEmpresaIdx] = useState(0);
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  
  const [campoSeleccionado, setCampoSeleccionado] = useState("");
  const [centroSeleccionado, setCentroSeleccionado] = useState("");
  const [corte, setCorte] = useState("");
  const [cantidad, setCantidad] = useState(10);
  
  const [historial, setHistorial] = useState([]);
  const [inicio, setInicio] = useState(1);
  const [ultimoCodigo, setUltimoCodigo] = useState("Cargando...");
  
  const [tarjas, setTarjas] = useState([]);
  const [procesando, setProcesando] = useState(false);
  
  const [generando, setGenerando] = useState(false);
  const [progreso, setProgreso] = useState({ actual: 0, total: 0 });

  const empresaActiva = empresasMaestras[empresaIdx] || empresasMaestras[0];
  const prefijo = empresaActiva?.prefijo || "";

  const listaCamposFiltrados = camposList.filter(c => {
    if (!c.empresaRut) return empresaActiva.rut === "79.737.880-1"; 
    return c.empresaRut === empresaActiva.rut;
  });

  const camposUnicos = [...new Set(listaCamposFiltrados.map(c => c.campo))];
  const centrosFiltrados = listaCamposFiltrados.filter(c => c.campo === campoSeleccionado).map(c => c.centro);

  useEffect(() => {
    if (!empresaActiva) return;

    const q = query(
      collection(db, "tarjas_history"), 
      where("empresaRut", "==", empresaActiva.rut)
    );
    
    const unsubscribe = onSnapshot(
      q, 
      (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a,b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));

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
      },
      (error) => {
        console.warn("Permisos insuficientes en historial:", error.message);
        setUltimoCodigo("Sin acceso / Cargando...");
      }
    );

    return () => unsubscribe();
  }, [empresaActiva, prefijo]);

  const generarPrevisualizacion = async () => {
    if (!campoSeleccionado || !centroSeleccionado || !corte) {
      toast.error("Selecciona el Campo, Centro de Costo y Corte para previsualizar.");
      return;
    }
    const cantNum = parseInt(cantidad || 0);
    if (cantNum < 1) {
      toast.error("La cantidad a imprimir debe ser mayor a 0.");
      return;
    }

    setGenerando(true);
    setProgreso({ actual: 0, total: cantNum });
    setTarjas([]); 

    const nuevasTarjas = [];
    const [y, m, d] = fecha.split("-");
    const fechaStr = `${d}-${m}-${y}`;

    const batchSize = 50;

    for (let i = 0; i < cantNum; i += batchSize) {
      const batchPromises = [];
      
      for (let j = i; j < i + batchSize && j < cantNum; j++) {
        const numActual = inicio + j;
        const numStr = String(numActual).padStart(4, '0');
        const codigoQRData = `bin;${prefijo}${numStr}`;
        
        const qrPromise = QRCode.toDataURL(codigoQRData, {
          width: 300, margin: 0, color: { dark: "#000000", light: "#ffffff" }
        }).then(qrDataUrl => ({
          codigo: codigoQRData, 
          qrUrl: qrDataUrl, 
          fechaStr, 
          campo: campoSeleccionado, 
          centroCosto: centroSeleccionado, 
          corte 
        }));

        batchPromises.push(qrPromise);
      }

      const batchResults = await Promise.all(batchPromises);
      nuevasTarjas.push(...batchResults);
      setProgreso({ actual: nuevasTarjas.length, total: cantNum });
      await new Promise(resolve => setTimeout(resolve, 10)); 
    }

    setTarjas(nuevasTarjas);
    setGenerando(false);
    toast.success(`${cantNum} etiquetas listas para imprimir`);
  };

  const registrarEImprimirZebra = async () => {
    if (tarjas.length === 0) {
      toast.error("Primero debes previsualizar el lote generado.");
      return;
    }

    setProcesando(true);
    const cantNum = parseInt(cantidad || 0);
    const numFin = inicio + cantNum - 1;

    try {
      await addDoc(collection(db, "tarjas_history"), {
        empresa: empresaActiva.nombre,
        empresaRut: empresaActiva.rut,
        campo: campoSeleccionado.toUpperCase(),
        centroCosto: centroSeleccionado.toUpperCase(),
        fechaCosecha: fecha,
        corte: corte.toUpperCase(),
        prefijo: prefijo,
        inicio: inicio,
        cantidad: cantNum,
        fin: numFin,
        creadoEn: serverTimestamp()
      });
      toast.success("Lote registrado en auditoría.");
    } catch(e) {
      console.error("Error al guardar historial de tarjas", e);
      toast.error("Error al guardar el registro en la nube.");
      setProcesando(false);
      return;
    }

    let html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Impresión Zebra</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            @page { size: 100mm 70mm; margin: 0; padding: 0; }
            body { font-family: 'Arial', sans-serif; background: #fff; color: #000; width: 100mm; height: 70mm; }
            @media print {
              html, body { width: 100mm; height: 70mm; margin: 0; padding: 0; overflow: hidden; }
              .label { border: none !important; margin: 0 !important; page-break-after: always; page-break-inside: avoid; }
            }
            .label { 
              width: 100mm; height: 70mm; padding: 3mm 4mm; display: flex; flex-direction: column; justify-content: space-between;
              overflow: hidden; background: #fff; border: 1px dashed #ccc; 
            }
            .header { display: flex; justify-content: space-between; font-size: 8pt; font-weight: bold; border-bottom: 0.8mm solid #000; padding-bottom: 1mm; margin-bottom: 1mm;}
            .sub-header { display: flex; justify-content: space-between; font-size: 10pt; font-weight: bold; border-bottom: 0.8mm solid #000; padding-bottom: 1mm; }
            .body { display: flex; align-items: center; justify-content: space-between; flex-grow: 1; padding: 2mm 0; height: 42mm; gap: 2mm;}
            .qr-container { width: 40mm; height: 40mm; display: flex; align-items: center; justify-content: flex-start; flex-shrink: 0;}
            .qr-img { width: 100%; height: 100%; object-fit: contain; }
            .text-container { display: flex; align-items: center; justify-content: flex-end; flex-grow: 1; overflow: hidden;}
            .text-code { font-size: 16pt; font-weight: 900; letter-spacing: 0; text-align: right; word-break: break-all; line-height: 1.1;}
            .footer { display: flex; justify-content: space-between; font-size: 8pt; font-weight: bold; border-top: 0.8mm solid #000; padding-top: 1mm; margin-top: 1mm;}
          </style>
        </head>
        <body>
    `;
    
    tarjas.forEach(t => {
      html += `
        <div class="label">
          <div>
            <div class="header">
              <span>${empresaActiva.nombre.substring(0, 30)}</span>
              <span>${t.fechaStr}</span>
            </div>
            <div class="sub-header">
              <span>C.COSTO: ${t.centroCosto.substring(0, 15)}</span>
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
            <span>CAMPO: ${t.campo.substring(0, 20)}</span>
            <span>RUT: ${empresaActiva.rut}</span>
          </div>
        </div>
      `;
    });

    html += `</body></html>`;

    const printFrame = document.createElement("iframe");
    printFrame.style.position = "absolute";
    printFrame.style.width = "0px";
    printFrame.style.height = "0px";
    printFrame.style.border = "none";
    document.body.appendChild(printFrame);
    
    const docFrame = printFrame.contentWindow.document;
    docFrame.open();
    docFrame.write(html);
    docFrame.close();
    
    setTarjas([]);
    setProcesando(false);
    
    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
      setTimeout(() => document.body.removeChild(printFrame), 1000);
    }, 500);
  };

  if (!empresaActiva) return <div>Cargando configuración de la empresa...</div>;

  const numFinVista = inicio + parseInt(cantidad || 0) - 1;
  const siguienteCodigoVista = `bin;${prefijo}${String(inicio).padStart(4, '0')}`;
  const finVistaCompleto = `bin;${prefijo}${String(numFinVista).padStart(4, '0')}`;

  return (
    <div className="form-card" style={{ maxWidth: "1000px", margin: "0 auto" }}>
      <h3 className="form-title">Generador de Tarjas de Cosecha (Zebra 100x70mm)</h3>
      <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px" }}>
        Selecciona los parámetros de cosecha para generar e imprimir el lote. El contador de folios es independiente para cada empresa.
      </p>

      <div className="form-grid" style={{ marginBottom: "20px", background: "#f8fafc", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        
        {/* 🔥 MEJORA DE UX: Solo mostramos el desplegable si hay más de 1 empresa disponible 🔥 */}
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label style={{color:"#16a34a", fontWeight:"bold"}}>
            {empresasMaestras.length === 1 ? "EMPRESA EMISORA (ASIGNADA)" : "SELECCIONAR EMPRESA EMISORA DE TARJA"}
          </label>
          
          {empresasMaestras.length === 1 ? (
            <div style={{ padding: "12px", background: "#e2e8f0", border: "1px solid #cbd5e1", borderRadius: "6px", fontWeight: "bold", color: "#334155" }}>
              🏢 {empresasMaestras[0].nombre} - RUT: {empresasMaestras[0].rut}
            </div>
          ) : (
            <select value={empresaIdx} onChange={e => { setEmpresaIdx(Number(e.target.value)); setCampoSeleccionado(""); setCentroSeleccionado(""); }} style={{ fontWeight: "bold", width: "100%", padding: "10px", border:"2px solid #16a34a", borderRadius: "6px" }}>
              {empresasMaestras.map((emp, idx) => (
                <option key={idx} value={idx}>{emp.nombre} - RUT: {emp.rut}</option>
              ))}
            </select>
          )}
        </div>

        <div className="form-group"><label>FECHA DE COSECHA</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></div>
        
        <div className="form-group">
          <label>CAMPO / FUNDO ({empresaActiva.nombre.replace("AGRICOLA ","")}) *</label>
          <input 
            list="lista-campos" 
            value={campoSeleccionado} 
            onChange={e => { setCampoSeleccionado(e.target.value.toUpperCase()); setCentroSeleccionado(""); }} 
            placeholder="Escribe para buscar campo..." 
            autoComplete="off"
          />
          <datalist id="lista-campos">
            {camposUnicos.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div className="form-group">
          <label>C. COSTO (CUARTEL FILTRADO) *</label>
          <input 
            list="lista-centros" 
            value={centroSeleccionado} 
            onChange={e => setCentroSeleccionado(e.target.value.toUpperCase())} 
            placeholder={campoSeleccionado ? "Escribe para buscar..." : "Selecciona un Campo primero"} 
            autoComplete="off"
          />
          <datalist id="lista-centros">
            {centrosFiltrados.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div className="form-group"><label>CORTE *</label><input value={corte} onChange={e => setCorte(e.target.value.toUpperCase())} placeholder="Ej: 1" /></div>
        
        <div className="form-group">
          <label>ÚLTIMO CÓDIGO GENERAL</label>
          <input value={ultimoCodigo} disabled style={{ background: "#e2e8f0", color: "#64748b", fontWeight: "bold", cursor: "not-allowed", fontFamily: "monospace" }} />
        </div>
        <div className="form-group">
          <label>INICIA LOTE EN</label>
          <input value={siguienteCodigoVista} disabled style={{ background: "#e2e8f0", color: "#0f172a", fontWeight: "bold", cursor: "not-allowed", fontFamily: "monospace" }} />
        </div>
        <div className="form-group">
          <label>CANTIDAD A IMPRIMIR *</label>
          <input type="number" min="1" max="1000" value={cantidad} onChange={e => setCantidad(e.target.value)} style={{ borderColor: "#16a34a", borderWidth: "2px", fontWeight: "bold" }} />
        </div>
        
        <div style={{ gridColumn: "1 / -1", textAlign: "center", marginTop: "10px", color: "#16a34a", fontWeight: "bold" }}>
          ℹ️ Generarás {cantidad || 0} etiquetas: Desde <span style={{fontFamily:"monospace", background:"#dcfce7", padding:"2px 6px", borderRadius:"4px"}}>{siguienteCodigoVista}</span> hasta <span style={{fontFamily:"monospace", background:"#dcfce7", padding:"2px 6px", borderRadius:"4px"}}>{finVistaCompleto}</span>
        </div>
      </div>

      <div className="form-actions" style={{ justifyContent: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "25px", marginBottom: "25px", flexDirection: "column", alignItems: "center", gap: "15px" }}>
        
        <button className="btn-secondary" onClick={generarPrevisualizacion} disabled={generando || procesando} style={{ fontSize: "16px", padding: "12px 30px", width: "100%", maxWidth: "400px" }}>
          {generando ? `⏳ Generando ${progreso.actual} de ${progreso.total}...` : "👁️ Previsualizar Lote"}
        </button>

        {generando && (
          <div style={{ width: "100%", maxWidth: "400px", background: "#e2e8f0", borderRadius: "8px", overflow: "hidden", height: "10px" }}>
            <div style={{ width: `${(progreso.actual / progreso.total) * 100}%`, background: "#b45309", height: "100%", transition: "width 0.2s" }}></div>
          </div>
        )}
        
        {tarjas.length > 0 && !generando && (
          <button className="btn-primary" onClick={registrarEImprimirZebra} disabled={procesando} style={{ background: "#16a34a", fontSize: "16px", padding: "12px 30px", width: "100%", maxWidth: "400px" }}>
            {procesando ? "🖨️ Procesando impresión..." : "🖨️ Guardar Historial e Imprimir Zebra"}
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
                  <span>{empresaActiva.nombre.substring(0,25)}</span><span>{t.fechaStr}</span>
                </div>
                <div style={{ fontSize: "12px", fontWeight: "bold", display: "flex", justifyContent: "space-between", borderBottom: "2px solid #000", paddingBottom: "3px", marginBottom: "3px" }}>
                  <span>C.COSTO: {t.centroCosto.substring(0,15)}</span><span>CORTE: {t.corte}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
                  <img src={t.qrUrl} alt="QR" style={{ width: "100px", height: "100px", flexShrink: 0 }} />
                  <div style={{ textAlign: "right", paddingLeft: "10px", flexGrow: 1, overflow: "hidden" }}>
                    <div style={{ fontWeight: "900", fontSize: "18px", letterSpacing: "0px", wordBreak: "break-all", lineHeight: "1.1" }}>{t.codigo}</div>
                  </div>
                </div>
                <div style={{ fontSize: "11px", fontWeight: "bold", display: "flex", justifyContent: "space-between", borderTop: "3px solid #000", paddingTop: "3px", marginTop: "3px" }}>
                  <span>CAMPO: {t.campo.substring(0,20)}</span><span>RUT: {empresaActiva.rut}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: "40px" }}>
        <h4 style={{ marginBottom: "15px", color: "#1e293b" }}>Auditoría: Historial de Impresiones Guardadas ({empresaActiva.nombre.replace("AGRICOLA ", "")})</h4>
        {historial.length === 0 ? (
           <div className="empty-state"><p>Aún no se han impreso tarjas para esta empresa.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="workers-table">
              <thead>
                <tr>
                  <th>Fecha Emisión</th>
                  <th>Empresa / Campo / C.Costo</th>
                  <th>Rango Impreso</th>
                  <th style={{textAlign: "center"}}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((lote) => (
                  <tr key={lote.id}>
                    <td>{lote.creadoEn ? new Date(lote.creadoEn.seconds * 1000).toLocaleString() : "Recién..."}</td>
                    <td>
                      <div style={{fontWeight: "bold"}}>{lote.empresa}</div>
                      <div style={{fontSize: "12px", color: "#64748b"}}>Campo: {lote.campo} | C.Costo: {lote.centroCosto}</div>
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