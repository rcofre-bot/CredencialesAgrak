import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { EMPRESAS_MAESTRAS } from "../utils/helpers";

export default function CredentialsManager({ credentialsList, onBulkUpload, onDelete, loading, userEmpresa }) {
  const [bulkText, setBulkText] = useState("");
  const [empresaDestino, setEmpresaDestino] = useState(userEmpresa === "TODAS" ? "" : userEmpresa);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (userEmpresa !== "TODAS") {
      setEmpresaDestino(userEmpresa);
    }
  }, [userEmpresa]);

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

  const disponiblesFiltradas = disponibles.filter(c => 
    c.folio.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.codigo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const infoEmpresaActiva = EMPRESAS_MAESTRAS.find(e => e.rut === empresaDestino);
  const nombreEmpresaTitulo = infoEmpresaActiva ? infoEmpresaActiva.nombre.replace("AGRICOLA ", "") : "la Empresa";

  return (
    <div className="form-card" style={{ maxWidth: "800px", width: "100%", margin: "0 auto" }}>
      <h3 className="form-title">Gestión y Carga Masiva de Credenciales</h3>
      <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "15px" }}>
        Las credenciales QR se segmentan de forma independiente para cada empresa mandante para evitar duplicidad de folios en terreno.
      </p>
      
      <div className="form-grid" style={{ background: "#f8fafc", padding: "15px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label style={{ fontWeight: "bold", color: "#101c38" }}>Empresa Administrada actualmente:</label>
          
          {userEmpresa === "TODAS" ? (
            <select value={empresaDestino} onChange={e => setEmpresaDestino(e.target.value)} style={{ fontWeight: "bold", borderColor: "#16a34a", width: "100%", padding: "10px", borderRadius: "6px" }}>
              <option value="">Selecciona una empresa para auditar o cargar...</option>
              {EMPRESAS_MAESTRAS.map(emp => <option key={emp.rut} value={emp.rut}>🏢 {emp.nombre}</option>)}
            </select>
          ) : (
            <div style={{ padding: "12px", background: "#e2e8f0", border: "1px solid #cbd5e1", borderRadius: "6px", fontWeight: "bold", color: "#111827" }}>
              🏢 {infoEmpresaActiva ? infoEmpresaActiva.nombre : "Cargando empresa..."} (Acceso Restringido a tu Perfil)
            </div>
          )}
        </div>
      </div>

      <div style={{ marginBottom: "15px" }}>
        <label className="btn-secondary" style={{ cursor: "pointer", display: "inline-block" }}>
          📁 Seleccionar Archivo de Tarjetas (.csv o .txt)
          <input type="file" accept=".csv, .txt" onChange={handleFileUpload} style={{ display: "none" }} />
        </label>
      </div>

      <textarea
        rows={5}
        value={bulkText}
        onChange={(e) => setBulkText(e.target.value)}
        placeholder="Ejemplo formato masivo:&#10;1001, {&#34;id&#34;:&#34;123&#34;,&#34;type&#34;:&#34;worker&#34;}"
        style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", marginBottom: "15px", fontFamily: "monospace" }}
      />
      <button className="btn-primary" onClick={handleUpload} disabled={loading || !bulkText.trim() || !empresaDestino}>
        {loading ? "Cargando..." : `📤 Inyectar QRs a ${nombreEmpresaTitulo}`}
      </button>

      {empresaDestino && (
        <div style={{ marginTop: "40px", borderTop: "1px solid #e2e8f0", paddingTop: "20px" }}>
          <h4 style={{ marginBottom: "10px", color: "#1e293b" }}>Estado del Bolsillo: {nombreEmpresaTitulo}</h4>
          
          <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
            <div style={{ background: "#eefdf4", color: "#166534", padding: "12px 20px", borderRadius: "8px", fontWeight: "700", flex: 1, border: "1px solid #bbf7d0" }}>
              🟢 QRs Disponibles (Stock): {disponibles.length}
            </div>
            <div style={{ background: "#f1f5f9", color: "#475569", padding: "12px 20px", borderRadius: "8px", fontWeight: "700", flex: 1, border: "1px solid #e2e8f0" }}>
              📋 QRs Asignados en Terreno: {asignadas.length}
            </div>
          </div>

          {disponibles.length > 0 && (
            <div style={{ marginBottom: "15px" }}>
              <input 
                type="text" 
                placeholder="🔍 Buscar por número de folio o código interno..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: "100%", padding: "10px 15px", borderRadius: "8px", border: "2px solid #cbd5e1", fontSize: "14px", outline: "none" }}
              />
            </div>
          )}

          {disponibles.length > 0 ? (
            <div style={{ maxHeight: "300px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
              <table className="workers-table" style={{ margin: 0, width: "100%" }}>
                <thead>
                  <tr>
                    <th>Folio Tarjeta</th>
                    <th>Código QR Interno Encriptado</th>
                    <th>Estado</th>
                    <th style={{ width: "80px", textAlign: "center" }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {disponiblesFiltradas.length > 0 ? (
                    disponiblesFiltradas.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 'bold', color: '#0f172a' }}>{c.folio}</td>
                        <td className="cell-mono" style={{ fontSize: "12px", color: "#64748b" }}>{c.codigo.substring(0, 45)}...</td>
                        <td><span className="badge badge-activo">Disponible</span></td>
                        <td style={{ textAlign: "center" }}>
                          <button className="btn-action btn-action-warn" onClick={() => onDelete(c.id)} title="Eliminar código de la base de datos">🗑️</button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>No se encontraron credenciales con esa búsqueda.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "30px", background: "#fff2f2", border: "1px dashed #fecaca", borderRadius: "8px", color: "#dc2626", fontWeight: "600" }}>
              ⚠️ No quedan QRs disponibles en el stock de esta empresa. ¡Debes cargar un nuevo archivo masivo!
            </div>
          )}
        </div>
      )}
    </div>
  );
}