import React, { useState } from "react";

export default function CamposManager({ camposList, onSave, onDelete, loading, empresasMaestras }) {
  const [empresaRut, setEmpresaRut] = useState(empresasMaestras[0].rut);
  const [campo, setCampo] = useState("");
  const [centro, setCentro] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [editId, setEditId] = useState(null);

  const handleSaveClick = () => {
    if (!campo.trim() || !centro.trim()) {
      alert("Debes ingresar el nombre del Campo y el Centro de Costo.");
      return;
    }
    
    onSave({ 
      empresaRut: empresaRut,
      campo: campo.toUpperCase().trim(), 
      centro: centro.toUpperCase().trim(),
      descripcion: descripcion.trim()
    }, editId);
    
    setCampo("");
    setCentro(""); 
    setDescripcion("");
    setEditId(null);
  };

  const handleEditClick = (item) => {
    setEmpresaRut(item.empresaRut || empresasMaestras[0].rut);
    setCampo(item.campo);
    setCentro(item.centro);
    setDescripcion(item.descripcion || "");
    setEditId(item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEmpresaRut(empresasMaestras[0].rut);
    setCampo("");
    setCentro("");
    setDescripcion("");
    setEditId(null);
  };

  const empresaSeleccionada = empresasMaestras.find(e => e.rut === empresaRut) || empresasMaestras[0];
  const camposFiltrados = camposList.filter(c => {
    const rutCampo = c.empresaRut || empresasMaestras[0].rut; 
    return rutCampo === empresaRut;
  });

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
      
      <div className="form-card">
        <h3 className="form-title">{editId ? "Editar Campo / Centro de Costo" : "Agregar Campo / Centro de Costo"}</h3>
        <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px" }}>
          Registra fundos y cuarteles asociándolos estrictamente a su empresa correspondiente para segmentar la emisión de tarjas.
        </p>

        <div className="form-grid" style={{ marginBottom: "10px", background: "#f8fafc", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label style={{color:"#b45309", fontWeight:"bold"}}>Selecciona la Empresa para Gestionar *</label>
            <select value={empresaRut} onChange={e => setEmpresaRut(e.target.value)} style={{ fontWeight: "bold", width: "100%", padding: "10px", border: "2px solid #b45309", borderRadius: "6px" }}>
              {empresasMaestras.map(emp => (
                <option key={emp.rut} value={emp.rut}>{emp.nombre}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Nombre del Campo / Fundo *</label>
            <input value={campo} onChange={e => setCampo(e.target.value)} placeholder="Ej: CARMEN ROSA" />
          </div>
          <div className="form-group">
            <label>Centro de Costo / Cuartel *</label>
            <input value={centro} onChange={e => setCentro(e.target.value)} placeholder="Ej: LOS NOGALES 1" />
          </div>
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label>Descripción (Opcional)</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Sector riego, variedad frutal..." />
          </div>
          
          <div className="form-group" style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
            {editId && <button className="btn-secondary" onClick={handleCancelEdit} disabled={loading}>Cancelar</button>}
            <button className="btn-primary" onClick={handleSaveClick} disabled={loading}>
              {loading ? "Guardando..." : (editId ? "💾 Actualizar Información" : "➕ Guardar Centro")}
            </button>
          </div>
        </div>
      </div>

      <div className="form-card">
        <h3 className="form-title">Centros de Costo: {empresaSeleccionada.nombre.replace("AGRICOLA ", "")} ({camposFiltrados.length})</h3>
        <div className="table-wrap">
          <table className="workers-table">
            <thead>
              <tr>
                <th>Campo / Fundo</th>
                <th>C.Costo (Cuartel)</th>
                <th>Descripción</th>
                <th style={{ width: "120px", textAlign: "center" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {camposFiltrados.map(c => {
                return (
                  <tr key={c.id} style={{ backgroundColor: editId === c.id ? "#fef9c3" : "transparent" }}>
                    <td style={{ fontWeight: "bold", color: "#0f172a" }}>{c.campo}</td>
                    <td>{c.centro}</td>
                    <td style={{ color: "#64748b", fontSize: "13px" }}>{c.descripcion || "—"}</td>
                    <td style={{ textAlign: "center" }}>
                      <button className="btn-action" onClick={() => handleEditClick(c)} title="Editar">✏️</button>
                      <button className="btn-action btn-action-warn" onClick={() => onDelete(c.id)} title="Eliminar">🗑️</button>
                    </td>
                  </tr>
                );
              })}
              {camposFiltrados.length === 0 && (
                <tr><td colSpan="4" style={{textAlign:"center", color:"#888", padding: "20px"}}>No hay centros de costo registrados para esta empresa.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
    </div>
  );
}