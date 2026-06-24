import React, { useState } from "react";
import toast from "react-hot-toast";
import { EMPRESAS_MAESTRAS, formatRut, validateRut, EMPTY_CONTRACTOR_FORM } from "../utils/helpers";

export default function ContractorForm({ onSave, onCancel, initial, userEmpresa }) {
  const [form, setForm] = useState(initial || EMPTY_CONTRACTOR_FORM);
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleRutChange = (e) => set("rut", formatRut(e.target.value));

  const handleSubmit = async () => {
    if (!form.rut || !form.nombre) { toast.error("Completa RUT y Nombre de Empresa."); return; }
    if (userEmpresa === "TODAS" && !form.empresaRut) { toast.error("Selecciona a qué empresa mandante pertenece este contratista."); return; }
    if (!validateRut(form.rut)) { toast.error("El RUT de la empresa no es válido."); return; }
    
    setLoading(true);
    try { 
      await onSave(form); 
    } catch (e) { 
      toast.error(e.message); 
    }
    setLoading(false);
  };

  return (
    <div className="form-card">
      <h3 className="form-title">{initial ? "Editar Contratista" : "Registrar Contratista"}</h3>
      <div className="form-grid">
        <div className="form-group"><label>RUT Empresa *</label><input value={form.rut} onChange={handleRutChange} placeholder="76.123.456-7" maxLength={12} /></div>
        <div className="form-group"><label>Nombre Empresa *</label><input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej: Constructora Alfa" /></div>
        
        {userEmpresa === "TODAS" && (
          <div className="form-group">
            <label>Empresa Mandante Asociada *</label>
            <select value={form.empresaRut} onChange={(e) => set("empresaRut", e.target.value)}>
              <option value="">Selecciona una empresa...</option>
              {EMPRESAS_MAESTRAS.map(emp => <option key={emp.rut} value={emp.rut}>{emp.nombre}</option>)}
            </select>
          </div>
        )}

        <div className="form-group"><label>Contacto (Opcional)</label><input value={form.contacto} onChange={(e) => set("contacto", e.target.value)} placeholder="Nombre o Teléfono" /></div>
        <div className="form-group"><label>Estado</label><select value={form.estado} onChange={(e) => set("estado", e.target.value)}><option value="Activo">Activo</option><option value="Inactivo">Inactivo</option></select></div>
      </div>
      <div className="form-actions">
        <button className="btn-secondary" onClick={onCancel} disabled={loading}>Cancelar</button>
        <button className="btn-primary" onClick={handleSubmit} disabled={loading}>{loading ? "Guardando…" : "Registrar Contratista"}</button>
      </div>
    </div>
  );
}