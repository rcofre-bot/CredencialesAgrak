import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, serverTimestamp, where } from "firebase/firestore";
import { db } from "../firebase"; 
import QRCode from "qrcode";
import toast from "react-hot-toast";

const LOGOS_EMPRESAS = {
  "79.737.880-1": "/convento.png",
  "76.064.746-2": "/torretagle.png"
};

export default function TarjasManager({ camposList, empresasMaestras }) {
  const [empresaIdx, setEmpresaIdx] = useState(0);
  
  const [modoTorretagle, setModoTorretagle] = useState("bins");

  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  
  const [campoSeleccionado, setCampoSeleccionado] = useState("");
  const [centroSeleccionado, setCentroSeleccionado] = useState("");
  
  const [cortesSeleccionados, setCortesSeleccionados] = useState([]); 
  const [corteManual, setCorteManual] = useState(""); 
  
  const [sdp, setSdp] = useState("");
  const [clasificacionSag, setClasificacionSag] = useState("");
  const [codCsg, setCodCsg] = useState(""); 
  
  const [cantidad, setCantidad] = useState(10);
  
  const [historial, setHistorial] = useState([]);
  const [inicio, setInicio] = useState(1);
  
  const [tarjas, setTarjas] = useState([]);
  const [procesando, setProcesando] = useState(false);
  const [generando, setGenerando] = useState(false);

  const empresaActiva = empresasMaestras[empresaIdx] || empresasMaestras[0];
  const prefijo = empresaActiva?.prefijo || "";
  const isTorretagle = empresaActiva?.rut === "76.064.746-2";
  
  const listaCamposFiltrados = camposList.filter(c => {
    if (!c.empresaRut) return empresaActiva.rut === "79.737.880-1"; 
    return c.empresaRut === empresaActiva.rut;
  });

  const camposUnicos = [...new Set(listaCamposFiltrados.map(c => c.campo).filter(Boolean))].sort();
  
  const cuartelesUnicos = [];
  const mapCuarteles = new Map();
  for (const c of listaCamposFiltrados) {
    if (c.campo === campoSeleccionado && !mapCuarteles.has(c.centro)) {
      mapCuarteles.set(c.centro, true);
      cuartelesUnicos.push(c);
    }
  }
  cuartelesUnicos.sort((a,b) => a.centro.localeCompare(b.centro));

  const cortesDisponibles = [...new Set(
    listaCamposFiltrados
      .filter(c => c.campo === campoSeleccionado && c.centro === centroSeleccionado && c.corte && c.corte.trim() !== "")
      .map(c => c.corte)
  )].sort();

  useEffect(() => {
    if (cortesDisponibles.length === 1) {
      setCortesSeleccionados([cortesDisponibles[0]]);
    } else {
      setCortesSeleccionados([]);
    }
    setCorteManual("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centroSeleccionado]);

  useEffect(() => {
    setTarjas([]);
    setCampoSeleccionado("");
    setCentroSeleccionado("");
    setCortesSeleccionados([]);
    setCorteManual("");
  }, [empresaActiva, modoTorretagle]);

  useEffect(() => {
    if (!empresaActiva) return;
    const q = query(collection(db, "tarjas_history"), where("empresaRut", "==", empresaActiva.rut));
    const unsubscribe = onSnapshot(q, (snap) => {
        let docs = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
        docs.sort((a,b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
        let maxFin = 0;
        docs.forEach(d => { if (d.fin && typeof d.fin === 'number' && d.fin > maxFin) maxFin = d.fin; });
        setInicio(maxFin + 1);
        setHistorial(docs.slice(0, 150));
      },
      (error) => { console.warn("Error leyendo historial:", error.message); }
    );
    return () => unsubscribe();
  }, [empresaActiva, prefijo]);

  let infoCuartel = null;
  if (cortesDisponibles.length > 0 && cortesSeleccionados.length > 0) {
    infoCuartel = listaCamposFiltrados.find(c => c.campo === campoSeleccionado && c.centro === centroSeleccionado && c.corte === cortesSeleccionados[0]);
  }
  if (!infoCuartel) {
    infoCuartel = listaCamposFiltrados.find(c => c.campo === campoSeleccionado && c.centro === centroSeleccionado && (!c.corte || c.corte.trim() === ""));
  }
  if (!infoCuartel) {
    infoCuartel = listaCamposFiltrados.find(c => c.campo === campoSeleccionado && c.centro === centroSeleccionado);
  }

  const especieAuto = infoCuartel?.especie || "";
  const variedadAuto = infoCuartel?.variedad || "";
  const codigoUnicoAuto = infoCuartel?.codigoUnico || ""; 

  const generarPrevisualizacion = async () => {
    if (!campoSeleccionado || !centroSeleccionado) { return toast.error("Selecciona Cuartel para generar."); }
    if (!especieAuto || !variedadAuto) { return toast.error("Este Cuartel no tiene Especie o Variedad asignada."); }
    const cantNum = parseInt(cantidad || 0);
    if (cantNum < 1) { return toast.error("La cantidad debe ser mayor a 0."); }

    setGenerando(true);
    setTarjas([]); 

    const nuevasTarjas = [];
    const [y, m, d] = fecha.split("-");
    const fechaStr = `${d}-${m}-${y}`;

    const logoBase = LOGOS_EMPRESAS[empresaActiva.rut] || "";
    const esSecuencial = !isTorretagle || (isTorretagle && modoTorretagle === "bins");

    const corteFinalStr = cortesDisponibles.length > 0 ? cortesSeleccionados.join("+") : corteManual;
    let centroCostoImpresion = centroSeleccionado;

    if (isTorretagle) {
      centroCostoImpresion = codigoUnicoAuto ? codigoUnicoAuto : centroSeleccionado;
    }

    if (corteFinalStr) {
      centroCostoImpresion += ` (${corteFinalStr})`;
    }

    if (esSecuencial) {
      const batchSize = 50;
      const numFin = inicio + cantNum - 1;
      
      for (let i = 0; i < cantNum; i += batchSize) {
        const batchPromises = [];
        for (let j = i; j < i + batchSize && j < cantNum; j++) {
          const numActual = numFin - j; 
          const numStr = String(numActual).padStart(4, '0');
          const codigoQRData = `bin;${prefijo}${numStr}`;
          
          const qrPromise = QRCode.toDataURL(codigoQRData, { width: 400, margin: 0 })
            .then(qrDataUrl => ({
              codigo: codigoQRData, qrUrl: qrDataUrl, fechaStr, 
              empresaNombre: empresaActiva.nombre.replace("AGRICOLA ", "").replace(" SPA", ""),
              logoUrl: logoBase, campo: campoSeleccionado, centroCosto: centroCostoImpresion, 
              especie: especieAuto, variedad: variedadAuto, sdp, clasificacionSag, corte: corteFinalStr 
            }));
          batchPromises.push(qrPromise);
        }
        const batchResults = await Promise.all(batchPromises);
        nuevasTarjas.push(...batchResults);
        await new Promise(resolve => setTimeout(resolve, 10)); 
      }
    } else {
      for (let i = 0; i < cantNum; i++) {
        nuevasTarjas.push({
          id: i, fechaStr, empresaNombre: empresaActiva.nombre.replace(" SPA", ""), logoUrl: logoBase,
          campo: campoSeleccionado, centroCosto: centroCostoImpresion, especie: especieAuto,
          variedad: variedadAuto, sdp, clasificacionSag, corte: corteFinalStr, codCsg 
        });
      }
    }

    setTarjas(nuevasTarjas);
    setGenerando(false);
    toast.success(`${cantNum} etiquetas listas para imprimir`);
  };

  const getPlantillaConvento = (tarjasAImprimir) => {
    let html = `<!DOCTYPE html><html><head><title>Impresión Zebra SAG</title><style>
      *{box-sizing:border-box;margin:0;padding:0}@page{size:100mm 70mm;margin:0;padding:0}
      body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#fff;color:#000;width:100mm}
      @media print{html,body{width:100mm!important;height:auto!important;overflow:visible!important}
      .label{height:70mm!important;overflow:hidden!important;page-break-after:always!important;}}
      .label{width:100mm;height:70mm;padding:2mm 3mm;display:flex;flex-direction:column;justify-content:space-between;background:#fff;overflow:hidden}
      .header-box{display:flex;justify-content:space-between;align-items:center;border:1.5px solid #000;border-radius:1mm;padding:1mm 2mm}
      .header-title{font-size:13pt;font-weight:900;letter-spacing:0.5px} .header-logo{height:5mm;object-fit:contain}
      .info-grid{display:flex;flex-direction:column;gap:0.8mm;flex-grow:1;margin:1mm 0}
      .info-row{display:flex;gap:0.8mm;flex:1} 
      .info-box{flex:1;border:1.5px solid #000;border-radius:1mm;padding:0.5mm 1.5mm;display:flex;flex-direction:column;justify-content:center}
      .info-lbl{font-size:6.5pt;font-weight:bold;border-bottom:1px solid #000;padding-bottom:0.3mm;margin-bottom:0.3mm;text-transform:uppercase}
      .info-val{font-size:10.5pt;font-weight:900;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1}
      .qr-box{display:flex;justify-content:space-between;align-items:center;border:1.5px solid #000;border-radius:1mm;padding:1mm 2mm}
      .qr-img{width:16mm;height:16mm;object-fit:contain} .qr-text{font-size:14pt;font-weight:900;letter-spacing:0.5px;margin:0}
    </style></head><body>`;
    tarjasAImprimir.forEach(t => {
      const imgTag = t.logoUrl ? `<img class="header-logo" src="${window.location.origin}${t.logoUrl}" alt="Logo" />` : '';
      html += `<div class="label"><div class="header-box"><div class="header-title">${t.empresaNombre.toUpperCase()}</div>${imgTag}</div>
        <div class="info-grid">
          <div class="info-row"><div class="info-box"><div class="info-lbl">Especie</div><div class="info-val">${t.especie}</div></div><div class="info-box"><div class="info-lbl">Variedad</div><div class="info-val">${t.variedad}</div></div></div>
          <div class="info-row"><div class="info-box"><div class="info-lbl">Cuartel / C. Costo</div><div class="info-val">${t.centroCosto}</div></div><div class="info-box"><div class="info-lbl">Fecha Cosecha</div><div class="info-val">${t.fechaStr}</div></div></div>
          <div class="info-row"><div class="info-box"><div class="info-lbl">SDP</div><div class="info-val">${t.sdp || "-"}</div></div><div class="info-box"><div class="info-lbl">Clasif. SAG</div><div class="info-val">${t.clasificacionSag || "-"}</div></div></div>
        </div>
        <div class="qr-box"><img class="qr-img" src="${t.qrUrl}" alt="QR" /><div class="qr-text">${t.codigo}</div></div></div>`;
    });
    html += `</body></html>`;
    return html;
  };

  const getPlantillaTorretagleBins = (tarjasAImprimir) => {
    let html = `<!DOCTYPE html>
    <html>
    <head>
      <title>Impresión Torretagle Bins</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @page { size: 100mm 70mm; margin: 0; padding: 0; }
        
        body { 
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
          background: #fff; color: #000; width: 100mm; 
        }
        
        @media print {
          html, body { width: 100mm !important; height: auto !important; overflow: visible !important; margin: 0; padding: 0; }
          .label { height: 70mm !important; overflow: hidden !important; page-break-after: always !important; border: none !important; margin: 0 !important; }
        }
        
        .label { 
          width: 100mm; height: 70mm; padding: 3mm 4mm; 
          display: flex; flex-direction: column; align-items: center; justify-content: space-between; 
          border: 1px dashed #ccc; background-color: #fff;
        }
        
        .header { width: 100%; text-align: center; }
        .bin-empresa { font-size: 16pt; font-weight: 900; text-transform: uppercase; line-height: 1.1; margin-bottom: 1mm; }
        .bin-cuartel { font-size: 12pt; font-weight: bold; color: #222; text-transform: uppercase; line-height: 1.1; }
        
        .qr-wrapper { flex-grow: 1; display: flex; align-items: center; justify-content: center; width: 100%; }
        .bin-qr { width: 42mm; height: 42mm; object-fit: contain; }
        
        .bin-text { font-size: 26pt; font-weight: 900; letter-spacing: 1.5px; line-height: 1; margin-top: 1mm; text-align: center; }
      </style>
    </head>
    <body>`;
    tarjasAImprimir.forEach(t => {
      html += `
        <div class="label">
          <div class="header">
            <div class="bin-empresa">${t.empresaNombre} (R)</div>
            <div class="bin-cuartel">CUARTEL: ${t.centroCosto}</div>
          </div>
          <div class="qr-wrapper"><img class="bin-qr" src="${t.qrUrl}" alt="QR" /></div>
          <div class="bin-text">${t.codigo}</div>
        </div>`;
    });
    html += `</body></html>`;
    return html;
  };

  // 🔥 CALIBRACIÓN FINA (CODIGO CSG CENTRADO) 🔥
  const getPlantillaTorretagleTarja = (tarjasAImprimir) => {
    let html = `<!DOCTYPE html>
    <html>
    <head>
      <title>Impresión Torretagle Tarja</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @page { size: 80mm 150mm; margin: 0; padding: 0; }
        
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #000; width: 80mm; }
        
        @media print {
          html, body { width: 80mm !important; height: auto !important; margin: 0; padding: 0; overflow: visible !important; }
          .label { height: 150mm !important; width: 80mm !important; page-break-after: always !important; position: relative; overflow: hidden; }
        }
        
        .label { width: 80mm; height: 150mm; position: relative; background-color: transparent; }
        
        .val-box { 
          position: absolute; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-weight: 900; 
          text-transform: uppercase; 
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .box-cantidad  { top: 22mm; left: 32mm; width: 42mm; height: 12mm; font-size: 11pt; }
        
        /* CORRECCIÓN: El CSG se movió al punto medio perfecto (35mm) */
        .box-csg       { top: 35mm; left: 32mm; width: 42mm; height: 12mm; font-size: 11pt; }
        
        .box-productor { top: 58mm; left: 6mm; width: 68mm; height: 14mm; font-size: 11pt; }
        .box-especie   { top: 79mm; left: 6mm; width: 68mm; height: 14mm; font-size: 11pt; }
        
        .box-sdp       { top: 109mm; left: 6mm; width: 32mm; height: 14mm; font-size: 10pt; }
        .box-cuartel   { top: 109mm; left: 42mm; width: 32mm; height: 14mm; font-size: 10pt; }
        
        .box-sag       { top: 135mm; left: 6mm; width: 32mm; height: 14mm; font-size: 10pt; }
        .box-fecha     { top: 135mm; left: 42mm; width: 32mm; height: 14mm; font-size: 10pt; }
      </style>
    </head>
    <body>`;
    
    tarjasAImprimir.forEach(t => {
      html += `
        <div class="label">
          <div class="val-box box-cantidad"></div>
          <div class="val-box box-csg">${t.codCsg || ""}</div>
          
          <div class="val-box box-productor">${t.empresaNombre}</div>
          <div class="val-box box-especie">${t.especie} - ${t.variedad}</div>
          
          <div class="val-box box-sdp">${t.sdp || ""}</div>
          <div class="val-box box-cuartel">${t.centroCosto}</div>
          
          <div class="val-box box-sag">${t.clasificacionSag || ""}</div>
          <div class="val-box box-fecha">${t.fechaStr}</div>
        </div>`;
    });
    html += `</body></html>`;
    return html;
  };

  const registrarEImprimirZebra = async () => {
    if (tarjas.length === 0) { return toast.error("Primero debes previsualizar el lote generado."); }

    setProcesando(true);
    const cantNum = parseInt(cantidad || 0);

    const esSecuencial = !isTorretagle || (isTorretagle && modoTorretagle === "bins");
    const numFin = esSecuencial ? inicio + cantNum - 1 : null;
    
    const corteFinalStr = cortesDisponibles.length > 0 ? cortesSeleccionados.join("+") : corteManual;
    let centroCostoImpresion = centroSeleccionado;

    if (isTorretagle) {
      centroCostoImpresion = codigoUnicoAuto ? codigoUnicoAuto : centroSeleccionado;
    }
    if (corteFinalStr) {
      centroCostoImpresion += ` (${corteFinalStr})`;
    }

    addDoc(collection(db, "tarjas_history"), {
      empresa: empresaActiva.nombre,
      empresaRut: empresaActiva.rut,
      campo: isTorretagle && modoTorretagle === "bins" ? "MÓDULO BINS" : campoSeleccionado.toUpperCase(),
      centroCosto: centroCostoImpresion.toUpperCase(),
      corteReal: corteFinalStr.toUpperCase(),
      especie: especieAuto,
      variedad: variedadAuto,
      sdp: sdp.toUpperCase(),
      clasificacionSag: clasificacionSag.toUpperCase(),
      fechaCosecha: fecha,
      codCsg: codCsg.toUpperCase(),
      prefijo: prefijo,
      inicio: esSecuencial ? inicio : null, 
      cantidad: cantNum,
      fin: esSecuencial ? numFin : null, 
      creadoEn: serverTimestamp()
    }).catch(e => console.error("Error offline", e));

    toast.success("Lote registrado localmente. Enviando a impresora...");

    let html = "";
    if (!isTorretagle) html = getPlantillaConvento(tarjas);
    else if (modoTorretagle === "bins") html = getPlantillaTorretagleBins(tarjas);
    else html = getPlantillaTorretagleTarja(tarjas);

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
    const msg = lote.inicio 
      ? `⚠️ REIMPRIMIR lote secuencial desde ${lote.inicio} hasta ${lote.fin}. ¿Continuar?`
      : `⚠️ REIMPRIMIR ${lote.cantidad} copias. ¿Continuar?`;
    if (!window.confirm(msg)) return;

    setProcesando(true);
    const toastId = toast.loading(`Generando ${lote.cantidad} etiquetas...`);

    try {
      const [y, m, d] = (lote.fechaCosecha || fecha).split("-");
      const fechaStr = `${d}-${m}-${y}`;
      const logoBase = LOGOS_EMPRESAS[lote.empresaRut] || "";
      const tarjasParaImprimir = [];

      if (lote.inicio) {
        const batchPromises = [];
        for (let i = lote.fin; i >= lote.inicio; i--) {
          const numStr = String(i).padStart(4, '0');
          const codigoQRData = `bin;${lote.prefijo}${numStr}`;
          const qrPromise = QRCode.toDataURL(codigoQRData, { width: 400, margin: 0 }).then(qrDataUrl => ({
            codigo: codigoQRData, qrUrl: qrDataUrl, fechaStr, 
            empresaNombre: lote.empresa.replace("AGRICOLA ", "").replace(" SPA", ""),
            logoUrl: logoBase, campo: lote.campo, centroCosto: lote.centroCosto, 
            especie: lote.especie || "", variedad: lote.variedad || "",
            sdp: lote.sdp || "", clasificacionSag: lote.clasificacionSag || "", corte: lote.corteReal || "" 
          }));
          batchPromises.push(qrPromise);
        }
        tarjasParaImprimir.push(...await Promise.all(batchPromises));
      } else {
        for (let i = 0; i < lote.cantidad; i++) {
          tarjasParaImprimir.push({
            fechaStr, empresaNombre: lote.empresa.replace(" SPA", ""), logoUrl: logoBase,
            campo: lote.campo, centroCosto: lote.centroCosto, especie: lote.especie || "",
            variedad: lote.variedad || "", sdp: lote.sdp || "", clasificacionSag: lote.clasificacionSag || "",
            corte: lote.corteReal || "", codCsg: lote.codCsg || ""
          });
        }
      }

      let html = "";
      if (lote.empresaRut === "79.737.880-1") html = getPlantillaConvento(tarjasParaImprimir);
      else if (lote.inicio) html = getPlantillaTorretagleBins(tarjasParaImprimir);
      else html = getPlantillaTorretagleTarja(tarjasParaImprimir);

      const printFrame = document.createElement("iframe");
      printFrame.style.position = "absolute";
      printFrame.style.width = "0px";
      printFrame.style.height = "0px";
      printFrame.style.border = "none";
      document.body.appendChild(printFrame);
      const docFrame = printFrame.contentWindow.document;
      docFrame.open(); docFrame.write(html); docFrame.close();
      
      setTimeout(() => {
        toast.dismiss(toastId); toast.success("Enviado a impresora.");
        printFrame.contentWindow.focus(); printFrame.contentWindow.print();
        setTimeout(() => document.body.removeChild(printFrame), 1000);
        setProcesando(false);
      }, 1500);

    } catch (error) {
      toast.dismiss(toastId); toast.error("Error al reimprimir.");
      console.error(error); setProcesando(false);
    }
  };

  if (!empresaActiva) return <div>Cargando configuración...</div>;

  const numFinVista = inicio + parseInt(cantidad || 0) - 1;
  const siguienteCodigoVista = `bin;${prefijo}${String(inicio).padStart(4, '0')}`;
  const finVistaCompleto = `bin;${prefijo}${String(numFinVista).padStart(4, '0')}`;

  const selectStyle = {
    width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", 
    fontSize: "14px", backgroundColor: "#fff", outline: "none", fontWeight: "bold"
  };

  return (
    <div className="form-card" style={{ maxWidth: "1000px", margin: "0 auto" }}>
      <h3 className="form-title">Generador de Tarjas y Etiquetas</h3>
      <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px" }}>
        Seleccione el Cuartel para autocompletar la información de impresión.
      </p>

      {isTorretagle && (
        <div style={{ display: "flex", gap: "10px", marginBottom: "25px", borderBottom: "2px solid #e2e8f0", paddingBottom: "15px" }}>
          <button 
            onClick={() => setModoTorretagle("tarja")}
            style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "none", fontWeight: "bold", fontSize: "15px", cursor: "pointer", transition: "0.2s", background: modoTorretagle === "tarja" ? "#001254" : "#f1f5f9", color: modoTorretagle === "tarja" ? "#fff" : "#64748b" }}
          >
            📄 1. Tarjas de Exportadora (80x150mm)
          </button>
          <button 
            onClick={() => setModoTorretagle("bins")}
            style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "none", fontWeight: "bold", fontSize: "15px", cursor: "pointer", transition: "0.2s", background: modoTorretagle === "bins" ? "#16a34a" : "#f1f5f9", color: modoTorretagle === "bins" ? "#fff" : "#64748b" }}
          >
            🔲 2. Etiquetas de Bins (100x70mm)
          </button>
        </div>
      )}

      <div className="form-grid" style={{ marginBottom: "20px", background: "#f8fafc", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label style={{color: (isTorretagle && modoTorretagle === "bins") ? "#16a34a" : "#001254", fontWeight:"bold"}}>
            {empresasMaestras.length === 1 ? "EMPRESA EMISORA" : "SELECCIONAR EMPRESA"}
          </label>
          
          {empresasMaestras.length === 1 ? (
            <div style={{ padding: "12px", background: "#e2e8f0", border: "1px solid #cbd5e1", borderRadius: "6px", fontWeight: "bold", color: "#334155" }}>
              🏢 {empresasMaestras[0].nombre} - RUT: {empresasMaestras[0].rut}
            </div>
          ) : (
            <select 
              value={empresaIdx} 
              onChange={e => { setEmpresaIdx(Number(e.target.value)); setCampoSeleccionado(""); setCentroSeleccionado(""); setTarjas([]); setCortesSeleccionados([]); setCorteManual(""); }} 
              style={{ fontWeight: "bold", width: "100%", padding: "10px", border:`2px solid ${(isTorretagle && modoTorretagle === "bins") ? "#16a34a" : "#001254"}`, borderRadius: "6px" }}
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
          <select style={selectStyle} value={campoSeleccionado} onChange={e => { setCampoSeleccionado(e.target.value); setCentroSeleccionado(""); setCortesSeleccionados([]); setCorteManual(""); setTarjas([]); }}>
            <option value="">Seleccione un Campo...</option>
            {camposUnicos.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>CUARTEL / C. COSTO *</label>
          <select style={selectStyle} value={centroSeleccionado} onChange={e => { setCentroSeleccionado(e.target.value); setTarjas([]); }}>
            <option value="">{campoSeleccionado ? "Seleccione un Cuartel..." : "Primero seleccione Campo"}</option>
            {cuartelesUnicos.map(c => <option key={c.id} value={c.centro}>{c.centro}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ gridColumn: cortesDisponibles.length > 0 ? "1 / -1" : "auto" }}>
          <label>CORTE / SECTOR A COSECHAR {cortesDisponibles.length > 0 && <span style={{color: "#b45309", fontWeight: "normal"}}>(Puedes marcar varios al mismo tiempo)</span>}</label>
          
          {cortesDisponibles.length > 0 ? (
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "5px" }}>
              {cortesDisponibles.map(c => {
                const isSelected = cortesSeleccionados.includes(c);
                return (
                  <div 
                    key={c}
                    onClick={() => {
                      let nuevos = isSelected ? cortesSeleccionados.filter(x => x !== c) : [...cortesSeleccionados, c];
                      setCortesSeleccionados(nuevos);
                      setTarjas([]);
                    }}
                    style={{
                      padding: "10px 20px", borderRadius: "8px", cursor: "pointer", userSelect: "none", transition: "0.2s",
                      border: isSelected ? "2px solid #b45309" : "2px solid #cbd5e1",
                      background: isSelected ? "#fef3c7" : "#fff",
                      color: isSelected ? "#92400e" : "#475569",
                      fontWeight: "900",
                    }}
                  >
                    {isSelected ? "✔️ " : ""}{c}
                  </div>
                )
              })}
            </div>
          ) : (
            <input 
              value={corteManual} 
              onChange={e => { setCorteManual(e.target.value.toUpperCase()); setTarjas([]); }} 
              placeholder="Ej: C1 (Opcional)" 
              disabled={!centroSeleccionado}
              style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", outline: "none", fontWeight: "bold", background: !centroSeleccionado ? "#f1f5f9" : "#fff" }}
            />
          )}
        </div>

        <div className="form-group" style={{ gridColumn: cortesDisponibles.length > 0 ? "1 / -1" : "auto" }}>
          <label>CÓDIGO ÚNICO (Automático)</label>
          <input 
            value={codigoUnicoAuto} 
            disabled 
            style={{ background: "#e2e8f0", fontWeight: "bold", cursor: "not-allowed", color: codigoUnicoAuto ? "#0f172a" : "#94a3b8" }} 
            placeholder="Se carga del Cuartel..." 
          />
        </div>

        {(!isTorretagle || (isTorretagle && modoTorretagle === "tarja")) && (
          <>
            <div className="form-group"><label>ESPECIE (Automático) *</label><input value={especieAuto} disabled style={{ background: "#e2e8f0", fontWeight: "bold", cursor: "not-allowed", color: especieAuto ? "#0f172a" : "#94a3b8" }} placeholder="Se carga del Cuartel..." /></div>
            <div className="form-group"><label>VARIEDAD (Automático) *</label><input value={variedadAuto} disabled style={{ background: "#e2e8f0", fontWeight: "bold", cursor: "not-allowed", color: variedadAuto ? "#0f172a" : "#94a3b8" }} placeholder="Se carga del Cuartel..." /></div>
            {isTorretagle && <div className="form-group"><label>COD. CSG (Opcional)</label><input value={codCsg} onChange={e => { setCodCsg(e.target.value.toUpperCase()); setTarjas([]); }} placeholder="Ej: 12345" /></div>}
            <div className="form-group"><label>SDP (Opcional)</label><input value={sdp} onChange={e => { setSdp(e.target.value.toUpperCase()); setTarjas([]); }} placeholder="Código SDP" /></div>
            <div className="form-group"><label>CLASIFICACIÓN SAG</label><input value={clasificacionSag} onChange={e => { setClasificacionSag(e.target.value.toUpperCase()); setTarjas([]); }} placeholder="Ej: MERCADO INTERNO" /></div>
          </>
        )}
        
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label>{(isTorretagle && modoTorretagle === "tarja") ? "COPIAS DE TARJA A IMPRIMIR *" : "CANTIDAD DE FOLIOS A IMPRIMIR *"}</label>
          <input type="number" min="1" max="1000" value={cantidad} onChange={e => { setCantidad(e.target.value); setTarjas([]); }} style={{ borderColor: (isTorretagle && modoTorretagle === "bins") ? "#16a34a" : "#001254", borderWidth: "2px", fontWeight: "bold" }} />
        </div>
        
        {(!isTorretagle || (isTorretagle && modoTorretagle === "bins")) && (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", marginTop: "10px", color: "#16a34a", fontWeight: "bold" }}>
            ℹ️ Generarás {cantidad || 0} folios secuenciales: Desde <span style={{fontFamily:"monospace", background:"#dcfce7", padding:"2px 6px", borderRadius:"4px"}}>{siguienteCodigoVista}</span> hasta <span style={{fontFamily:"monospace", background:"#dcfce7", padding:"2px 6px", borderRadius:"4px"}}>{finVistaCompleto}</span>
          </div>
        )}
      </div>

      <div className="form-actions" style={{ justifyContent: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "25px", marginBottom: "25px", flexDirection: "column", alignItems: "center", gap: "15px" }}>
        <button className="btn-secondary" onClick={generarPrevisualizacion} disabled={generando || procesando} style={{ fontSize: "16px", padding: "12px 30px", width: "100%", maxWidth: "400px" }}>
          {generando ? `⏳ Generando...` : "👁️ Previsualizar Formato"}
        </button>
        {tarjas.length > 0 && !generando && (
          <button className="btn-primary" onClick={registrarEImprimirZebra} disabled={procesando} style={{ background: (isTorretagle && modoTorretagle === "bins") ? "#16a34a" : "#001254", fontSize: "16px", padding: "12px 30px", width: "100%", maxWidth: "400px" }}>
            {procesando ? "🖨️ Procesando impresión..." : "🖨️ Guardar Historial e Imprimir Zebra"}
          </button>
        )}
      </div>

      {/* VISTAS PREVIAS */}
      {tarjas.length > 0 && !isTorretagle && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <h4 style={{ marginBottom: "15px", color: "#1e293b" }}>Vista Previa (Formato Industrial 100x70)</h4>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "15px", maxHeight: "450px", overflowY: "auto", background: "#f8fafc", padding: "15px", borderRadius: "8px", border: "1px solid #e2e8f0", width: "100%" }}>
            {tarjas.map(t => (
              <div key={t.codigo} style={{ background: "#fff", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", width: "380px", height: "266px", display: "flex", flexDirection: "column", justifyContent: "space-between", color: "#000", fontFamily: "Helvetica Neue, Arial, sans-serif", boxSizing: "border-box" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1.5px solid #000", borderRadius: "4px", padding: "4px 8px" }}>
                  <div style={{ fontSize: "16px", fontWeight: "900", letterSpacing: "0.5px" }}>{t.empresaNombre.toUpperCase()}</div>
                  {t.logoUrl && <img src={t.logoUrl} alt="Logo" style={{ height: "16px", objectFit: "contain" }} />}
                </div>
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1.5px solid #000", borderRadius: "4px", padding: "4px 8px" }}>
                  <img src={t.qrUrl} alt="QR" style={{ width: "45px", height: "45px", objectFit: "contain" }} />
                  <div style={{ fontWeight: "900", fontSize: "18px", letterSpacing: "0px", margin: "0" }}>{t.codigo}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tarjas.length > 0 && isTorretagle && modoTorretagle === "bins" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <h4 style={{ marginBottom: "15px", color: "#1e293b" }}>Vista Previa Bins (100x70 QR Gigante)</h4>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "15px", maxHeight: "400px", overflowY: "auto", background: "#f8fafc", padding: "15px", borderRadius: "8px", border: "1px solid #e2e8f0", width: "100%" }}>
            {tarjas.map((t, idx) => (
              <div key={idx} style={{ background: "#fff", padding: "15px", borderRadius: "6px", width: "380px", height: "266px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "2px solid #cbd5e1", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
                <div style={{ fontSize: "20px", fontWeight: "900", marginBottom: "5px", letterSpacing: "1px" }}>{t.empresaNombre.toUpperCase()} (R)</div>
                <div style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "10px", color: "#333" }}>C.COSTO: {t.centroCosto}</div>
                <img src={t.qrUrl} alt="QR" style={{ width: "130px", height: "130px", objectFit: "contain" }} />
                <div style={{ fontWeight: "900", fontSize: "28px", marginTop: "10px" }}>{t.codigo}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tarjas.length > 0 && isTorretagle && modoTorretagle === "tarja" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <h4 style={{ marginBottom: "15px", color: "#1e293b" }}>Vista Previa (Formato Azul de Guía - Se imprimirá solo el texto en negro)</h4>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "15px", maxHeight: "600px", overflowY: "auto", background: "#f8fafc", padding: "15px", borderRadius: "8px", border: "1px solid #e2e8f0", width: "100%" }}>
            {tarjas.map((t, idx) => (
              <div key={idx} style={{ background: "#001254", color: "#fff", padding: "15px", borderRadius: "6px", width: "302px", height: "566px", display: "flex", flexDirection: "column", fontFamily: "Helvetica Neue, Arial, sans-serif", boxSizing: "border-box", boxShadow: "0 4px 6px rgba(0,0,0,0.3)", position: "relative" }}>
                <div style={{ fontSize: "16px", textAlign: "center", marginBottom: "8px", fontWeight: "bold", letterSpacing: "0.5px" }}>TARJA A PROCESO</div>
                <div style={{ textAlign: "center", marginBottom: "25px" }}>{t.logoUrl && <img src={t.logoUrl} alt="Logo" style={{ height: "30px", background: "#fff", padding: "4px 8px", borderRadius: "4px", objectFit: "contain" }} />}</div>
                <div style={{ display: "flex", alignItems: "center", marginBottom: "15px" }}>
                  <div style={{ fontSize: "11px", width: "80px", textAlign: "right", marginRight: "10px", fontWeight: "bold" }}>CANTIDAD</div>
                  <div style={{ flex: 1, background: "#fff", height: "30px", borderRadius: "2px" }}></div>
                </div>
                <div style={{ display: "flex", alignItems: "center", marginBottom: "20px" }}>
                  <div style={{ fontSize: "11px", width: "80px", textAlign: "right", marginRight: "10px", fontWeight: "bold" }}>COD. CSG</div>
                  <div style={{ flex: 1, background: "#fff", color: "#000", height: "30px", borderRadius: "2px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "14px" }}>{t.codCsg || ""}</div>
                </div>
                <div style={{ fontSize: "11px", textAlign: "center", marginBottom: "5px", fontWeight: "bold" }}>CÓDIGO NOMBRE PRODUCTOR</div>
                <div style={{ background: "#fff", color: "#000", height: "40px", borderRadius: "2px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "15px", marginBottom: "15px", textTransform: "uppercase" }}>{t.empresaNombre}</div>
                <div style={{ fontSize: "11px", textAlign: "center", marginBottom: "5px", fontWeight: "bold" }}>ESPECIE - VARIEDAD</div>
                <div style={{ background: "#fff", color: "#000", height: "40px", borderRadius: "2px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "15px", marginBottom: "20px", textTransform: "uppercase" }}>{t.especie} - {t.variedad}</div>
                <div style={{ display: "flex", marginBottom: "5px" }}>
                  <div style={{ flex: 1, fontSize: "11px", textAlign: "center", fontWeight: "bold" }}>COD. SDP</div>
                  <div style={{ flex: 1, fontSize: "11px", textAlign: "center", fontWeight: "bold" }}>COD. CUARTEL</div>
                </div>
                <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
                  <div style={{ flex: 1, background: "#fff", color: "#000", height: "40px", borderRadius: "2px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "13px" }}>{t.sdp || ""}</div>
                  <div style={{ flex: 1, background: "#fff", color: "#000", height: "40px", borderRadius: "2px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "11px", textAlign: "center", padding: "0 2px" }}>{t.centroCosto}</div>
                </div>
                <div style={{ display: "flex", marginBottom: "5px" }}>
                  <div style={{ flex: 1, fontSize: "11px", textAlign: "center", fontWeight: "bold" }}>CLASIF. SAG</div>
                  <div style={{ flex: 1, fontSize: "11px", textAlign: "center", fontWeight: "bold" }}>FECHA COSECHA</div>
                </div>
                <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                  <div style={{ flex: 1, background: "#fff", color: "#000", height: "40px", borderRadius: "2px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "13px" }}>{t.clasificacionSag || ""}</div>
                  <div style={{ flex: 1, background: "#fff", color: "#000", height: "40px", borderRadius: "2px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "13px" }}>{t.fechaStr}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TABLA DE AUDITORÍA GENERAL */}
      <div style={{ marginTop: "40px" }}>
        <h4 style={{ marginBottom: "15px", color: "#1e293b" }}>Auditoría de Lotes ({empresaActiva.nombre.replace("AGRICOLA ", "")})</h4>
        {historial.length === 0 ? (
           <div className="empty-state"><p>Aún no se han impreso etiquetas en esta empresa.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="workers-table">
              <thead>
                <tr>
                  <th>Fecha Emisión</th>
                  <th>Especie / Tipo</th>
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
                      {lote.campo === "MÓDULO BINS" ? (
                        <div style={{fontWeight: "bold", color: "#16a34a"}}>ETIQUETAS BINS</div>
                      ) : !lote.inicio ? (
                        <div style={{fontWeight: "bold", color: "#001254"}}>TARJAS EXPORTADORA</div>
                      ) : (
                        <>
                          <div style={{fontWeight: "bold"}}>{lote.especie || "—"}</div>
                          <div style={{fontSize: "12px", color: "#64748b"}}>{lote.variedad || "—"}</div>
                        </>
                      )}
                    </td>

                    <td>
                      <div style={{fontWeight: "bold"}}>{lote.campo === "MÓDULO BINS" ? "Módulo Bins" : lote.campo}</div>
                      <div style={{fontSize: "12px", color: "#64748b"}}>C.Costo: {lote.centroCosto}</div>
                    </td>

                    <td className="cell-mono" style={{fontWeight: "600"}}>
                      {lote.inicio ? `${lote.inicio} al ${lote.fin}` : "Copias Idénticas"}
                    </td>

                    <td style={{textAlign: "center", fontWeight: "bold", color: lote.inicio ? "#16a34a" : "#001254"}}>
                      {lote.cantidad}
                    </td>

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