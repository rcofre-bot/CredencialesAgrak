import React, { useState } from "react";
import toast from "react-hot-toast";
import { EMPRESAS_MAESTRAS, formatRut, validateRut } from "../utils/helpers";

export default function ContractorsBulkManager({ onBulkUpload, loading, onCancel }) {
  const [bulkText, setBulkText] = useState("");
  const [empresaDestino, setEmpresaDestino] = useState("");

  const handleUpload = () => {
    if (!empresaDestino) { toast.error("Selecciona la empresa a la que pertenecerán."); return; }
    if (!bulkText.trim()) return;
    const lines = bulkText.split("\n").map(l => l.trim()).filter(l => l !== "");
    const newItems = [];
    const invalidos = [];

    for (let line of lines) {
      const parts = line.split(/[,\t]/).map(p => p.trim());
      if (parts.length >= 2) {
        let rut = formatRut(parts[0]);
        let nombre = parts[1];
        let contacto = parts[2] || "";
        if (rut && nombre) {
          // Validamos el dígito verificador del RUT antes de aceptarlo
          if (!validateRut(rut)) {
            invalidos.push(`${parts[0]} (RUT inválido)`);
            continue;
          }
          newItems.push({ rut, nombre, contacto, empresaRut: empresaDestino, estado: "Activo" });
        }
      }
    }

    if (invalidos.length > 0) {
      toast.error(`Se omitieron ${invalidos.length} registro(s) con RUT inválido.`);
    }

    if (newItems.length === 0) {
      toast.error("El formato es incorrecto. Usa 'RUT, Nombre, Contacto' por línea.");
      return;
    }

    onBulkUpload(newItems);
  };

  return (
    <div className="form-card" style={{ maxWidth: "800px", width: "100%", margin: "0 auto" }}>
      <h3 className="form-title">Carga Masiva de Contratistas (Solo Administrador Global)</h3>
      <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "15px" }}>
        Pega tu lista de contratistas desde Excel o escribe un registro por línea separado por comas o tabulaciones.
      </p>
      <div className="form-grid" style={{ background: "#f8fafc", padding: "15px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label style={{ fontWeight: "bold" }}>Asignar todos a la Empresa Destino *</label>
          <select value={empresaDestino} onChange={e => setEmpresaDestino(e.target.value)} style={{ fontWeight: "bold", borderColor: "#16a34a" }}>
            <option value="">Selecciona la agrícola...</option>
            {EMPRESAS_MAESTRAS.map(emp => <option key={emp.rut} value={emp.rut}>🏢 {emp.nombre}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <textarea
            rows={10}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder="Ejemplo formato (RUT, Nombre, Contacto Opcional):&#10;76.123.456-7, Constructora Alfa, Juan Perez&#10;11.222.333-4, Transportes Sur,"
            style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontFamily: "monospace" }}
          />
        </div>
      </div>
      <div className="form-actions" style={{ marginTop: "20px" }}>
        <button className="btn-secondary" onClick={onCancel} disabled={loading}>Cancelar</button>
        <button className="btn-primary" onClick={handleUpload} disabled={loading || !bulkText.trim() || !empresaDestino}>
          {loading ? "Cargando..." : "📤 Guardar Contratistas"}
        </button>
      </div>
    </div>
  );
}