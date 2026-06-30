import React, { useState } from "react";
import toast from "react-hot-toast";
import { EMPRESAS_MAESTRAS } from "../utils/helpers";

const EMPTY_FORM = { campo: "", centro: "", corte: "", superficie: "", especie: "", variedad: "", codigoUnico: "", descripcion: "", empresaRut: "" };

const DEFAULT_CATALOG = {
  "VID DE MESA": ["AUTUMN CRISP", "RED GLOBE", "CRIMSON SEEDLESS", "THOMPSON SEEDLESS", "SWEET GLOBE", "ALLISON", "TIMCO", "SCARLOTTA"],
  "NARANJA": ["CARA CARA", "NAVEL", "FUKUMOTO", "LANE LATE", "VALENCIA"],
  "MANDARINA": ["W. MURCOTT", "TANGO", "CLEMENULES", "OROGRANDE"],
  "LIMON": ["EUREKA", "MESSINA", "FINO 49", "GENOVA"],
  "CEREZA": ["SANTINA", "LAPINS", "REGINA", "BING", "SWEETHEART", "ROYAL DAWN"],
  "DAMASCO": ["MIRANDELA", "CASTLEBRITE", "DINA", "KATY"],
  "CIRUELA": ["ANGELENO", "BLACK AMBER", "LARRY ANN"],
  "NOGAL": ["CHANDLER", "SERR"],
  "ALMENDRO": ["NONPAREIL", "CARMEL"],
  "MANZANA": ["ROYAL GALA", "FUJI", "GRANNY SMITH", "PINK LADY"],
  "PERA": ["PACKHAMS", "ABATE FETEL"],
  "KIWI": ["HAYWARD", "DORI"],
  "PALTO": ["HASS", "EDRANOL", "FUERTE"]
};

