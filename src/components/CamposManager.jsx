import React, { useState } from "react";
import toast from "react-hot-toast";
import { EMPRESAS_MAESTRAS } from "../utils/helpers";

const EMPTY_FORM = { campo: "", centro: "", especie: "", variedad: "", codigoUnico: "", descripcion: "", empresaRut: "" };

export default function CamposManager({ camposList, onSave, onBulkUpload, onDelete, loading, empresasMaestras, userEmpresa }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  
  const [isBulk, setIsBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [empresaDestinoBulk, setEmpresaDestinoBulk] = useState(userEmpresa !== "TODAS" ? userEmpresa : "");

  // 🔥 ESTADOS PARA EL ORDENAMIENTO DE LA TABLA 🔥
  const [sortConfig, setSortConfig] = useState({ key: 'campo', direction: 'asc' });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
      codigoUnico: form.codigoUnico.trim(),
      descripcion: form.descripcion.trim()
    };

    onSave(finalForm, editId);
    setForm(EMPTY_FORM);
    setEditId(null);
  };

  const handleEdit = (item) => {
    setIsBulk(false);
    setForm({
      campo: item.campo || "",
      centro: item.centro || "",
      especie: item.especie || "",
      variedad: item.variedad || "",
      codigoUnico: item.codigoUnico || "",
      descripcion: item.descripcion || "",
      empresaRut: item.empresaRut || ""
    });
    setEditId(item.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        let campo = parts[0].toUpperCase();
        let centro = parts[1].toUpperCase();
        let especie = (parts[2] || "").toUpperCase();
        let variedad = (parts[3] || "").toUpperCase();
        let codigoManual = (parts[4] || "").toUpperCase(); 
        let descripcion = (parts[5] || ""); 
        
        if (!codigoManual) {
          toast.error(`Falta el Código Único en la línea ${i + 1} del Excel.`);
          return;
        }

        if (campo && centro) {
          newItems.push({ 
            campo, 
            centro, 
            especie, 
            variedad, 
            codigoUnico: codigoManual,
            descripcion,
            empresaRut: userEmpresa !== "TODAS" ? userEmpresa : empresaDestinoBulk 
          });
        }
      }
    }

    if (newItems.length === 0) {
      toast.error("Formato incorrecto. Revisa las columnas del Excel.");
      return;
    }

    onBulkUpload(newItems);
    setBulkText("");
    setIsBulk(false);
  };

  // 🔥 LÓGICA DE ORDENAMIENTO AL HACER CLIC EN LOS TÍTULOS 🔥
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedCampos = [...camposList].sort((a, b) => {
    let valA = a[sortConfig.key] || "";
    let valB = b[sortConfig.key] || "";

    // Si ordenamos por empresa, buscamos su nombre real para el orden alfabético
    if (sortConfig.key === 'empresaRut') {
      const empA = EMPRESAS_MAESTRAS.find(e => e.rut === a.empresaRut);
      const empB = EMPRESAS_MAESTRAS.find(e => e.rut === b.empresaRut);
      valA = empA ? empA.nombre : a.empresaRut;
      valB = empB ? empB.nombre : b.empresaRut;
    }

    valA = String(valA).toLowerCase();
    valB = String(valB).toLowerCase();

    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const renderSortIcon = (colName) => {
    if (sortConfig.key === colName) {
      return sortConfig.direction === 'asc' ? ' 🔼' : ' 🔽';
    }
    return <span style={{ opacity: 0.3 }}> ↕️</span>;
  };

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", padding: "15px 20px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
        <div>
          <h3 style={{ margin: 0, color: "#101c38" }}>Gestión de Cuarteles y C. Costo</h3>
          <p style={{ margin: "5px 0 0 0", fontSize: "13px", color: "#64748b" }}>Agrega cuarteles uno a uno o pégalos directamente desde tu Excel.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button 
            onClick={() => { setIsBulk(false); setEditId(null); setForm(EMPTY_FORM); }} 
            style={{ padding: "8px 16px", borderRadius: "6px", fontWeight: "bold", border: "none", cursor: "pointer", background: !isBulk ? "#b45309" : "#e2e8f0", color: !isBulk ? "#fff" : "#475569" }}
          >
            ✏️ Manual
          </button>
          <button 
            onClick={() => setIsBulk(true)} 
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
            Copia las columnas de tu Excel y pégalas aquí. El orden de las columnas es <b>obligatorio</b>: <br/>
            <span style={{ color: "#b45309", fontWeight: "bold", fontFamily: "monospace" }}>Campo | Cuartel | Especie | Variedad | CÓDIGO ÚNICO | Descripción</span>
          </p>

          <div className="form-grid" style={{ background: "#f8fafc", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            {userEmpresa === "TODAS" && (
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label>Asignar todos estos cuarteles a la Empresa: *</label>
                <select value={empresaDestinoBulk} onChange={e => setEmpresaDestinoBulk(e.target.value)} style={{ fontWeight: "bold", borderColor: "#b45309" }}>
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
                placeholder="Ejemplo al pegar de Excel:&#10;SANTA ANA&#9;LOTE 1&#9;UVA DE MESA&#9;AUTUMN CRISP&#9;COD-INT-001&#9;Plantación 2021&#10;SANTA ANA&#9;LOTE 2&#9;UVA DE MESA&#9;RED GLOBE&#9;COD-INT-002&#9;Sector norte alta densidad"
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
          <h3 className="form-title">{editId ? "Editar Cuartel / C. Costo" : "Registrar Nuevo Cuartel"}</h3>
          
          <div className="form-grid" style={{ background: "#f8fafc", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            {userEmpresa === "TODAS" && (
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label>Empresa Asociada *</label>
                <select value={form.empresaRut} onChange={e => set("empresaRut", e.target.value)} style={{ fontWeight: "bold" }}>
                  <option value="">Selecciona una empresa...</option>
                  {empresasMaestras.map(emp => <option key={emp.rut} value={emp.rut}>🏢 {emp.nombre}</option>)}
                </select>
              </div>
            )}

            <div className="form-group">
              <label>Fundo / Campo *</label>
              <input value={form.campo} onChange={e => set("campo", e.target.value.toUpperCase())} placeholder="Ej: SANTA ANA" />
            </div>
            <div className="form-group">
              <label>Cuartel / C. Costo *</label>
              <input value={form.centro} onChange={e => set("centro", e.target.value.toUpperCase())} placeholder="Ej: LOTE 4" />
            </div>
            <div className="form-group">
              <label>Especie Principal</label>
              <input value={form.especie} onChange={e => set("especie", e.target.value.toUpperCase())} placeholder="Ej: UVA DE MESA" />
            </div>
            <div className="form-group">
              <label>Variedad</label>
              <input value={form.variedad} onChange={e => set("variedad", e.target.value.toUpperCase())} placeholder="Ej: AUTUMN CRISP" />
            </div>
            
            <div className="form-group">
              <label>Código Único Identificador *</label>
              <input 
                value={form.codigoUnico} 
                onChange={e => set("codigoUnico", e.target.value.toUpperCase().replace(/\s+/g, '-'))} 
                placeholder="Ej: COD-INT-001" 
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
              {editId && <button className="btn-secondary" onClick={() => { setForm(EMPTY_FORM); setEditId(null); }} style={{ width: "30%" }}>Cancelar</button>}
              <button className="btn-primary" onClick={handleSubmit} disabled={loading} style={{ flexGrow: 1, background: "#b45309" }}>
                {loading ? "Guardando..." : editId ? "🔄 Actualizar Datos del Cuartel" : "➕ Registrar Cuartel"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="form-card" style={{ width: "100%", maxWidth: "100%" }}>
        <h3 className="form-title">Listado Maestro de Cuarteles y Cultivos</h3>
        <div className="table-wrap">
          <table className="workers-table">
            <thead>
              <tr>
                {/* 🔥 ENCABEZADOS AHORA SON CLICKEABLES 🔥 */}
                <th onClick={() => handleSort('empresaRut')} style={{ cursor: "pointer", userSelect: "none" }}>Empresa{renderSortIcon('empresaRut')}</th>
                <th onClick={() => handleSort('codigoUnico')} style={{ cursor: "pointer", userSelect: "none" }}>Código Único{renderSortIcon('codigoUnico')}</th>
                <th onClick={() => handleSort('campo')} style={{ cursor: "pointer", userSelect: "none" }}>Fundo / Campo{renderSortIcon('campo')}</th>
                <th onClick={() => handleSort('centro')} style={{ cursor: "pointer", userSelect: "none" }}>Cuartel{renderSortIcon('centro')}</th>
                <th onClick={() => handleSort('especie')} style={{ cursor: "pointer", userSelect: "none" }}>Especie{renderSortIcon('especie')}</th>
                <th onClick={() => handleSort('variedad')} style={{ cursor: "pointer", userSelect: "none" }}>Variedad{renderSortIcon('variedad')}</th>
                <th onClick={() => handleSort('descripcion')} style={{ cursor: "pointer", userSelect: "none" }}>Descripción{renderSortIcon('descripcion')}</th>
                <th style={{textAlign: "center"}}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {/* 🔥 USAMOS EL ARREGLO YA ORDENADO 🔥 */}
              {sortedCampos.map(item => {
                const empAsociada = EMPRESAS_MAESTRAS.find(e => e.rut === item.empresaRut);
                const isConvento = item.empresaRut === "79.737.880-1";
                const isTorretagle = item.empresaRut === "76.064.746-2";
                
                return (
                  <tr key={item.id}>
                    <td>
                      <span style={{
                        background: isConvento ? "#e0f2fe" : isTorretagle ? "#dcfce7" : "#f1f5f9",
                        color: isConvento ? "#0369a1" : isTorretagle ? "#166534" : "#475569",
                        border: "1px solid",
                        borderColor: isConvento ? "#bae6fd" : isTorretagle ? "#bbf7d0" : "#cbd5e1",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "bold",
                        whiteSpace: "nowrap"
                      }}>
                        {empAsociada ? empAsociada.nombre.replace("AGRICOLA ", "").replace(" SPA", "") : "Desconocida"}
                      </span>
                    </td>

                    <td className="cell-mono" style={{ fontSize: "11px", color: "#16a34a" }}>{item.codigoUnico || "—"}</td>
                    <td style={{fontWeight: "bold"}}>{item.campo}</td>
                    <td className="cell-mono" style={{fontWeight: "600"}}>{item.centro}</td>
                    <td>{item.especie || "—"}</td>
                    <td>{item.variedad || "—"}</td>
                    <td style={{ fontSize: "12px", color: "#64748b", maxWidth: "150px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={item.descripcion}>
                      {item.descripcion || "—"}
                    </td>
                    <td style={{textAlign: "center"}}>
                      <button className="btn-action" onClick={() => handleEdit(item)} title="Editar">✏️</button>
                      <button className="btn-action btn-action-warn" onClick={() => onDelete(item.id)} title="Eliminar">🗑️</button>
                    </td>
                  </tr>
                );
              })}
              {camposList.length === 0 && <tr><td colSpan={8} style={{textAlign: "center", padding: "20px", color: "#64748b"}}>No hay cuarteles registrados.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}