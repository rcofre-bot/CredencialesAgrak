import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase"; 
import QRCode from "qrcode";
import toast from "react-hot-toast";

const LOGOS_EMPRESAS = {
  "79.737.880-1": "/convento.png",
  "76.064.746-2": "/torretagle.png"
};

export default function TarjasManager({ camposList, empresasMaestras }) {
  const [empresaIdx, setEmpresaIdx] = useState(0);
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  
  const [campoSeleccionado, setCampoSeleccionado] = useState("");
  const [centroSeleccionado, setCentroSeleccionado] = useState("");
  
  const [sdp, setSdp] = useState("");
  const [clasificacionSag, setClasificacionSag] = useState("");
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

  const infoCuartel = camposList.find(c => c.campo === campoSeleccionado && c.centro === centroSeleccionado);
  const especieAuto = infoCuartel?.especie || "";
  const variedadAuto = infoCuartel?.variedad || "";

  useEffect(() => {
    if (!empresaActiva) return;

    const q = query(
      collection(db, "tarjas_history"), 
      orderBy("creadoEn", "desc"),
      limit(200)
    );
    
    const unsubscribe = onSnapshot(
      q, 
      (snap) => {
        let docs = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
        
        docs = docs.filter(d => d.empresaRut === empresaActiva.rut);
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
        console.warn("Error leyendo historial:", error.message);
        setUltimoCodigo("Sin acceso / Cargando...");
      }
    );

    return () => unsubscribe();
  }, [empresaActiva, prefijo]);

  const generarPrevisualizacion = async () => {
    if (!campoSeleccionado || !centroSeleccionado) {
      toast.error("Selecciona Cuartel para generar.");
      return;
    }
    if (!especieAuto || !variedadAuto) {
      toast.error("Este Cuartel no tiene Especie o Variedad asignada.");
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
    const logoBase = LOGOS_EMPRESAS[empresaActiva.rut] || "";

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
          empresaNombre: empresaActiva.nombre.replace("AGRICOLA ", "").replace(" SPA", ""),
          logoUrl: logoBase,
          campo: campoSeleccionado, 
          centroCosto: centroSeleccionado, 
          especie: especieAuto,
          variedad: variedadAuto,
          sdp,
          clasificacionSag,
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

  // 🔥 DISEÑO HTML ZEBRA AJUSTADO MILIMÉTRICAMENTE PARA ENCAJAR EN 70MM 🔥
  const getPlantillaHTML = (tarjasAImprimir) => {
    let html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Impresión Zebra SAG</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            @page { size: 100mm 70mm; margin: 0; padding: 0; }
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #fff; color: #000; width: 100mm; }
            
            @media print {
              html, body { width: 100mm !important; height: 70mm !important; margin: 0; padding: 0; overflow: hidden !important; }
              .label { border: none !important; margin: 0 !important; page-break-after: always !important; page-break-inside: avoid !important; }
            }
            
            .label { 
              width: 100mm; height: 70mm; 
              padding: 2mm 3mm; /* Márgenes externos reducidos */
              display: flex; flex-direction: column; justify-content: space-between;
              background: #fff; box-sizing: border-box; overflow: hidden;
            }
            
            /* HEADER */
            .header-box { 
              display: flex; justify-content: space-between; align-items: center; 
              border: 1.5px solid #000; border-radius: 1mm; 
              padding: 1mm 2mm; 
            }
            .header-title { font-size: 13pt; font-weight: 900; letter-spacing: 0.5px;}
            .header-logo { height: 5mm; object-fit: contain;}

            /* CAJAS DE DATOS (MÁS COMPACTAS) */
            .info-grid { display: flex; flex-direction: column; gap: 0.8mm; flex-grow: 1; margin: 1mm 0; }
            .info-row { display: flex; gap: 0.8mm; flex: 1; } 
            .info-box { 
              flex: 1; border: 1.5px solid #000; border-radius: 1mm; padding: 0.5mm 1.5mm; 
              display: flex; flex-direction: column; justify-content: center;
            }
            .info-lbl { font-size: 6.5pt; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 0.3mm; margin-bottom: 0.3mm; text-transform: uppercase;}
            .info-val { font-size: 10.5pt; font-weight: 900; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1;}
            
            /* FOOTER QR AJUSTADO */
            .qr-box { 
              display: flex; justify-content: space-between; align-items: center; 
              border: 1.5px solid #000; border-radius: 1mm; padding: 1mm 2mm; 
            }
            .qr-img { width: 16mm; height: 16mm; object-fit: contain; }
            .qr-text { font-size: 14pt; font-weight: 900; letter-spacing: 0.5px; margin: 0;}
          </style>
        </head>
        <body>
    `;
    
    tarjasAImprimir.forEach(t => {
      const imgTag = t.logoUrl ? `<img class="header-logo" src="${window.location.origin}${t.logoUrl}" alt="Logo" />` : '';
      
      html += `
        <div class="label">
          
          <div class="header-box">
            <div class="header-title">${t.empresaNombre.toUpperCase()}</div>
            ${imgTag}
          </div>
          
          <div class="info-grid">
            <div class="info-row">
              <div class="info-box">
                <div class="info-lbl">Especie</div>
                <div class="info-val">${t.especie}</div>
              </div>
              <div class="info-box">
                <div class="info-lbl">Variedad</div>
                <div class="info-val">${t.variedad}</div>
              </div>
            </div>
            
            <div class="info-row">
              <div class="info-box">
                <div class="info-lbl">Cuartel / C. Costo</div>
                <div class="info-val">${t.centroCosto}</div>
              </div>
              <div class="info-box">
                <div class="info-lbl">Fecha Cosecha</div>
                <div class="info-val">${t.fechaStr}</div>
              </div>
            </div>

            <div class="info-row">
              <div class="info-box">
                <div class="info-lbl">SDP</div>
                <div class="info-val">${t.sdp || "-"}</div>
              </div>
              <div class="info-box">
                <div class="info-lbl">Clasif. SAG</div>
                <div class="info-val">${t.clasificacionSag || "-"}</div>
              </div>
            </div>
          </div>

          <div class="qr-box">
            <img class="qr-img" src="${t.qrUrl}" alt="QR" />
            <div class="qr-text">${t.codigo}</div>
          </div>

        </div>
      `;
    });

    html += `</body></html>`;
    return html;
  };

  const registrarEImprimirZebra = async () => {
    if (tarjas.length === 0) {
      toast.error("Primero debes previsualizar el lote generado.");
      return;
    }

    setProcesando(true);
    const cantNum = parseInt(cantidad || 0);
    const numFin = inicio + cantNum - 1;

    addDoc(collection(db, "tarjas_history"), {
      empresa: empresaActiva.nombre,
      empresaRut: empresaActiva.rut,
      campo: campoSeleccionado.toUpperCase(),
      centroCosto: centroSeleccionado.toUpperCase(),
      especie: especieAuto,
      variedad: variedadAuto,
      sdp: sdp.toUpperCase(),
      clasificacionSag: clasificacionSag.toUpperCase(),
      fechaCosecha: fecha,
      corte: corte.toUpperCase(),
      prefijo: prefijo,
      inicio: inicio,
      cantidad: cantNum,
      fin: numFin,
      creadoEn: serverTimestamp()
    }).catch(e => console.error("Error al guardar historial offline", e));

    toast.success("Lote registrado localmente. Enviando a impresora...");

    const html = getPlantillaHTML(tarjas);

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
    }, 1500); 
  };

  const reimprimirLote = async (lote) => {
    const msg = `⚠️ ¡ATENCIÓN!\n\nEstás a punto de REIMPRIMIR el lote desde el ${lote.inicio} hasta el ${lote.fin}.\n\n¿Deseas continuar y mandar esto a la impresora?`;
    if (!window.confirm(msg)) return;

    setProcesando(true);
    const toastId = toast.loading(`Generando ${lote.cantidad} etiquetas...`);

    try {
      const [y, m, d] = (lote.fechaCosecha || fecha).split("-");
      const fechaStr = `${d}-${m}-${y}`;

      const batchPromises = [];
      const logoBase = LOGOS_EMPRESAS[lote.empresaRut] || "";

      for (let i = lote.inicio; i <= lote.fin; i++) {
        const numStr = String(i).padStart(4, '0');
        const codigoQRData = `bin;${lote.prefijo}${numStr}`;
        
        const qrPromise = QRCode.toDataURL(codigoQRData, {
          width: 300, margin: 0, color: { dark: "#000000", light: "#ffffff" }
        }).then(qrDataUrl => ({
          codigo: codigoQRData, 
          qrUrl: qrDataUrl, 
          fechaStr, 
          empresaNombre: lote.empresa.replace("AGRICOLA ", "").replace(" SPA", ""),
          logoUrl: logoBase,
          campo: lote.campo, 
          centroCosto: lote.centroCosto, 
          especie: lote.especie || "",
          variedad: lote.variedad || "",
          sdp: lote.sdp || "",
          clasificacionSag: lote.clasificacionSag || "",
          corte: lote.corte 
        }));

        batchPromises.push(qrPromise);
      }

      const tarjasParaImprimir = await Promise.all(batchPromises);
      const html = getPlantillaHTML(tarjasParaImprimir);

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
      
      setTimeout(() => {
        toast.dismiss(toastId);
        toast.success("Impresión enviada a Zebra.");
        printFrame.contentWindow.focus();
        printFrame.contentWindow.print();
        setTimeout(() => document.body.removeChild(printFrame), 1000);
        setProcesando(false);
      }, 1500);

    } catch (error) {
      toast.dismiss(toastId);
      toast.error("Ocurrió un error al reimprimir el lote.");
      console.error(error);
      setProcesando(false);
    }
  };

  if (!empresaActiva) return <div>Cargando configuración...</div>;

  const numFinVista = inicio + parseInt(cantidad || 0) - 1;
  const siguienteCodigoVista = `bin;${prefijo}${String(inicio).padStart(4, '0')}`;
  const finVistaCompleto = `bin;${prefijo}${String(numFinVista).padStart(4, '0')}`;

  return (
    <div className="form-card" style={{ maxWidth: "1000px", margin: "0 auto" }}>
      <h3 className="form-title">Generador de Tarjas (Formato SAG - Zebra 100x70mm)</h3>
      <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px" }}>
        Seleccione el Cuartel para autocompletar la Especie y Variedad vinculada.
      </p>

      <div className="form-grid" style={{ marginBottom: "20px", background: "#f8fafc", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label style={{color:"#16a34a", fontWeight:"bold"}}>
            {empresasMaestras.length === 1 ? "EMPRESA EMISORA" : "SELECCIONAR EMPRESA"}
          </label>
          
          {empresasMaestras.length === 1 ? (
            <div style={{ padding: "12px", background: "#e2e8f0", border: "1px solid #cbd5e1", borderRadius: "6px", fontWeight: "bold", color: "#334155" }}>
              🏢 {empresasMaestras[0].nombre} - RUT: {empresasMaestras[0].rut}
            </div>
          ) : (
            <select 
              value={empresaIdx} 
              onChange={e => { setEmpresaIdx(Number(e.target.value)); setCampoSeleccionado(""); setCentroSeleccionado(""); setTarjas([]); }} 
              style={{ fontWeight: "bold", width: "100%", padding: "10px", border:"2px solid #16a34a", borderRadius: "6px" }}
            >
              {empresasMaestras.map((emp, idx) => (
                <option key={idx} value={idx}>{emp.nombre} - RUT: {emp.rut}</option>
              ))}
            </select>
          )}
        </div>

        <div className="form-group"><label>FECHA DE COSECHA</label><input type="date" value={fecha} onChange={e => { setFecha(e.target.value); setTarjas([]); }} /></div>
        
        <div className="form-group">
          <label>CAMPO / FUNDO *</label>
          <input list="lista-campos" value={campoSeleccionado} onChange={e => { setCampoSeleccionado(e.target.value.toUpperCase()); setCentroSeleccionado(""); setTarjas([]); }} onFocus={e => e.target.select()} placeholder="Buscar campo..." autoComplete="off" />
          <datalist id="lista-campos">{camposUnicos.map(c => <option key={c} value={c} />)}</datalist>
        </div>

        <div className="form-group">
          <label>CUARTEL / C. COSTO *</label>
          <input list="lista-centros" value={centroSeleccionado} onChange={e => { setCentroSeleccionado(e.target.value.toUpperCase()); setTarjas([]); }} onFocus={e => e.target.select()} placeholder={campoSeleccionado ? "Buscar cuartel..." : "Seleccione Campo"} autoComplete="off" disabled={!campoSeleccionado} />
          <datalist id="lista-centros">{centrosFiltrados.map(c => <option key={c} value={c} />)}</datalist>
        </div>

        <div className="form-group">
          <label>ESPECIE (Automático) *</label>
          <input value={especieAuto} disabled style={{ background: "#e2e8f0", fontWeight: "bold", cursor: "not-allowed", color: especieAuto ? "#0f172a" : "#94a3b8" }} placeholder="Se carga del Cuartel..." />
        </div>
        <div className="form-group">
          <label>VARIEDAD (Automático) *</label>
          <input value={variedadAuto} disabled style={{ background: "#e2e8f0", fontWeight: "bold", cursor: "not-allowed", color: variedadAuto ? "#0f172a" : "#94a3b8" }} placeholder="Se carga del Cuartel..." />
        </div>

        <div className="form-group"><label>SDP (Opcional)</label><input value={sdp} onChange={e => { setSdp(e.target.value.toUpperCase()); setTarjas([]); }} placeholder="Código SDP" /></div>
        <div className="form-group"><label>CLASIFICACIÓN SAG</label><input value={clasificacionSag} onChange={e => { setClasificacionSag(e.target.value.toUpperCase()); setTarjas([]); }} placeholder="Ej: MERCADO INTERNO" /></div>
        <div className="form-group"><label>CORTE (Opcional)</label><input value={corte} onChange={e => { setCorte(e.target.value.toUpperCase()); setTarjas([]); }} placeholder="Ej: 1" /></div>
        
        <div></div>

        <div className="form-group">
          <label>CANTIDAD A IMPRIMIR *</label>
          <input type="number" min="1" max="1000" value={cantidad} onChange={e => { setCantidad(e.target.value); setTarjas([]); }} style={{ borderColor: "#16a34a", borderWidth: "2px", fontWeight: "bold" }} />
        </div>
        
        <div style={{ gridColumn: "1 / -1", textAlign: "center", marginTop: "10px", color: "#16a34a", fontWeight: "bold" }}>
          ℹ️ Generarás {cantidad || 0} etiquetas: Desde <span style={{fontFamily:"monospace", background:"#dcfce7", padding:"2px 6px", borderRadius:"4px"}}>{siguienteCodigoVista}</span> hasta <span style={{fontFamily:"monospace", background:"#dcfce7", padding:"2px 6px", borderRadius:"4px"}}>{finVistaCompleto}</span>
        </div>
      </div>

      <div className="form-actions" style={{ justifyContent: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "25px", marginBottom: "25px", flexDirection: "column", alignItems: "center", gap: "15px" }}>
        
        <button className="btn-secondary" onClick={generarPrevisualizacion} disabled={generando || procesando} style={{ fontSize: "16px", padding: "12px 30px", width: "100%", maxWidth: "400px" }}>
          {generando ? `⏳ Generando ${progreso.actual} de ${progreso.total}...` : "👁️ Previsualizar Diseño SAG"}
        </button>
        
        {tarjas.length > 0 && !generando && (
          <button className="btn-primary" onClick={registrarEImprimirZebra} disabled={procesando} style={{ background: "#16a34a", fontSize: "16px", padding: "12px 30px", width: "100%", maxWidth: "400px" }}>
            {procesando ? "🖨️ Procesando impresión..." : "🖨️ Guardar Historial e Imprimir Zebra"}
          </button>
        )}
      </div>

      {tarjas.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <h4 style={{ marginBottom: "15px", color: "#1e293b" }}>Vista Previa (Formato Industrial 100x70)</h4>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "15px", maxHeight: "450px", overflowY: "auto", background: "#f8fafc", padding: "15px", borderRadius: "8px", border: "1px solid #e2e8f0", width: "100%" }}>
            
            {tarjas.map(t => (
              <div key={t.codigo} style={{ background: "#fff", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", width: "380px", height: "266px", display: "flex", flexDirection: "column", justifyContent: "space-between", color: "#000", fontFamily: "Helvetica Neue, Arial, sans-serif", boxSizing: "border-box" }}>
                
                {/* HEADER MÁS LIGERO PARA PANTALLA */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1.5px solid #000", borderRadius: "4px", padding: "4px 8px" }}>
                  <div style={{ fontSize: "16px", fontWeight: "900", letterSpacing: "0.5px" }}>
                    {t.empresaNombre.toUpperCase()} (R)
                  </div>
                  {t.logoUrl && <img src={t.logoUrl} alt="Logo" style={{ height: "16px", objectFit: "contain" }} />}
                </div>
                
                {/* CAJAS DE DATOS GRID */}
                <div style={{ display: "flex", flexDirection: "column", gap: "3px", flexGrow: 1, margin: "4px 0" }}>
                  
                  <div style={{ display: "flex", gap: "3px", flex: 1 }}>
                    <div style={{ flex: 1, border: "1.5px solid #000", borderRadius: "4px", padding: "2px 6px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div style={{ fontSize: "9px", fontWeight: "bold", borderBottom: "1px solid #000", paddingBottom: "1px", marginBottom: "1px", textTransform: "uppercase" }}>Especie</div>
                      <div style={{ fontSize: "13px", fontWeight: "900", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.especie}</div>
                    </div>
                    <div style={{ flex: 1, border: "1.5px solid #000", borderRadius: "4px", padding: "2px 6px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div style={{ fontSize: "9px", fontWeight: "bold", borderBottom: "1px solid #000", paddingBottom: "1px", marginBottom: "1px", textTransform: "uppercase" }}>Variedad</div>
                      <div style={{ fontSize: "13px", fontWeight: "900", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.variedad}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "3px", flex: 1 }}>
                    <div style={{ flex: 1, border: "1.5px solid #000", borderRadius: "4px", padding: "2px 6px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div style={{ fontSize: "9px", fontWeight: "bold", borderBottom: "1px solid #000", paddingBottom: "1px", marginBottom: "1px", textTransform: "uppercase" }}>Cuartel / C. Costo</div>
                      <div style={{ fontSize: "13px", fontWeight: "900", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.centroCosto}</div>
                    </div>
                    <div style={{ flex: 1, border: "1.5px solid #000", borderRadius: "4px", padding: "2px 6px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div style={{ fontSize: "9px", fontWeight: "bold", borderBottom: "1px solid #000", paddingBottom: "1px", marginBottom: "1px", textTransform: "uppercase" }}>Fecha Cosecha</div>
                      <div style={{ fontSize: "13px", fontWeight: "900", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.fechaStr}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "3px", flex: 1 }}>
                    <div style={{ flex: 1, border: "1.5px solid #000", borderRadius: "4px", padding: "2px 6px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div style={{ fontSize: "9px", fontWeight: "bold", borderBottom: "1px solid #000", paddingBottom: "1px", marginBottom: "1px", textTransform: "uppercase" }}>SDP</div>
                      <div style={{ fontSize: "13px", fontWeight: "900", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.sdp || "-"}</div>
                    </div>
                    <div style={{ flex: 1, border: "1.5px solid #000", borderRadius: "4px", padding: "2px 6px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div style={{ fontSize: "9px", fontWeight: "bold", borderBottom: "1px solid #000", paddingBottom: "1px", marginBottom: "1px", textTransform: "uppercase" }}>Clasif. SAG</div>
                      <div style={{ fontSize: "13px", fontWeight: "900", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.clasificacionSag || "-"}</div>
                    </div>
                  </div>

                </div>

                {/* FOOTER QR SEGURO */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1.5px solid #000", borderRadius: "4px", padding: "4px 8px" }}>
                  <img src={t.qrUrl} alt="QR" style={{ width: "45px", height: "45px", objectFit: "contain" }} />
                  <div style={{ fontWeight: "900", fontSize: "18px", letterSpacing: "0px", margin: "0" }}>{t.codigo}</div>
                </div>

              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: "40px" }}>
        <h4 style={{ marginBottom: "15px", color: "#1e293b" }}>Auditoría de Lotes ({empresaActiva.nombre.replace("AGRICOLA ", "")})</h4>
        {historial.length === 0 ? (
           <div className="empty-state"><p>Aún no se han impreso tarjas.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="workers-table">
              <thead>
                <tr>
                  <th>Fecha Emisión</th>
                  <th>Especie / Variedad</th>
                  <th>Campo / Cuartel</th>
                  <th>Rango Impreso</th>
                  <th style={{textAlign: "center"}}>Cant.</th>
                  <th style={{textAlign: "center"}}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((lote) => (
                  <tr key={lote.id}>
                    <td>{lote.creadoEn ? new Date(lote.creadoEn.seconds * 1000).toLocaleString() : "Recién..."}</td>
                    <td>
                      <div style={{fontWeight: "bold"}}>{lote.especie || "—"}</div>
                      <div style={{fontSize: "12px", color: "#64748b"}}>{lote.variedad || "—"}</div>
                    </td>
                    <td>
                      <div style={{fontWeight: "bold"}}>{lote.campo}</div>
                      <div style={{fontSize: "12px", color: "#64748b"}}>C.Costo: {lote.centroCosto}</div>
                    </td>
                    <td className="cell-mono" style={{fontWeight: "600"}}>
                      {lote.inicio} al {lote.fin}
                    </td>
                    <td style={{textAlign: "center", fontWeight: "bold", color: "#16a34a"}}>{lote.cantidad}</td>
                    <td style={{textAlign: "center"}}>
                      <button className="btn-action" onClick={() => reimprimirLote(lote)} style={{ background: "#f1f5f9", padding: "6px 12px", borderRadius: "6px", fontWeight: "bold", border: "1px solid #cbd5e1" }}>
                        🖨️ Reimprimir
                      </button>
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