export default function CamposManager({ camposList, onSave, onBulkUpload, onDelete, loading, empresasMaestras, userEmpresa }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  
  const [isBulk, setIsBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [empresaDestinoBulk, setEmpresaDestinoBulk] = useState(userEmpresa !== "TODAS" ? userEmpresa : "");

  const [filtroEmpresaTabla, setFiltroEmpresaTabla] = useState(userEmpresa !== "TODAS" ? userEmpresa : "");
  // 🔥 El orden por defecto es 'campo' de forma ascendente
  const [sortConfig, setSortConfig] = useState({ key: 'campo', direction: 'asc' });

  const [inputManualEspecie, setInputManualEspecie] = useState(false);
  const [inputManualVariedad, setInputManualVariedad] = useState(false);

  const [expandedGroups, setExpandedGroups] = useState({});

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const resetManualInputs = () => {
    setInputManualEspecie(false);
    setInputManualVariedad(false);
  };

  const handleSubmit = () => {
    if (!form.campo || !form.centro || !form.codigoUnico) {
      toast.error("Campo, Cuartel y Código Único son obligatorios.");
      return;
    }
    if (userEmpresa === "TODAS" && !form.empresaRut) {
      toast.error("Selecciona la empresa.");
      return;
    }

    const finalForm = {
      ...form,
      corte: form.corte.trim().toUpperCase(),
      superficie: form.superficie.trim(),
      codigoUnico: form.codigoUnico.trim(),
      descripcion: form.descripcion.trim()
    };

    onSave(finalForm, editId);
    setForm(EMPTY_FORM);
    setEditId(null);
    resetManualInputs();
  };

  const handleEdit = (item) => {
    setIsBulk(false);
    resetManualInputs();
    setForm({
      campo: item.campo || "",
      centro: item.centro || "",
      corte: item.corte || "",
      superficie: item.superficie || "",
      especie: item.especie || "",
      variedad: item.variedad || "",
      codigoUnico: item.codigoUnico || "",
      descripcion: item.descripcion || "",
      empresaRut: item.empresaRut || ""
    });
    setEditId(item.id);
    if (item.empresaRut) setFiltroEmpresaTabla(item.empresaRut);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleAddCorte = (item) => {
    setIsBulk(false);
    resetManualInputs();

    setForm({
      campo: item.campo || "",
      centro: item.centro || "",
      corte: "", 
      superficie: "", 
      especie: item.especie || "",
      variedad: item.variedad || "",
      codigoUnico: item.codigoUnico || "", 
      descripcion: item.descripcion || "",
      empresaRut: item.empresaRut || ""
    });
    setEditId(null); 
    if (item.empresaRut) setFiltroEmpresaTabla(item.empresaRut);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.success(`Añadiendo corte al Centro de Costo: ${item.centro}`);
  };

  const handleBulkSubmit = () => {
    if (userEmpresa === "TODAS" && !empresaDestinoBulk) {
      toast.error("Selecciona a qué empresa pertenecen estos cuarteles.");
      return;
    }
    if (!bulkText.trim()) return;

    const lines = bulkText.split("\n").map(l => l.trim()).filter(l => l !== "");
    const newItems = [];

    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(/[,\t]/).map(p => p.trim());
      
      if (parts.length >= 2) {
        let campo = parts[0]?.toUpperCase() || "";
        let centro = parts[1]?.toUpperCase() || "";
        let corte = parts[2]?.toUpperCase() || "";
        let superficie = parts[3] || "";
        let especie = (parts[4] || "").toUpperCase();
        let variedad = (parts[5] || "").toUpperCase();
        let codigoManual = (parts[6] || "").toUpperCase(); 
        let descripcion = (parts[7] || ""); 
        
        if (!codigoManual) {
          toast.error(`Falta el Código Único en la línea ${i + 1} del Excel.`);
          return;
        }

        if (campo && centro) {
          newItems.push({ 
            campo, centro, corte, superficie, especie, variedad, codigoUnico: codigoManual, descripcion,
            empresaRut: userEmpresa !== "TODAS" ? userEmpresa : empresaDestinoBulk 
          });
        }
      }
    }

    if (newItems.length === 0) return toast.error("Formato incorrecto. Revisa las columnas.");
    onBulkUpload(newItems);
    setBulkText("");
    setIsBulk(false);
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const filteredCampos = [...camposList].filter(item => {
    if (filtroEmpresaTabla === "") return false;
    return filtroEmpresaTabla === "TODAS" || item.empresaRut === filtroEmpresaTabla;
  });

  const groupsObj = filteredCampos.reduce((acc, item) => {
    const key = `${item.empresaRut}_${item.campo}_${item.centro}`;
    if (!acc[key]) {
      acc[key] = {
        id: key,
        empresaRut: item.empresaRut,
        campo: item.campo,
        centro: item.centro,
        items: [],
        baseItem: null, 
        sumCortes: 0
      };
    }
    acc[key].items.push(item);
    
    const isBase = !item.corte || item.corte.trim() === "";
    if (isBase && !acc[key].baseItem) {
      acc[key].baseItem = item; 
    } else if (!isBase) {
      const supVal = parseFloat(item.superficie);
      if (!isNaN(supVal)) acc[key].sumCortes += supVal;
    }
    
    return acc;
  }, {});

  // 🔥 MOTOR DE ORDENAMIENTO MULTINIVEL 🔥
  const sortedGroups = Object.values(groupsObj).sort((a, b) => {
    let valA = a[sortConfig.key] || "";
    let valB = b[sortConfig.key] || "";

    if (sortConfig.key === 'empresaRut') {
      const empA = EMPRESAS_MAESTRAS.find(e => e.rut === a.empresaRut);
      const empB = EMPRESAS_MAESTRAS.find(e => e.rut === b.empresaRut);
      valA = empA ? empA.nombre : a.empresaRut;
      valB = empB ? empB.nombre : b.empresaRut;
    }
    
    if (sortConfig.key === 'superficie') {
      const getSup = (g) => g.baseItem && parseFloat(g.baseItem.superficie) ? parseFloat(g.baseItem.superficie) : g.sumCortes;
      const numA = getSup(a);
      const numB = getSup(b);
      if (numA !== numB) {
        return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
      }
    } else {
      if (sortConfig.key === 'codigoUnico' || sortConfig.key === 'corte' || sortConfig.key === 'descripcion') {
        valA = a.items[0]?.[sortConfig.key] || "";
        valB = b.items[0]?.[sortConfig.key] || "";
      }

      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    }

    // 🔥 DESEMPATE 1: Ordenar alfabéticamente por Campo
    const campoA = String(a.campo || "").toLowerCase();
    const campoB = String(b.campo || "").toLowerCase();
    if (campoA < campoB) return -1;
    if (campoA > campoB) return 1;

    // 🔥 DESEMPATE 2: Ordenar alfabéticamente por Centro de Costo
    const centroA = String(a.centro || "").toLowerCase();
    const centroB = String(b.centro || "").toLowerCase();
    if (centroA < centroB) return -1;
    if (centroA > centroB) return 1;

    return 0;
  });

  // 🔥 ORDENAMOS LOS CORTES INTERNOS (Hijos) ALFABÉTICAMENTE 🔥
  sortedGroups.forEach(group => {
    group.items.sort((a, b) => {
      // El registro base (si existe) siempre va primero
      if (group.baseItem) {
        if (a.id === group.baseItem.id) return -1;
        if (b.id === group.baseItem.id) return 1;
      }
      // Los cortes restantes se ordenan A-Z
      const corteA = String(a.corte || "").toLowerCase();
      const corteB = String(b.corte || "").toLowerCase();
      if (corteA < corteB) return -1;
      if (corteA > corteB) return 1;
      return 0;
    });
  });

  const toggleGroup = (id) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderSortIcon = (colName) => {
    if (sortConfig.key === colName) return sortConfig.direction === 'asc' ? ' 🔼' : ' 🔽';
    return <span style={{ opacity: 0.3 }}> ↕️</span>;
  };

  const catalog = JSON.parse(JSON.stringify(DEFAULT_CATALOG));
  camposList.forEach(c => {
    if (c.empresaRut === form.empresaRut || !form.empresaRut) {
      if (c.especie) {
        const esp = c.especie.toUpperCase();
        const var_ = (c.variedad || "").toUpperCase();
        if (!catalog[esp]) catalog[esp] = [];
        if (var_ && !catalog[esp].includes(var_)) catalog[esp].push(var_);
      }
    }
  });

  const especiesDisponibles = Object.keys(catalog).sort();
  const variedadesDisponibles = (form.especie && catalog[form.especie]) ? [...catalog[form.especie]].sort() : [];

  const selectStyle = {
    width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", 
    fontSize: "14px", backgroundColor: "#fff", outline: "none", fontWeight: "bold", color: "#0f172a"
  };

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", padding: "15px 20px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
        <div>
          <h3 style={{ margin: 0, color: "#101c38" }}>Gestión de Cuarteles y C. Costo</h3>
          <p style={{ margin: "5px 0 0 0", fontSize: "13px", color: "#64748b" }}>Define tus cuarteles, cortes y hectáreas.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button 
            onClick={() => { setIsBulk(false); setEditId(null); setForm(EMPTY_FORM); resetManualInputs(); }} 
            style={{ padding: "8px 16px", borderRadius: "6px", fontWeight: "bold", border: "none", cursor: "pointer", background: !isBulk ? "#b45309" : "#e2e8f0", color: !isBulk ? "#fff" : "#475569" }}
          >
            ✏️ Manual
          </button>
          <button 
            onClick={() => { setIsBulk(true); resetManualInputs(); }} 
            style={{ padding: "8px 16px", borderRadius: "6px", fontWeight: "bold", border: "none", cursor: "pointer", background: isBulk ? "#101c38" : "#e2e8f0", color: isBulk ? "#fff" : "#475569" }}
          >
            📋 Pegar Excel
          </button>
        </div>
      </div>

      {isBulk ? (
        <div className="form-card" style={{ width: "100%", maxWidth: "100%" }}>
          <h3 className="form-title">Pegado Masivo de Cuarteles</h3>
          <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "15px" }}>
            Asegúrate de copiar <b>exactamente 8 columnas</b> desde tu Excel (deja las celdas en blanco si no aplican): <br/>
            <span style={{ color: "#b45309", fontWeight: "bold", fontFamily: "monospace" }}>Campo | C.Costo | Corte | Sup(Ha) | Especie | Variedad | CÓDIGO ÚNICO | Desc.</span>
          </p>

          <div className="form-grid" style={{ background: "#f8fafc", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            {userEmpresa === "TODAS" && (
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label>Asignar todos estos cuarteles a la Empresa: *</label>
                <select 
                  value={empresaDestinoBulk} 
                  onChange={e => {
                    setEmpresaDestinoBulk(e.target.value);
                    if (e.target.value) setFiltroEmpresaTabla(e.target.value);
                  }} 
                  style={{ fontWeight: "bold", borderColor: "#b45309" }}
                >
                  <option value="">Selecciona una empresa...</option>
                  {empresasMaestras.map(emp => <option key={emp.rut} value={emp.rut}>🏢 {emp.nombre}</option>)}
                </select>
              </div>
            )}

            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <textarea
                rows={10}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="CARMEN ROSA&#9;ACS 22 CR&#9;C1&#9;2.35&#9;VID DE MESA&#9;AUTUMN CRISP&#9;ACS22CR&#9;Sector Norte&#10;CARMEN ROSA&#9;ACS 22 CR&#9;C2&#9;0.35&#9;VID DE MESA&#9;AUTUMN CRISP&#9;ACS22CR&#9;Sector Sur"
                style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontFamily: "monospace", whiteSpace: "pre" }}
              />
            </div>

            <div className="form-group" style={{ gridColumn: "1 / -1", display: "flex", gap: "10px", marginTop: "10px" }}>
              <button className="btn-secondary" onClick={() => { setIsBulk(false); setBulkText(""); }} style={{ width: "30%" }}>Cancelar</button>
              <button className="btn-primary" onClick={handleBulkSubmit} disabled={loading || !bulkText.trim()} style={{ flexGrow: 1, background: "#101c38" }}>
                {loading ? "Procesando Excel..." : "📤 Guardar Lista de Cuarteles"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="form-card" style={{ width: "100%", maxWidth: "100%" }}>
          <h3 className="form-title">{editId ? "Editar Cuartel y Superficie" : "Registrar Nuevo Cuartel / Corte"}</h3>
          
          <div className="form-grid" style={{ background: "#f8fafc", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            {userEmpresa === "TODAS" && (
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label>Empresa Asociada *</label>
                <select 
                  value={form.empresaRut} 
                  onChange={e => {
                    set("empresaRut", e.target.value);
                    if (e.target.value) setFiltroEmpresaTabla(e.target.value);
                  }} 
                  style={{ fontWeight: "bold" }}
                >
                  <option value="">Selecciona una empresa...</option>
                  {empresasMaestras.map(emp => <option key={emp.rut} value={emp.rut}>🏢 {emp.nombre}</option>)}
                </select>
              </div>
            )}

            <div className="form-group">
              <label>Fundo / Campo *</label>
              <input value={form.campo} onChange={e => set("campo", e.target.value.toUpperCase())} placeholder="Ej: CARMEN ROSA" />
            </div>
            <div className="form-group">
              <label>Centro de Costo Base *</label>
              <input value={form.centro} onChange={e => set("centro", e.target.value.toUpperCase())} placeholder="Ej: ACS 22 CR" />
            </div>

            <div className="form-group">
              <label>Corte / Sub-cuartel (Opcional)</label>
              <input value={form.corte} onChange={e => set("corte", e.target.value.toUpperCase())} placeholder="Ej: C1" style={{borderColor: "#3b82f6"}} />
            </div>
            <div className="form-group">
              <label>Superficie (Hectáreas)</label>
              <input type="number" step="0.01" value={form.superficie} onChange={e => set("superficie", e.target.value)} placeholder="Ej: 2.35" style={{borderColor: "#3b82f6"}} />
            </div>
            
            <div className="form-group">
              <label>Especie Principal</label>
              {!inputManualEspecie ? (
                <select
                  style={selectStyle}
                  value={form.especie}
                  onChange={(e) => {
                    if (e.target.value === "NUEVA") {
                      setInputManualEspecie(true);
                      set("especie", "");
                      set("variedad", "");
                    } else {
                      set("especie", e.target.value);
                      set("variedad", "");
                    }
                  }}
                >
                  <option value="">-- No especificar --</option>
                  {especiesDisponibles.map(e => <option key={e} value={e}>{e}</option>)}
                  <option value="NUEVA" style={{ fontWeight: "bold", color: "#b45309" }}>➕ AGREGAR NUEVA ESPECIE...</option>
                </select>
              ) : (
                <div style={{ display: "flex", gap: "5px" }}>
                  <input autoFocus value={form.especie} onChange={e => set("especie", e.target.value.toUpperCase())} placeholder="Escriba la especie..." style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
                  <button className="btn-secondary" title="Volver a la lista" style={{ padding: "0 15px", fontSize: "18px" }} onClick={() => { setInputManualEspecie(false); set("especie", ""); }}>🔙</button>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Variedad</label>
              {!inputManualVariedad ? (
                <select
                  style={selectStyle}
                  value={form.variedad}
                  onChange={(e) => {
                    if (e.target.value === "NUEVA") {
                      setInputManualVariedad(true);
                      set("variedad", "");
                    } else {
                      set("variedad", e.target.value);
                    }
                  }}
                  disabled={!form.especie && !inputManualEspecie}
                >
                  <option value="">{form.especie ? "-- Sin variedad / Genérico --" : "Primero seleccione Especie"}</option>
                  {variedadesDisponibles.map(v => <option key={v} value={v}>{v}</option>)}
                  {form.especie && <option value="NUEVA" style={{ fontWeight: "bold", color: "#b45309" }}>➕ AGREGAR NUEVA VARIEDAD...</option>}
                </select>
              ) : (
                <div style={{ display: "flex", gap: "5px" }}>
                  <input autoFocus value={form.variedad} onChange={e => set("variedad", e.target.value.toUpperCase())} placeholder="Escriba la variedad..." style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }} />
                  <button className="btn-secondary" title="Volver a la lista" style={{ padding: "0 15px", fontSize: "18px" }} onClick={() => { setInputManualVariedad(false); set("variedad", ""); }}>🔙</button>
                </div>
              )}
            </div>
            
            <div className="form-group">
              <label>Código Único Identificador (Del Centro de Costo) *</label>
              <input 
                value={form.codigoUnico} 
                onChange={e => set("codigoUnico", e.target.value.toUpperCase().replace(/\s+/g, '-'))} 
                placeholder="Ej: ACS22CR" 
                style={{ fontFamily: "monospace", color: "#0f172a", borderColor: form.codigoUnico ? "#16a34a" : "#cbd5e1" }}
              />
            </div>
            <div className="form-group">
              <label>Descripción (Opcional)</label>
              <input 
                value={form.descripcion} 
                onChange={e => set("descripcion", e.target.value)} 
                placeholder="Detalles, año plantación..." 
              />
            </div>

            <div className="form-group" style={{ gridColumn: "1 / -1", display: "flex", gap: "10px", marginTop: "10px" }}>
              {editId && <button className="btn-secondary" onClick={() => { setForm(EMPTY_FORM); setEditId(null); resetManualInputs(); }} style={{ width: "30%" }}>Cancelar</button>}
              <button className="btn-primary" onClick={handleSubmit} disabled={loading} style={{ flexGrow: 1, background: "#b45309" }}>
                {loading ? "Guardando..." : editId ? "🔄 Actualizar Datos" : "➕ Registrar Cuartel / Corte"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 FILTRO Y TABLA MAESTRA 🔥 */}
      <div className="form-card" style={{ width: "100%", maxWidth: "100%" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "15px" }}>
          <div>
            <h3 className="form-title" style={{ marginBottom: "0" }}>Listado Maestro de Cuarteles y Cultivos</h3>
            <p style={{ color: "#64748b", fontSize: "14px", margin: "5px 0 0 0" }}>Total registros: {filteredCampos.length} ({sortedGroups.length} Centros de Costo)</p>
          </div>
          
          {userEmpresa === "TODAS" && (
            <div style={{ width: "250px" }}>
              <select 
                value={filtroEmpresaTabla} 
                onChange={e => setFiltroEmpresaTabla(e.target.value)} 
                style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "2px solid #b45309", fontWeight: "bold", outline: "none", backgroundColor: "#fff" }}
              >
                <option value="">Seleccione Empresa...</option>
                <option value="TODAS">Todas las Empresas</option>
                {empresasMaestras.map(emp => <option key={emp.rut} value={emp.rut}>{emp.nombre}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="table-wrap">
          <table className="workers-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('empresaRut')} style={{ cursor: "pointer", userSelect: "none" }}>Empresa{renderSortIcon('empresaRut')}</th>
                <th onClick={() => handleSort('codigoUnico')} style={{ cursor: "pointer", userSelect: "none" }}>Código{renderSortIcon('codigoUnico')}</th>
                <th onClick={() => handleSort('campo')} style={{ cursor: "pointer", userSelect: "none" }}>Campo{renderSortIcon('campo')}</th>
                <th onClick={() => handleSort('centro')} style={{ cursor: "pointer", userSelect: "none" }}>C. Costo{renderSortIcon('centro')}</th>
                <th style={{ cursor: "pointer", userSelect: "none", textAlign: "center" }}>Desglose de Cortes</th>
                <th onClick={() => handleSort('superficie')} style={{ cursor: "pointer", userSelect: "none" }}>Sup.(Ha){renderSortIcon('superficie')}</th>
                <th onClick={() => handleSort('especie')} style={{ cursor: "pointer", userSelect: "none" }}>Especie{renderSortIcon('especie')}</th>
                <th onClick={() => handleSort('variedad')} style={{ cursor: "pointer", userSelect: "none" }}>Variedad{renderSortIcon('variedad')}</th>
                <th style={{textAlign: "center"}}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sortedGroups.map(group => {
                const hasMultiple = group.items.length > 1;
                const empAsociada = EMPRESAS_MAESTRAS.find(e => e.rut === group.empresaRut);
                const isConvento = group.empresaRut === "79.737.880-1";
                const isTorretagle = group.empresaRut === "76.064.746-2";
                
                const badgeEmpresa = (
                  <span style={{
                    background: isConvento ? "#e0f2fe" : isTorretagle ? "#dcfce7" : "#f1f5f9",
                    color: isConvento ? "#0369a1" : isTorretagle ? "#166534" : "#475569",
                    border: "1px solid",
                    borderColor: isConvento ? "#bae6fd" : isTorretagle ? "#bbf7d0" : "#cbd5e1",
                    padding: "4px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: "bold", whiteSpace: "nowrap"
                  }}>
                    {empAsociada ? empAsociada.nombre.replace("AGRICOLA ", "").replace(" SPA", "") : "Desconocida"}
                  </span>
                );

                if (!hasMultiple) {
                  const item = group.items[0];
                  return (
                    <tr key={item.id}>
                      <td>{badgeEmpresa}</td>
                      <td className="cell-mono" style={{ fontSize: "11px", color: "#16a34a", fontWeight: "bold" }}>{item.codigoUnico || "—"}</td>
                      <td style={{fontWeight: "bold", fontSize: "12px"}}>{item.campo}</td>
                      <td className="cell-mono" style={{fontWeight: "900", fontSize: "12px"}}>{item.centro}</td>
                      <td style={{ fontWeight: "bold", color: "#3b82f6", fontSize: "12px", textAlign: "center" }}>{item.corte || "ÚNICO"}</td>
                      <td style={{ fontWeight: "bold", fontSize: "12px" }}>{item.superficie || "—"}</td>
                      <td style={{fontSize: "12px"}}>{item.especie || "—"}</td>
                      <td style={{fontSize: "12px"}}>{item.variedad || "—"}</td>
                      <td style={{textAlign: "center", whiteSpace: "nowrap"}}>
                        <button className="btn-action" onClick={() => handleAddCorte(item)} title="Añadir nuevo corte a este Centro de Costo">➕</button>
                        <button className="btn-action" onClick={() => handleEdit(item)} title="Editar">✏️</button>
                        <button className="btn-action btn-action-warn" onClick={() => onDelete(item.id)} title="Eliminar">🗑️</button>
                      </td>
                    </tr>
                  );
                }

                const isExpanded = expandedGroups[group.id];
                
                let parentSup = "—";
                if (group.baseItem && group.baseItem.superficie) {
                  parentSup = parseFloat(group.baseItem.superficie).toFixed(2);
                } else if (group.sumCortes > 0) {
                  parentSup = group.sumCortes.toFixed(2);
                }

                let parentCodigo = "—";
                if (group.baseItem && group.baseItem.codigoUnico) {
                  parentCodigo = group.baseItem.codigoUnico;
                } else if (group.items[0].codigoUnico) {
                  parentCodigo = group.items[0].codigoUnico;
                }

                const childrenItems = group.baseItem ? group.items.filter(i => i.id !== group.baseItem.id) : group.items;
                const parentItem = group.baseItem || group.items[0];

                return (
                  <React.Fragment key={group.id}>
                    <tr style={{ background: isExpanded ? "#e2e8f0" : "#f8fafc", borderTop: "2px solid #cbd5e1" }}>
                      <td>{badgeEmpresa}</td>
                      <td className="cell-mono" style={{ fontSize: "11px", color: "#16a34a", fontWeight: "bold" }}>{parentCodigo}</td>
                      <td style={{fontWeight: "bold", fontSize: "12px"}}>{parentItem.campo}</td>
                      <td className="cell-mono" style={{fontWeight: "900", fontSize: "12px", color: "#0f172a"}}>{parentItem.centro}</td>
                      <td style={{ textAlign: "center" }}>
                        <button 
                          onClick={() => toggleGroup(group.id)}
                          style={{ background: "#fff", border: "1px solid #94a3b8", borderRadius: "4px", padding: "4px 8px", cursor: "pointer", fontWeight: "bold", fontSize: "11px", color: "#3b82f6", width: "100%" }}
                        >
                          📑 {childrenItems.length} Cortes {isExpanded ? "🔼" : "🔽"}
                        </button>
                      </td>
                      <td style={{ fontWeight: "900", fontSize: "12px", color: "#0f172a" }}>{parentSup}</td>
                      <td style={{fontSize: "12px"}}>{parentItem.especie || "—"}</td>
                      <td style={{fontSize: "12px"}}>{parentItem.variedad || "—"}</td>
                      <td style={{textAlign: "center", whiteSpace: "nowrap"}}>
                        <button className="btn-action" onClick={() => handleAddCorte(parentItem)} title="Añadir nuevo corte a este Centro de Costo">➕</button>
                        {group.baseItem && (
                          <>
                            <button className="btn-action" onClick={() => handleEdit(group.baseItem)} title="Editar datos principales del Centro">✏️</button>
                            <button className="btn-action btn-action-warn" onClick={() => onDelete(group.baseItem.id)} title="Eliminar el Centro de Costo completo">🗑️</button>
                          </>
                        )}
                      </td>
                    </tr>

                    {isExpanded && childrenItems.map((item, idx) => (
                      <tr key={item.id} style={{ background: "#ffffff", borderBottom: idx === childrenItems.length - 1 ? "2px solid #cbd5e1" : "1px solid #f1f5f9" }}>
                        <td style={{ textAlign: "right", color: "#cbd5e1", fontSize: "16px", fontWeight: "bold" }}>↳</td>
                        <td className="cell-mono" style={{ fontSize: "11px", color: "#94a3b8" }}>{item.codigoUnico || "—"}</td>
                        <td style={{ color: "#94a3b8", fontSize: "11px" }}>{item.campo}</td>
                        <td className="cell-mono" style={{ color: "#94a3b8", fontSize: "11px" }}>{item.centro}</td>
                        <td style={{ fontWeight: "bold", color: "#3b82f6", fontSize: "12px", textAlign: "center" }}>{item.corte || "—"}</td>
                        <td style={{ fontWeight: "bold", fontSize: "12px", color: "#64748b" }}>{item.superficie || "—"}</td>
                        <td style={{ color: "#94a3b8", fontSize: "11px" }}>{item.especie || "—"}</td>
                        <td style={{ color: "#94a3b8", fontSize: "11px" }}>{item.variedad || "—"}</td>
                        <td style={{textAlign: "center", whiteSpace: "nowrap"}}>
                          <button className="btn-action" onClick={() => handleEdit(item)} title="Editar este corte">✏️</button>
                          <button className="btn-action btn-action-warn" onClick={() => onDelete(item.id)} title="Eliminar este corte">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
              
              {filteredCampos.length === 0 && (
                <tr>
                  <td colSpan={9} style={{textAlign: "center", padding: "30px", color: "#64748b", fontSize: "15px"}}>
                    {filtroEmpresaTabla === "" 
                      ? "👆 Seleccione una empresa arriba para visualizar sus cuarteles y cortes." 
                      : "No hay cuarteles registrados para la empresa seleccionada."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}