import React, { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import QRCode from "qrcode";
import toast from "react-hot-toast";

export default function CuadrillasManager({ workersList, userEmpresa, empresasMaestras }) {
  const [cuadrillas, setCuadrillas] = useState([]);
  
  const [empresaActiva, setEmpresaActiva] = useState(userEmpresa !== "TODAS" ? userEmpresa : "");
  const [contratistaActivo, setContratistaActivo] = useState(""); 

  const [nombreCuadrilla, setNombreCuadrilla] = useState("");
  const [seleccionados, setSeleccionados] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    let q = collection(db, "cuadrillas");
    if (userEmpresa !== "TODAS") {
      q = query(collection(db, "cuadrillas"), where("empresaRut", "==", userEmpresa));
    }

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
      setCuadrillas(data);
    });
    return () => unsubscribe();
  }, [userEmpresa]);

  const contratistasDisponibles = [...new Set(
    workersList
      .filter(w => w.empresaRut === empresaActiva && w.estado === "Activo" && w.contratista && w.contratista.trim() !== "")
      .map(w => w.contratista)
  )].sort();

  const toggleTrabajador = (rut) => {
    if (seleccionados.includes(rut)) {
      setSeleccionados(seleccionados.filter(r => r !== rut));
    } else {
      setSeleccionados([...seleccionados, rut]);
    }
  };

  const handleEmpresaChange = (rut) => {
    setEmpresaActiva(rut);
    setContratistaActivo(""); 
    setSeleccionados([]); 
    setNombreCuadrilla("");
    setBusqueda("");
  };

  const handleContratistaChange = (val) => {
    setContratistaActivo(val);
    setSeleccionados([]); 
  };

  const guardarCuadrilla = async () => {
    if (!empresaActiva) return toast.error("Selecciona la Empresa primero.");
    if (!nombreCuadrilla.trim()) return toast.error("Debes darle un nombre a la cuadrilla.");
    if (seleccionados.length === 0) return toast.error("Selecciona al menos un trabajador.");

    setProcesando(true);
    try {
      const empDatos = empresasMaestras.find(e => e.rut === empresaActiva);
      const prefijo = empDatos?.prefijo || "CUAD";
      
      const numeroAleatorio = Math.floor(10000 + Math.random() * 90000);
      const codigoUnicoAgrak = `cuadrilla;${prefijo}${numeroAleatorio}`;
      
      const trabajadoresData = seleccionados.map(rut => {
        const w = workersList.find(x => x.rut === rut);
        return { rut: w.rut, nombre: w.nombre };
      });

      let procedencia = "MIXTO";
      if (contratistaActivo === "PLANTA") procedencia = "PERSONAL DE PLANTA";
      else if (contratistaActivo !== "") procedencia = contratistaActivo;

      await addDoc(collection(db, "cuadrillas"), {
        nombre: nombreCuadrilla.toUpperCase(),
        codigoQr: codigoUnicoAgrak,
        empresaRut: empresaActiva,
        contratista: procedencia,
        trabajadores: trabajadoresData,
        creadoEn: serverTimestamp()
      });

      toast.success("Cuadrilla creada exitosamente.");
      setNombreCuadrilla("");
      setSeleccionados([]);
      setBusqueda("");
    } catch (error) {
      toast.error("Error al crear la cuadrilla.");
      console.error(error);
    }
    setProcesando(false);
  };

  const eliminarCuadrilla = async (id) => {
    if (!window.confirm("¿Seguro que deseas desarmar y eliminar esta cuadrilla?")) return;
    try {
      await deleteDoc(doc(db, "cuadrillas", id));
      toast.success("Cuadrilla eliminada.");
    } catch (error) {
      toast.error("Error al eliminar.");
    }
  };

  // 🔥 FORMATO TIPO CREDENCIAL OFICIAL (100x70mm) - UNA SOLA HOJA 🔥
  const imprimirQR = async (cuadrilla) => {
    const toastId = toast.loading("Generando credencial...");
    try {
      const qrDataUrl = await QRCode.toDataURL(cuadrilla.codigoQr, { width: 300, margin: 0, color: { dark: "#000000", light: "#ffffff" } });
      const empName = empresasMaestras.find(e => e.rut === cuadrilla.empresaRut)?.nombre.replace(" SPA", "") || "";
      
      const logoPath = cuadrilla.empresaRut === "79.737.880-1" ? "/convento.png" : cuadrilla.empresaRut === "76.064.746-2" ? "/torretagle.png" : "";
      const logoImg = logoPath ? `<img src="${window.location.origin}${logoPath}" style="height:9mm;object-fit:contain;" />` : '';

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Credencial Cuadrilla</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            @page { size: 100mm 70mm; margin: 0; padding: 0; }
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #fff; color: #000; width: 100mm; }
            
            @media print {
              html, body { width: 100mm !important; height: auto !important; margin: 0; padding: 0; overflow: visible !important; }
              .label { height: 70mm !important; overflow: hidden !important; border: none !important; margin: 0 !important; page-break-after: always !important; }
            }
            
            .label { 
              width: 100mm; height: 70mm; padding: 4mm; 
              display: flex; flex-direction: column; justify-content: space-between;
              background: #fff; overflow: hidden; border: 1px dashed #ccc;
            }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 2mm; margin-bottom: 2mm; }
            .header-text { text-align: right; }
            .h-type { font-size: 8pt; font-weight: bold; color: #555; letter-spacing: 1px; }
            .h-emp { font-size: 11pt; font-weight: 900; text-transform: uppercase; }
            
            .body-row { display: flex; flex-direction: row; align-items: center; justify-content: space-between; flex-grow: 1; }
            .info-col { flex: 1; display: flex; flex-direction: column; gap: 3mm; padding-right: 3mm; }
            .lbl { font-size: 7pt; font-weight: bold; border-bottom: 1px solid #000; text-transform: uppercase; margin-bottom: 1px; }
            .val-big { font-size: 14pt; font-weight: 900; text-transform: uppercase; line-height: 1; }
            .val-sub { font-size: 10pt; font-weight: bold; text-transform: uppercase; color: #222; }
            
            .qr-col { border: 2px solid #000; border-radius: 2mm; padding: 2mm; display: flex; flex-direction: column; align-items: center; background: #fff; }
            .qr-img { width: 33mm; height: 33mm; object-fit: contain; }
            .qr-txt { font-size: 12pt; font-weight: 900; margin-top: 1mm; letter-spacing: 0.5px; }
            
            .footer { text-align: center; font-size: 7pt; font-weight: bold; border-top: 1px solid #000; padding-top: 1mm; margin-top: 2mm; }
          </style>
        </head>
        <body>
          
          <div class="label">
            <div class="header">
              ${logoImg}
              <div class="header-text">
                <div class="h-type">CREDENCIAL DE CUADRILLA</div>
                <div class="h-emp">${empName}</div>
              </div>
            </div>
            
            <div class="body-row">
              <div class="info-col">
                <div>
                  <div class="lbl">Nombre del Grupo</div>
                  <div class="val-big">${cuadrilla.nombre}</div>
                </div>
                <div>
                  <div class="lbl">Contratista / Origen</div>
                  <div class="val-sub">${cuadrilla.contratista || 'MIXTO'}</div>
                </div>
                <div>
                  <div class="lbl">Total Integrantes</div>
                  <div class="val-sub">${cuadrilla.trabajadores.length} PERSONAS</div>
                </div>
              </div>
              <div class="qr-col">
                <img class="qr-img" src="${qrDataUrl}" />
                <div class="qr-txt">${cuadrilla.codigoQr}</div>
              </div>
            </div>
            
            <div class="footer">CÓDIGO VÁLIDO PARA LECTURA EN APP AGRAK</div>
          </div>

        </body>
        </html>
      `;

      const printFrame = document.createElement("iframe");
      printFrame.style.position = "absolute"; printFrame.style.width = "0px"; printFrame.style.height = "0px"; printFrame.style.border = "none";
      document.body.appendChild(printFrame);
      const docFrame = printFrame.contentWindow.document;
      docFrame.open(); docFrame.write(html); docFrame.close();
      
      setTimeout(() => {
        toast.dismiss(toastId); toast.success("Impresión de credencial enviada.");
        printFrame.contentWindow.focus(); printFrame.contentWindow.print();
        setTimeout(() => document.body.removeChild(printFrame), 1000);
      }, 1000);

    } catch (error) {
      toast.dismiss(toastId); toast.error("Error al imprimir.");
    }
  };

  const trabajadoresFiltrados = workersList.filter(w => {
    if (!empresaActiva) return false;
    if (w.empresaRut !== empresaActiva) return false;
    if (w.estado !== "Activo") return false;
    
    if (contratistaActivo === "PLANTA") {
      if (w.contratista && w.contratista.trim() !== "") return false;
    } else if (contratistaActivo !== "") {
      if (w.contratista !== contratistaActivo) return false;
    }

    if (busqueda && !w.nombre.toLowerCase().includes(busqueda.toLowerCase()) && !w.rut.includes(busqueda)) return false;
    
    return true;
  });

  const cuadrillasVisibles = cuadrillas.filter(c => {
    if (!empresaActiva) return true;
    return c.empresaRut === empresaActiva;
  });

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
      
      <div style={{ background: "#fff", padding: "15px 20px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
        <h3 style={{ margin: 0, color: "#101c38" }}>Gestión de Cuadrillas (Grupos de Trabajo)</h3>
        <p style={{ margin: "5px 0 0 0", fontSize: "13px", color: "#64748b" }}>Crea grupos para escanear un solo QR en Agrak y asignar el rendimiento a múltiples personas.</p>
      </div>

      <div style={{ background: "#f8fafc", padding: "15px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "15px" }}>
        <div style={{ fontWeight: "bold", color: "#1e293b", fontSize: "14px" }}>
          EMPRESA DE TRABAJO:
        </div>
        
        {userEmpresa === "TODAS" ? (
          <select 
            value={empresaActiva} 
            onChange={e => handleEmpresaChange(e.target.value)} 
            style={{ flex: 1, maxWidth: "400px", padding: "10px", borderRadius: "6px", border: "2px solid #001254", fontWeight: "bold", outline: "none", color: "#001254" }}
          >
            <option value="">-- Selecciona la empresa para operar --</option>
            {empresasMaestras.map(emp => <option key={emp.rut} value={emp.rut}>🏢 {emp.nombre}</option>)}
          </select>
        ) : (
          <div style={{ padding: "10px 15px", background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", borderRadius: "6px", fontWeight: "bold", fontSize: "14px" }}>
            🏢 {empresasMaestras.find(e => e.rut === userEmpresa)?.nombre || "Tu Empresa"}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap", opacity: empresaActiva ? 1 : 0.4, pointerEvents: empresaActiva ? "auto" : "none", transition: "opacity 0.3s" }}>
        
        {/* FORMULARIO DE CREACIÓN */}
        <div className="form-card" style={{ flex: 1, minWidth: "350px", position: "sticky", top: "20px" }}>
          <h4 style={{ marginBottom: "15px", color: "#0f172a" }}>Armar Nueva Cuadrilla</h4>

          <div style={{ marginBottom: "15px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "5px", color: "#475569" }}>NOMBRE DE LA CUADRILLA *</label>
            <input 
              value={nombreCuadrilla} 
              onChange={e => setNombreCuadrilla(e.target.value)} 
              placeholder="Ej: CUADRILLA PODA NORTE" 
              style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: "bold" }}
            />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "5px", color: "#475569" }}>ASIGNAR A CONTRATISTA (Opcional)</label>
            <select 
              value={contratistaActivo} 
              onChange={e => handleContratistaChange(e.target.value)} 
              style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: "bold", outline: "none", color: contratistaActivo ? "#b45309" : "#0f172a" }}
            >
              <option value="">-- Ver todos los trabajadores (Mixto) --</option>
              <option value="PLANTA">🏢 SOLO PERSONAL DE PLANTA</option>
              {contratistasDisponibles.map(c => <option key={c} value={c}>👷 {c}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <label style={{ fontSize: "12px", fontWeight: "bold", color: "#475569" }}>INTEGRANTES ({seleccionados.length})</label>
            <input 
              value={busqueda} 
              onChange={e => setBusqueda(e.target.value)} 
              placeholder="🔍 Buscar..." 
              style={{ width: "50%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px" }}
            />
          </div>

          <div style={{ height: "300px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#f8fafc", padding: "10px", display: "flex", flexDirection: "column", gap: "5px" }}>
            {!empresaActiva ? (
              <div style={{ textAlign: "center", color: "#94a3b8", marginTop: "20px", fontSize: "14px" }}>
                👆 Selecciona una empresa arriba.
              </div>
            ) : trabajadoresFiltrados.length === 0 ? (
              <div style={{ textAlign: "center", color: "#94a3b8", marginTop: "20px" }}>No hay trabajadores activos bajo estos filtros.</div>
            ) : (
              trabajadoresFiltrados.map(w => {
                const isSelected = seleccionados.includes(w.rut);
                return (
                  <div 
                    key={w.rut}
                    onClick={() => toggleTrabajador(w.rut)}
                    style={{ 
                      padding: "8px 12px", borderRadius: "6px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: isSelected ? "#e0f2fe" : "#fff", border: isSelected ? "1px solid #3b82f6" : "1px solid #e2e8f0", transition: "0.2s"
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: "bold", color: isSelected ? "#0369a1" : "#334155", fontSize: "13px" }}>{w.nombre}</div>
                      <div style={{ fontSize: "11px", color: "#64748b", fontFamily: "monospace" }}>{w.rut}</div>
                    </div>
                    {isSelected && <span style={{ color: "#0284c7", fontWeight: "bold" }}>✔️</span>}
                  </div>
                );
              })
            )}
          </div>

          <button 
            onClick={guardarCuadrilla} 
            disabled={procesando || !empresaActiva} 
            style={{ width: "100%", padding: "12px", marginTop: "15px", background: "#101c38", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer", opacity: (!empresaActiva) ? 0.5 : 1 }}
          >
            {procesando ? "Guardando..." : "💾 Guardar Cuadrilla"}
          </button>
        </div>

        {/* LISTADO DE CUADRILLAS CREADAS */}
        <div className="form-card" style={{ flex: 1.5, minWidth: "350px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
            <h4 style={{ margin: 0, color: "#0f172a" }}>Cuadrillas Registradas</h4>
            <div style={{ background: "#e2e8f0", color: "#334155", padding: "4px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: "bold" }}>
              Total: {cuadrillasVisibles.length}
            </div>
          </div>
          
          {!empresaActiva ? (
            <div className="empty-state"><p>Esperando selección de empresa...</p></div>
          ) : cuadrillasVisibles.length === 0 ? (
            <div className="empty-state"><p>No hay cuadrillas registradas para esta empresa.</p></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              {cuadrillasVisibles.map(c => {
                const isConvento = c.empresaRut === "79.737.880-1";
                const isTorretagle = c.empresaRut === "76.064.746-2";
                const empAsociada = empresasMaestras.find(e => e.rut === c.empresaRut);

                return (
                  <div key={c.id} style={{ border: "1px solid #cbd5e1", borderRadius: "8px", background: "#fff", padding: "15px" }}>
                    
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px", marginBottom: "10px" }}>
                      <div>
                        {userEmpresa === "TODAS" && (
                          <span style={{
                            background: isConvento ? "#e0f2fe" : isTorretagle ? "#dcfce7" : "#f1f5f9",
                            color: isConvento ? "#0369a1" : isTorretagle ? "#166534" : "#475569",
                            border: "1px solid", borderColor: isConvento ? "#bae6fd" : isTorretagle ? "#bbf7d0" : "#cbd5e1",
                            padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold", marginBottom: "5px", display: "inline-block"
                          }}>
                            {empAsociada ? empAsociada.nombre.replace("AGRICOLA ", "").replace(" SPA", "") : "Desconocida"}
                          </span>
                        )}
                        
                        <div style={{ fontSize: "16px", fontWeight: "bold", color: "#0f172a" }}>{c.nombre}</div>
                        
                        {c.contratista && c.contratista !== "MIXTO" && (
                          <div style={{ fontSize: "11px", fontWeight: "bold", color: "#b45309", marginTop: "3px" }}>
                            {c.contratista === "PERSONAL DE PLANTA" ? "🏢 " : "👷 "}{c.contratista}
                          </div>
                        )}

                        <div style={{ display: "inline-block", background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", padding: "2px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "900", fontFamily: "monospace", marginTop: "8px" }}>
                          QR: {c.codigoQr}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "5px" }}>
                        <button onClick={() => imprimirQR(c)} title="Imprimir Credencial" style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "13px", color: "#0f172a" }}>🖨️ Imprimir</button>
                        <button onClick={() => eliminarCuadrilla(c.id)} title="Eliminar Cuadrilla" style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "6px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>🗑️</button>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "11px", fontWeight: "bold", color: "#64748b", marginBottom: "5px" }}>{c.trabajadores.length} INTEGRANTES:</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                        {c.trabajadores.map(t => (
                          <span key={t.rut} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: "11px", padding: "2px 6px", borderRadius: "4px", color: "#475569" }}>
                            {t.nombre}
                          </span>
                        ))}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}