import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { EMPRESAS_MAESTRAS, formatRut } from "../utils/helpers"; // 🔥 IMPORTACIÓN CORREGIDA

// 🔥 PEGA AQUÍ TU LISTADO DE CARGOS 🔥
const LISTA_CARGOS = [
  "COSECHERO",
  "JEFE DE CUADRILLA",
  "CONTROL DE CALIDAD",
  "TRACTORISTA",
  "OPERADOR DE GRÚA",
  "DIGITADOR",
  "SUPERVISOR DE CAMPO",
  "PREVENCIONISTA DE RIESGOS",
  "ADMINISTRATIVO"
];

export default function WorkerForm({ onSave, onCancel, initial, contractorsList, userEmpresa }) {
  const [form, setForm] = useState({
    rut: "",
    nombre: "",
    apellido: "",
    empresaRut: userEmpresa !== "TODAS" ? userEmpresa : "",
    contratista: "",
    estado: "Activo",
    cargo: "" 
  });

  useEffect(() => {
    if (initial) {
      setForm({
        rut: formatRut(initial.rut) || "",
        nombre: initial.nombre || "",
        apellido: initial.apellido || "",
        empresaRut: initial.empresaRut || (userEmpresa !== "TODAS" ? userEmpresa : ""),
        contratista: initial.contratista || "",
        estado: initial.estado || "Activo",
        cargo: initial.cargo || "" 
      });
    }
  }, [initial, userEmpresa]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "rut") {
      setForm({ ...form, rut: formatRut(value) });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // 🔥 CORRECCIÓN: Limpiamos el RUT quitando puntos y guiones directamente aquí
    const rutLimpio = form.rut.replace(/[^0-9kK]/g, '').toUpperCase();
    
    if (!rutLimpio || rutLimpio.length < 7) { toast.error("RUT inválido"); return; }
    if (!form.nombre.trim() || !form.apellido.trim()) { toast.error("Nombre y Apellidos son obligatorios"); return; }
    if (userEmpresa === "TODAS" && !form.empresaRut) { toast.error("Selecciona la Empresa Asignada"); return; }

    onSave({
      ...form,
      rut: rutLimpio,
      nombre: form.nombre.trim().toUpperCase(),
      apellido: form.apellido.trim().toUpperCase(),
      // Si la empresa es Convento, guardamos el cargo. Si cambian a Torretagle, lo borramos.
      cargo: form.empresaRut === "79.737.880-1" ? form.cargo.trim().toUpperCase() : ""
    });
  };

  const isConvento = form.empresaRut === "79.737.880-1";
  const contratistasFiltrados = contractorsList.filter(c => c.estado === "Activo" && (c.empresaRut === form.empresaRut || !form.empresaRut));

  return (
    <div className="form-card" style={{ maxWidth: "800px", margin: "0 auto" }}>
      <h3 className="form-title">{initial ? "Editar Trabajador" : "Registrar Nuevo Trabajador"}</h3>
      
      <form onSubmit={handleSubmit} className="form-grid" style={{ background: "#f8fafc", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        
        {userEmpresa === "TODAS" && (
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label>EMPRESA ASIGNADA *</label>
            <select name="empresaRut" value={form.empresaRut} onChange={handleChange} style={{ fontWeight: "bold", borderColor: "#101c38" }}>
              <option value="">Seleccione una empresa...</option>
              {EMPRESAS_MAESTRAS.map(emp => (
                <option key={emp.rut} value={emp.rut}>🏢 {emp.nombre}</option>
              ))}
            </select>
          </div>
        )}

        <div className="form-group">
          <label>RUT *</label>
          <input name="rut" value={form.rut} onChange={handleChange} placeholder="Ej: 12.345.678-9" disabled={!!initial} style={{ background: initial ? "#e2e8f0" : "#fff" }} />
        </div>

        <div className="form-group">
          <label>NOMBRES *</label>
          <input name="nombre" value={form.nombre} onChange={handleChange} placeholder="Ej: JUAN ANDRES" />
        </div>

        <div className="form-group">
          <label>APELLIDOS *</label>
          <input name="apellido" value={form.apellido} onChange={handleChange} placeholder="Ej: PEREZ SOTO" />
        </div>

        <div className="form-group">
          <label>CONTRATISTA (Opcional)</label>
          <select name="contratista" value={form.contratista} onChange={handleChange}>
            <option value="">-- Sin Contratista (Trato Directo) --</option>
            {contratistasFiltrados.map(c => (
              <option key={c.id} value={c.nombre}>{c.nombre}</option>
            ))}
          </select>
        </div>

        {/* 🔥 CAMPO CONDICIONAL: SOLO APARECE SI ES CONVENTO 🔥 */}
        {isConvento && (
          <div className="form-group" style={{ gridColumn: "1 / -1", padding: "15px", background: "#e0f2fe", borderRadius: "6px", border: "1px dashed #0284c7" }}>
            <label style={{ color: "#0369a1", fontWeight: "bold" }}>CARGO EN CONVENTO VIEJO</label>
            <input 
              list="lista-cargos" 
              name="cargo" 
              value={form.cargo} 
              onChange={handleChange} 
              placeholder="Seleccione o escriba el cargo..." 
              style={{ borderColor: "#0284c7" }}
            />
            <datalist id="lista-cargos">
              {LISTA_CARGOS.map(cargo => <option key={cargo} value={cargo} />)}
            </datalist>
          </div>
        )}

        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label>ESTADO DEL TRABAJADOR</label>
          <select name="estado" value={form.estado} onChange={handleChange} style={{ fontWeight: "bold", color: form.estado === "Activo" ? "#16a34a" : "#dc2626" }}>
            <option value="Activo">🟢 ACTIVO (Asignar Credencial)</option>
            <option value="Inactivo">🔴 INACTIVO (Liberar Credencial)</option>
          </select>
        </div>

        <div className="form-group" style={{ gridColumn: "1 / -1", display: "flex", gap: "10px", marginTop: "15px" }}>
          <button type="button" className="btn-secondary" onClick={onCancel} style={{ width: "30%" }}>Cancelar</button>
          <button type="submit" className="btn-primary" style={{ flexGrow: 1, background: "#101c38" }}>
            {initial ? "💾 Guardar Cambios" : "➕ Registrar Trabajador"}
          </button>
        </div>
      </form>
    </div>
  );
}