import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import toast from "react-hot-toast";

export default function ContratistasManager({ empresasMaestras }) {
  const [contratistas, setContratistas] = useState([]);
  const [nombre, setNombre] = useState("");
  const [empresaRut, setEmpresaRut] = useState("");
  const [esCosecha, setEsCosecha] = useState(false);
  const [estado, setEstado] = useState("Activo");
  
  const [editandoId, setEditandoId] = useState(null);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "contratistas"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setContratistas(data);
    });
    return () => unsubscribe();
  }, []);

  const guardarContratista = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return toast.error("El nombre es obligatorio.");
    if (!empresaRut) return toast.error("Debes asociarlo a una empresa.");

    setProcesando(true);
    try {
      if (editandoId) {
        await updateDoc(doc(db, "contratistas", editandoId), {
          nombre: nombre.toUpperCase(),
          empresaRut,
          esCosecha,
          estado,
          actualizadoEn: serverTimestamp()
        });
        toast.success("Contratista actualizado.");
      } else {
        await addDoc(collection(db, "contratistas"), {
          nombre: nombre.toUpperCase(),
          empresaRut,
          esCosecha,
          estado,
          creadoEn: serverTimestamp()
        });
        toast.success("Contratista registrado.");
      }
      limpiarFormulario();
    } catch (error) {
      console.error(error);
      toast.error("Error al guardar.");
    }
    setProcesando(false);
  };

  const editarContratista = (c) => {
    setEditandoId(c.id);
    setNombre(c.nombre);
    setEmpresaRut(c.empresaRut);
    setEsCosecha(c.esCosecha || false);
    setEstado(c.estado || "Activo");
  };

  const eliminarContratista = async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar este contratista?")) return;
    try {
      await deleteDoc(doc(db, "contratistas", id));
      toast.success("Contratista eliminado.");
    } catch (error) {
      toast.error("Error al eliminar.");
    }
  };

  const limpiarFormulario = () => {
    setEditandoId(null);
    setNombre("");
    setEmpresaRut("");
    setEsCosecha(false);
    setEstado("Activo");
  };

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
        <h3 style={{ margin: "0 0 15px 0", color: "#001254" }}>
          {editandoId ? "✏️ Editar Contratista" : "👷 Nuevo Contratista"}
        </h3>
        
        <form onSubmit={guardarContratista} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "5px", color: "#475569" }}>NOMBRE / RAZÓN SOCIAL *</label>
            <input 
              value={nombre} 
              onChange={e => setNombre(e.target.value)} 
              placeholder="Ej: SERVICIOS AGRICOLAS SPA" 
              style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: "bold", textTransform: "uppercase" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "5px", color: "#475569" }}>EMPRESA ASOCIADA *</label>
            <select 
              value={empresaRut} 
              onChange={e => setEmpresaRut(e.target.value)} 
              style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: "bold" }}
            >
              <option value="">-- Selecciona Empresa --</option>
              <option value="TODAS">Presta servicios a TODAS</option>
              {empresasMaestras.map(emp => (
                <option key={emp.rut} value={emp.rut}>{emp.nombre}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#fef3c7", padding: "10px", borderRadius: "6px", border: "1px solid #fde68a" }}>
            <input 
              type="checkbox" 
              id="chkCosecha"
              checked={esCosecha}
              onChange={e => setEsCosecha(e.target.checked)}
              style={{ width: "18px", height: "18px", cursor: "pointer" }}
            />
            <label htmlFor="chkCosecha" style={{ fontWeight: "bold", color: "#92400e", cursor: "pointer", userSelect: "none" }}>
              🚜 Habilitado para Cosecha
            </label>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "5px", color: "#475569" }}>ESTADO</label>
            <select 
              value={estado} 
              onChange={e => setEstado(e.target.value)} 
              style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontWeight: "bold", color: estado === "Activo" ? "#16a34a" : "#dc2626" }}
            >
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
            </select>
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: "10px", marginTop: "10px" }}>
            <button type="submit" disabled={procesando} style={{ background: "#001254", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer", flex: 1 }}>
              {procesando ? "Guardando..." : "💾 Guardar Contratista"}
            </button>
            {editandoId && (
              <button type="button" onClick={limpiarFormulario} style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", padding: "10px 20px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
        <h4 style={{ margin: "0 0 15px 0", color: "#001254" }}>Directorio de Contratistas ({contratistas.length})</h4>
        
        {contratistas.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: "14px", textAlign: "center" }}>No hay contratistas registrados.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ padding: "10px" }}>Nombre</th>
                <th style={{ padding: "10px" }}>Empresa Asociada</th>
                <th style={{ padding: "10px", textAlign: "center" }}>Rol</th>
                <th style={{ padding: "10px", textAlign: "center" }}>Estado</th>
                <th style={{ padding: "10px", textAlign: "center" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {contratistas.map(c => {
                const emp = c.empresaRut === "TODAS" ? "TODAS" : empresasMaestras.find(e => e.rut === c.empresaRut)?.nombre || "Desconocida";
                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "10px", fontWeight: "bold", color: "#1e293b" }}>{c.nombre}</td>
                    <td style={{ padding: "10px", color: "#475569", fontSize: "12px" }}>{emp}</td>
                    <td style={{ padding: "10px", textAlign: "center" }}>
                      {c.esCosecha ? <span style={{ background: "#fef3c7", color: "#92400e", padding: "4px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}>🚜 Cosecha</span> : <span style={{ color: "#94a3b8", fontSize: "12px" }}>General</span>}
                    </td>
                    <td style={{ padding: "10px", textAlign: "center" }}>
                      <span style={{ color: c.estado === "Activo" ? "#16a34a" : "#dc2626", fontWeight: "bold", fontSize: "12px" }}>{c.estado}</span>
                    </td>
                    <td style={{ padding: "10px", textAlign: "center" }}>
                      <button onClick={() => editarContratista(c)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "16px" }} title="Editar">✏️</button>
                      <button onClick={() => eliminarContratista(c.id)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "16px", marginLeft: "10px" }} title="Eliminar">🗑️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}