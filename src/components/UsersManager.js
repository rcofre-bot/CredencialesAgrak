import React, { useState } from "react";
import toast from "react-hot-toast";
import { EMPRESAS_MAESTRAS } from "../utils/helpers";

export default function UsersManager({ rolesList, onSaveUser, onDeleteUser }) {
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("Operador");
  const [empresaRut, setEmpresaRut] = useState("TODAS");

  const isEditing = rolesList.some(u => u.id === email.toLowerCase().trim());

  const handleSave = () => {
    if (!email.includes("@")) return toast.error("Ingresa un correo electrónico válido.");
    onSaveUser(email.toLowerCase().trim(), rol, empresaRut);
    setEmail("");
    setRol("Operador");
    setEmpresaRut("TODAS");
  };

  const handleEdit = (usuario) => {
    setEmail(usuario.id);
    setRol(usuario.rol);
    setEmpresaRut(usuario.empresaRut || "TODAS");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div style={{ maxWidth: "800px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
      
      <div className="form-card" style={{ width: "100%", boxSizing: "border-box" }}>
        <h3 className="form-title">{isEditing ? "Actualizar Permisos de Usuario" : "Autorizar Nuevo Usuario"}</h3>
        <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "15px" }}>Segmenta el acceso vinculando el correo de Google a una empresa específica.</p>
        <div className="form-grid" style={{ background: "#f8fafc", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          
          <div className="form-group">
            <label>Correo de Google *</label>
            <input 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="ejemplo@gmail.com" 
              disabled={isEditing} 
              style={isEditing ? { background: "#e2e8f0", cursor: "not-allowed" } : {}}
            />
          </div>
          
          <div className="form-group">
            <label>Rol de Acceso *</label>
            <select value={rol} onChange={e => setRol(e.target.value)} style={{ fontWeight: "bold" }}>
              <option value="Operador">Operador (Solo imprime tarjas)</option>
              <option value="Supervisor">Supervisor (Personal y Tarjas)</option>
              <option value="Admin">Administrador (Acceso Total de la Empresa)</option>
            </select>
          </div>

          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label>Restringir a Empresa *</label>
            <select value={empresaRut} onChange={e => setEmpresaRut(e.target.value)} style={{ fontWeight: "bold", borderColor: "#ef4444" }}>
              <option value="TODAS">🔓 ACCESO GLOBAL (Todas las empresas)</option>
              {EMPRESAS_MAESTRAS.map(emp => (
                <option key={emp.rut} value={emp.rut}>🏢 {emp.nombre}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ gridColumn: "1 / -1", display: "flex", gap: "10px" }}>
            {isEditing && (
              <button className="btn-secondary" onClick={() => { setEmail(""); setRol("Operador"); setEmpresaRut("TODAS"); }} style={{ width: "30%" }}>
                Cancelar
              </button>
            )}
            <button className="btn-primary" onClick={handleSave} style={{ flexGrow: 1 }}>
              {isEditing ? "🔄 Actualizar Permisos" : "➕ Dar Acceso y Segmentar"}
            </button>
          </div>
        </div>
      </div>

      <div className="form-card" style={{ width: "100%", boxSizing: "border-box" }}>
        <h3 className="form-title">Usuarios Autorizados ({rolesList.length})</h3>
        <div className="table-wrap">
          <table className="workers-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Correo Electrónico</th>
                <th>Nivel</th>
                <th>Empresa Asignada</th>
                <th style={{textAlign: "center"}}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rolesList.map(u => {
                const empAsociada = EMPRESAS_MAESTRAS.find(e => e.rut === u.empresaRut);
                return (
                  <tr key={u.id}>
                    <td style={{fontWeight: u.rol === 'Admin' ? 'bold' : 'normal'}}>{u.id}</td>
                    <td><span className={`badge ${u.rol === 'Admin' ? 'badge-activo' : 'badge-inactivo'}`}>{u.rol}</span></td>
                    <td style={{fontSize: "13px", fontWeight: "600", color: u.empresaRut === "TODAS" ? "#dc2626" : "#0f172a"}}>
                      {u.empresaRut === "TODAS" ? "🌍 GLOBAL (Acceso Total)" : empAsociada ? empAsociada.nombre : u.empresaRut}
                    </td>
                    <td style={{textAlign: "center"}}>
                      <button className="btn-action" onClick={() => handleEdit(u)} title="Editar Permisos">✏️</button>
                      <button className="btn-action btn-action-warn" onClick={() => onDeleteUser(u.id)} title="Revocar Acceso">🗑️</button>
                    </td>
                  </tr>
                );
              })}
              {rolesList.length === 0 && (
                <tr><td colSpan="4" style={{textAlign:"center", padding: "20px", color: "#64748b"}}>No hay usuarios registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}