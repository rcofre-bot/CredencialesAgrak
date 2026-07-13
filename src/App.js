import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
import {
  collection, addDoc, doc, updateDoc, setDoc, getDocs, query, where, serverTimestamp, writeBatch, deleteDoc, onSnapshot, orderBy, limit, runTransaction
} from "firebase/firestore";
import { db } from "./firebase";
import useAuth from "./hooks/useAuth";
import toast, { Toaster } from "react-hot-toast";
import "./App.css";

import { EMPRESAS_MAESTRAS, LOGOS_EMPRESAS, formatRut, generateWorkerCode } from "./utils/helpers";

const CamposManager = lazy(() => import("./components/CamposManager"));
const TarjasManager = lazy(() => import("./components/TarjasManager"));
const WorkerForm = lazy(() => import("./components/WorkerForm"));
const ContractorForm = lazy(() => import("./components/ContractorForm"));
const ContractorsBulkManager = lazy(() => import("./components/ContractorsBulkManager"));
const CredentialsManager = lazy(() => import("./components/CredentialsManager"));
const UsersManager = lazy(() => import("./components/UsersManager"));
const QRCard = lazy(() => import("./components/QRCard"));
const CuadrillasManager = lazy(() => import("./components/CuadrillasManager"));

export default function App() {
  const { user, authLoading, userRole, userEmpresa, isOnline, initialView, login, logout, revokeAccess } = useAuth();

  const [workers, setWorkers] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [camposList, setCamposList] = useState([]); 
  const [rolesList, setRolesList] = useState([]); 
  
  const [loadingData, setLoadingData] = useState(true);
  const [view, setView] = useState("tarjas"); 
  const [editTarget, setEditTarget] = useState(null);
  const [qrWorker, setQrWorker] = useState(null);
  
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState("Todos");
  const [filterEmpresaList, setFilterEmpresaList] = useState("TODAS"); 

  // Aplica la vista inicial que sugiere el hook de auth según el rol,
  // al iniciar sesión. (Antes esto se hacía dentro del listener de auth.)
  useEffect(() => {
    if (userRole && userRole !== "Desconocido") setView(initialView);
  }, [userRole, initialView]);

  useEffect(() => {
    if (!user || userRole === "Desconocido" || userRole === null || userEmpresa === null) return;
    setLoadingData(true);

    const unsubs = [];
    
    const handleError = (error) => {
      console.error("Error de Lectura Firebase:", error);
      if (error.code === "permission-denied") revokeAccess();
    };

    let qcampos, qworkers, qcontractors, qcred;

    if (userEmpresa !== "TODAS") {
      qcampos = query(collection(db, "campos"), where("empresaRut", "==", userEmpresa));
      qworkers = query(collection(db, "workers"), where("empresaRut", "==", userEmpresa));
      qcontractors = query(collection(db, "contractors"), where("empresaRut", "==", userEmpresa));
      qcred = query(collection(db, "credentials"), where("empresaRut", "==", userEmpresa));
    } else {
      qcampos = query(collection(db, "campos"), orderBy("creadoEn", "desc"));
      qworkers = query(collection(db, "workers"), orderBy("creadoEn", "desc"));
      qcontractors = query(collection(db, "contractors"), orderBy("creadoEn", "desc"));
      qcred = query(collection(db, "credentials"), orderBy("creadoEn", "desc"));
    }

    unsubs.push(onSnapshot(qcampos, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
      if (userEmpresa !== "TODAS") docs.sort((a,b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
      setCamposList(docs.filter(i => !i.eliminado));
    }, handleError));

    if (userRole === "Admin" || userRole === "Supervisor") {
      unsubs.push(onSnapshot(qworkers, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
        if (userEmpresa !== "TODAS") docs.sort((a,b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
        setWorkers(docs);
      }, handleError));
      
      unsubs.push(onSnapshot(qcontractors, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
        if (userEmpresa !== "TODAS") docs.sort((a,b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
        setContractors(docs);
      }, handleError));
      
      unsubs.push(onSnapshot(qcred, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })).filter(i => !i.eliminado);
        if (userEmpresa !== "TODAS") docs.sort((a,b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
        setCredentials(docs);
      }, handleError));
    }

    // Los Operadores no cargan la lista completa de contratistas, pero sí
    // necesitan los asignados a cosecha para el desplegable de impresión de bins.
    if (userRole === "Operador") {
      let qCosecha;
      if (userEmpresa !== "TODAS") {
        qCosecha = query(collection(db, "contractors"), where("empresaRut", "==", userEmpresa), where("asignadoCosecha", "==", true));
      } else {
        qCosecha = query(collection(db, "contractors"), where("asignadoCosecha", "==", true));
      }
      unsubs.push(onSnapshot(qCosecha, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
        setContractors(docs);
      }, handleError));
    }

    if (userRole === "Admin") {
      const qroles = query(collection(db, "userRoles"), orderBy("creadoEn", "desc"), limit(100));
      unsubs.push(onSnapshot(qroles, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
        setRolesList(docs);
      }, handleError));
    }

    setLoadingData(false);
    return () => unsubs.forEach(unsub => unsub());
  }, [user, userRole, userEmpresa, revokeAccess]);

  const handleLogin = login;
  const handleLogout = async () => { await logout(); setView("tarjas"); };

  const handleBulkUploadCredentials = async (credsArray, targetEmpresa) => {
    setLoadingData(true);
    try {
      const batch = writeBatch(db);
      credsArray.forEach(cred => {
        const docRef = doc(collection(db, "credentials"));
        batch.set(docRef, { folio: cred.folio, codigo: cred.codigo, empresaRut: targetEmpresa, estado: "Disponible", asignadoA: null, creadoEn: serverTimestamp(), eliminado: false });
      });
      await batch.commit();
      toast.success("Credenciales inyectadas");
    } catch (error) { toast.error("Error al cargar códigos: " + error.message); }
    setLoadingData(false);
  };

  const handleDeleteCredential = async (id) => {
    if (!window.confirm("¿Seguro que deseas borrar esta credencial?")) return;
    try { await updateDoc(doc(db, "credentials", id), { eliminado: true, eliminadoEn: serverTimestamp() }); toast.success("Credencial eliminada");
    } catch (e) { toast.error("Error al eliminar: " + e.message); }
  };

  const handleBulkUploadContractors = async (items) => {
    setLoadingData(true);
    try {
      const batch = writeBatch(db);
      items.forEach(item => {
        const docRef = doc(collection(db, "contractors"));
        batch.set(docRef, { ...item, creadoEn: serverTimestamp() });
      });
      await batch.commit();
      toast.success(`${items.length} contratistas cargados`);
      setView("contractors_list");
    } catch (error) { toast.error("Error al cargar masivamente: " + error.message); }
    setLoadingData(false);
  };

  const handleBulkUploadCampos = async (items) => {
    setLoadingData(true);
    try {
      const batch = writeBatch(db);
      items.forEach(item => {
        const docRef = doc(collection(db, "campos"));
        batch.set(docRef, { ...item, creadoEn: serverTimestamp(), eliminado: false });
      });
      await batch.commit();
      toast.success(`${items.length} cuarteles cargados exitosamente.`);
    } catch (error) { toast.error("Error al cargar cuarteles: " + error.message); }
    setLoadingData(false);
  };

const handleSaveUserRole = async (emailToSave, rolToSave, empresaRutToSave) => {
    try { 
      // 1. Guardamos el acceso en la tabla de roles
      await setDoc(doc(db, "userRoles", emailToSave), { 
        rol: rolToSave, 
        empresaRut: empresaRutToSave, 
        creadoEn: serverTimestamp() 
      }); 
      
      // 2. Preparamos los datos para el correo
      const appUrl = window.location.origin; 
      const nombreEmpresa = empresaRutToSave === "TODAS" ? "todas las empresas" : EMPRESAS_MAESTRAS.find(e => e.rut === empresaRutToSave)?.nombre || "tu empresa";
      
      // 3. Escribimos en la colección "mail" para despertar a la extensión Trigger Email
      await addDoc(collection(db, "mail"), {
        to: emailToSave,
        message: {
          subject: "Invitación de Acceso - AgroTrack",
          html: `
            <div style="font-family: Arial, sans-serif; color: #0f172a; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
              <h2 style="color: #101c38;">¡Bienvenido a AgroTrack!</h2>
              <p>Hola,</p>
              <p>Has sido habilitado en el sistema con el rol de <strong>${rolToSave}</strong> para <strong>${nombreEmpresa.replace("AGRICOLA ", "")}</strong>.</p>
              <p>Para ingresar al sistema, haz clic en el botón de abajo e inicia sesión usando exactamente esta misma cuenta de correo de Google (${emailToSave}):</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${appUrl}" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ingresar a la Plataforma</a>
              </div>
              <p style="font-size: 12px; color: #64748b;">Si tienes problemas para ingresar con el botón, copia y pega este enlace en tu navegador: <br>${appUrl}</p>
            </div>
          `
        }
      });

      toast.success(`Acceso guardado e invitación enviada a ${emailToSave}`); 
    } catch (e) { 
      console.error(e);
      toast.error("Error al guardar usuario o enviar invitación."); 
    }
  };

  const handleDeleteUserRole = async (emailToDelete) => {
    if (emailToDelete === user.email.toLowerCase()) return toast.error("No puedes revocar tu propio acceso.");
    if(!window.confirm(`¿Quitar el acceso a ${emailToDelete}?`)) return;
    await deleteDoc(doc(db, "userRoles", emailToDelete)); toast.success("Acceso revocado");
  };

  const handleSaveCampo = async (data, id) => {
    const finalData = { ...data, empresaRut: userEmpresa !== "TODAS" ? userEmpresa : data.empresaRut };
    try {
      if (id) { await updateDoc(doc(db, "campos", id), { ...finalData, actualizadoEn: serverTimestamp() }); toast.success("Centro actualizado"); } 
      else { await addDoc(collection(db, "campos"), { ...finalData, creadoEn: serverTimestamp() }); toast.success("Centro registrado"); }
    } catch (error) { toast.error("Error al guardar: " + error.message); }
  };

  const handleDeleteCampo = async (id) => {
    if (!window.confirm("¿Seguro que deseas ocultar este Centro de Costo?")) return;
    try { await updateDoc(doc(db, "campos", id), { eliminado: true, eliminadoEn: serverTimestamp() }); toast.success("Centro ocultado"); } catch (e) { toast.error("Error: " + e.message); }
  };

  // ===================================================================
  //  ASIGNACIÓN ATÓMICA DE CREDENCIALES
  //  Reserva una credencial disponible dentro de una transacción de
  //  Firestore. Esto evita que dos operadores simultáneos reciban el
  //  MISMO folio (condición de carrera). La transacción vuelve a leer
  //  el estado en el servidor y solo asigna si sigue "Disponible".
  //
  //  Devuelve { codigoQR, folioQR } o lanza error si algo falla.
  //  Si no hay credenciales precargadas para la empresa, genera un
  //  código automático (fallback), igual que la lógica original.
  // ===================================================================
  const asignarCredencialAtomica = async (targetRut, rutTrabajador) => {
    // 1. Buscamos candidatas disponibles de la empresa (fuera de la
    //    transacción, solo para acotar; la verificación real es dentro).
    const qDisponibles = query(
      collection(db, "credentials"),
      where("empresaRut", "==", targetRut),
      where("estado", "==", "Disponible")
    );
    const snap = await getDocs(qDisponibles);
    const candidatas = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => !c.eliminado)
      .sort((a, b) => String(a.folio).localeCompare(String(b.folio), undefined, { numeric: true, sensitivity: "base" }));

    // 2. Intentamos reservar la primera que siga libre en el servidor.
    for (const cand of candidatas) {
      try {
        const asignada = await runTransaction(db, async (tx) => {
          const ref = doc(db, "credentials", cand.id);
          const fresh = await tx.get(ref);
          if (!fresh.exists()) return null;
          const data = fresh.data();
          // Verificación atómica: ¿sigue disponible?
          if (data.estado !== "Disponible" || data.eliminado) return null;
          tx.update(ref, { estado: "Asignado", asignadoA: rutTrabajador, actualizadoEn: serverTimestamp() });
          return { codigoQR: data.codigo, folioQR: data.folio };
        });
        if (asignada) return asignada; // reserva exitosa
        // si fue null, otro se la llevó: probamos la siguiente
      } catch (e) {
        console.error("Reintentando asignación de credencial:", e);
        // conflicto de transacción: probamos la siguiente candidata
      }
    }

    // 3. Fallback: no había credenciales precargadas disponibles.
    return {
      codigoQR: generateWorkerCode(),
      folioQR: "V-AUTO-" + Math.floor(Math.random() * 10000),
    };
  };

  // Libera la credencial de un trabajador (al desactivar / eliminar).
  const liberarCredencial = async (codigoQR, folioQR, targetRut) => {
    if (!codigoQR) return;
    const credDoc = credentials.find(c => c.codigo === codigoQR && c.empresaRut === targetRut);
    if (credDoc) {
      await updateDoc(doc(db, "credentials", credDoc.id), { estado: "Disponible", asignadoA: null, actualizadoEn: serverTimestamp() });
    } else {
      // La credencial no existe en catálogo: la recreamos como disponible.
      await addDoc(collection(db, "credentials"), {
        folio: folioQR || "RECICLADO-" + Math.floor(Math.random() * 1000),
        codigo: codigoQR, empresaRut: targetRut, estado: "Disponible",
        asignadoA: null, creadoEn: serverTimestamp(), eliminado: false,
      });
    }
  };

  const handleSaveWorker = async (form) => {
    const rutExiste = workers.some(w => w.rut === form.rut && (!editTarget || w.id !== editTarget.id));
    if (rutExiste) throw new Error("RUT ya registrado.");
    let finalForm = { ...form, empresaRut: userEmpresa !== "TODAS" ? userEmpresa : form.empresaRut };
    const targetRut = finalForm.empresaRut;

    try {
      if (!editTarget) {
        // --- Registro nuevo: asignación atómica de credencial ---
        const cred = await asignarCredencialAtomica(targetRut, form.rut);
        finalForm.codigoQR = cred.codigoQR;
        finalForm.folioQR = cred.folioQR;
        await addDoc(collection(db, "workers"), { ...finalForm, creadoEn: serverTimestamp() });
        toast.success("Trabajador registrado.");
      } else {
        // --- Edición ---
        if (form.estado === "Inactivo" && editTarget.codigoQR) {
          // Desactivación: liberamos la credencial.
          await liberarCredencial(editTarget.codigoQR, editTarget.folioQR, targetRut);
          finalForm.codigoQR = null;
          finalForm.folioQR = null;
        } else if (form.estado === "Activo" && editTarget.estado === "Inactivo" && !editTarget.codigoQR) {
          // Reactivación sin credencial: asignamos una nueva atómicamente.
          const today = new Date();
          finalForm.fechaIngreso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
          const cred = await asignarCredencialAtomica(targetRut, form.rut);
          finalForm.codigoQR = cred.codigoQR;
          finalForm.folioQR = cred.folioQR;
        }
        await updateDoc(doc(db, "workers", editTarget.id), { ...finalForm, actualizadoEn: serverTimestamp() });
        toast.success("Ficha actualizada.");
      }
      setView("workers_list");
      setEditTarget(null);
    } catch (error) {
      console.error("Error al guardar trabajador:", error);
      toast.error("No se pudo guardar: " + error.message);
      throw error; // el formulario puede reaccionar al fallo
    }
  };

  const handleSaveContractor = async (form) => {
    let finalForm = { ...form, empresaRut: userEmpresa !== "TODAS" ? userEmpresa : form.empresaRut };
    try {
      if (editTarget) {
        await updateDoc(doc(db, "contractors", editTarget.id), { ...finalForm, actualizadoEn: serverTimestamp() });
        toast.success("Contratista actualizado.");
      } else {
        await addDoc(collection(db, "contractors"), { ...finalForm, creadoEn: serverTimestamp() });
        toast.success("Contratista registrado.");
      }
      setView("contractors_list");
      setEditTarget(null);
    } catch (error) {
      console.error("Error al guardar contratista:", error);
      toast.error("No se pudo guardar el contratista: " + error.message);
    }
  };

  const handleToggleCosecha = async (item) => {
    try {
      await updateDoc(doc(db, "contractors", item.id), {
        asignadoCosecha: !item.asignadoCosecha,
        actualizadoEn: serverTimestamp(),
      });
      toast.success(item.asignadoCosecha ? "Contratista quitado de cosecha." : "Contratista asignado a cosecha.");
    } catch (e) {
      console.error("Error al cambiar asignación de cosecha:", e);
      toast.error("No se pudo actualizar: " + e.message);
    }
  };

  const handleToggleEstado = async (item, collectionName) => {
    const nuevoEstado = item.estado === "Activo" ? "Inactivo" : "Activo";
    try {
      if (collectionName === "workers") {
        const targetRut = item.empresaRut || userEmpresa;
        if (nuevoEstado === "Activo") {
          if (!window.confirm(`¿Seguro que deseas Reactivar a ${item.nombre}? Su fecha de ingreso se actualizará a hoy.`)) return;
          const today = new Date();
          const fechaHoy = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
          let updates = { estado: nuevoEstado, fechaIngreso: fechaHoy, actualizadoEn: serverTimestamp() };
          if (!item.codigoQR) {
            const cred = await asignarCredencialAtomica(targetRut, item.rut);
            updates.codigoQR = cred.codigoQR;
            updates.folioQR = cred.folioQR;
          }
          await updateDoc(doc(db, collectionName, item.id), updates);
        } else {
          if (!window.confirm(`¿Seguro que deseas Desactivar a ${item.nombre}? Su credencial quedará libre para su empresa.`)) return;
          await liberarCredencial(item.codigoQR, item.folioQR, targetRut);
          await updateDoc(doc(db, collectionName, item.id), { estado: nuevoEstado, codigoQR: null, folioQR: null, actualizadoEn: serverTimestamp() });
        }
      } else {
        await updateDoc(doc(db, collectionName, item.id), { estado: nuevoEstado, actualizadoEn: serverTimestamp() });
      }
      toast.success("Estado actualizado.");
    } catch (error) {
      console.error("Error al cambiar estado:", error);
      toast.error("No se pudo actualizar el estado: " + error.message);
    }
  };

  const handleDeleteRecord = async (item, collectionName) => {
    if (!window.confirm(`¿Seguro que deseas ELIMINAR permanentemente a ${item.nombre}?`)) return;
    try {
      if (collectionName === "workers" && item.codigoQR) {
        const targetRut = item.empresaRut || userEmpresa;
        await liberarCredencial(item.codigoQR, item.folioQR, targetRut);
      }
      await deleteDoc(doc(db, collectionName, item.id));
      toast.success("Registro eliminado");
    } catch (e) {
      console.error("Error al eliminar:", e);
      toast.error("Error al eliminar: " + e.message);
    }
  };

  const isWorkerView = view.includes("workers");
  const listToFilter = isWorkerView ? workers : contractors;
  
  const { filteredList, listaParaStats } = useMemo(() => {
    const stats = listToFilter.filter(item => {
      const empresaAFiltrar = userEmpresa !== "TODAS" ? userEmpresa : filterEmpresaList;
      return empresaAFiltrar === "TODAS" || item.empresaRut === empresaAFiltrar;
    });
    const filtered = stats.filter((item) => {
      const q = search.toLowerCase();
      const matchesSearch = !q || item.nombre?.toLowerCase().includes(q) || item.rut?.toLowerCase().includes(q) || item.apellido?.toLowerCase().includes(q) || item.contratista?.toLowerCase().includes(q) || item.folioQR?.toLowerCase().includes(q); 
      const matchesEstado = filterEstado === "Todos" || item.estado === filterEstado;
      return matchesSearch && matchesEstado;
    });
    return { filteredList: filtered, listaParaStats: stats };
  }, [listToFilter, search, filterEstado, filterEmpresaList, userEmpresa]);

  if (authLoading || (user && userRole === null)) return <div className="splash"><div className="splash-spinner" /></div>;
  if (!user) return (
    <div className="login-screen">
      <Toaster position="top-center" />
      <div className="login-card">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
          <img src="/convento.png" alt="Convento Viejo" style={{ height: '45px', objectFit: 'contain' }} onError={(e) => e.target.style.display = 'none'} />
          <div style={{ height: '30px', width: '2px', backgroundColor: '#e2e8f0' }}></div>
          <img src="/torretagle.png" alt="Torretagle" style={{ height: '45px', objectFit: 'contain' }} onError={(e) => e.target.style.display = 'none'} />
        </div>
        <h1 className="login-title">AgroTrack</h1>
        <p className="login-sub">Control de trazabilidad, personal y cosecha</p>
        <button className="btn-google" onClick={handleLogin}>Ingresar con Google</button>
      </div>
    </div>
  );

  if (userRole === "Desconocido") return (
    <div className="login-screen">
      <div className="login-card" style={{ borderTop: "4px solid #ef4444" }}>
        <h1 className="login-title" style={{color: "#ef4444"}}>Acceso Denegado</h1>
        <p className="login-sub">El correo <b>{user.email}</b> no está autorizado en el sistema.</p>
        <button className="btn-secondary" onClick={handleLogout} style={{marginTop: "20px"}}>Cerrar Sesión</button>
      </div>
    </div>
  );

  const empresasDisponiblesPanel = userEmpresa === "TODAS" ? EMPRESAS_MAESTRAS : EMPRESAS_MAESTRAS.filter(e => e.rut === userEmpresa);

  // 🔥 Estilos base para los botones del menú de navegación 🔥
  const getTabStyle = (isActive, colorActivo = "#101c38") => ({
    padding: "8px 14px",
    border: "none",
    borderRadius: "6px",
    backgroundColor: isActive ? colorActivo : "transparent",
    color: isActive ? "#ffffff" : "#475569",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "13px",
    transition: "all 0.2s ease-in-out",
    whiteSpace: "nowrap"
  });

  return (
    <div className="app-layout">
      <Toaster position="top-center" />
      <header className="topbar">
        <div className="topbar-brand">
          {userEmpresa === "TODAS" ? (
            <>
              <img src={LOGOS_EMPRESAS["79.737.880-1"]} alt="Convento Viejo" style={{ height: '35px', objectFit: 'contain' }} />
              <div style={{ height: '25px', width: '1px', backgroundColor: '#cbd5e1' }}></div>
              <img src={LOGOS_EMPRESAS["76.064.746-2"]} alt="Torretagle" style={{ height: '35px', objectFit: 'contain' }} />
            </>
          ) : userEmpresa && LOGOS_EMPRESAS[userEmpresa] ? (
            <img src={LOGOS_EMPRESAS[userEmpresa]} alt="Logo Empresa" style={{ height: '40px', objectFit: 'contain' }} />
          ) : (
            <span className="topbar-title" style={{ color: '#101c38', fontWeight: 'bold', fontSize: '18px' }}>Control de Campo</span>
          )}
        </div>
        
        <div className="topbar-user" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {!isOnline && <span style={{ background: "#ef4444", color: "white", padding: "4px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}>📵 OFFLINE</span>}
          <span style={{fontSize: "11px", fontWeight: "bold", textTransform: "uppercase"}}>{userRole}</span>
          <img src={user.photoURL} alt={user.displayName} className="user-avatar" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
          <span className="user-name" style={{ fontWeight: '600', fontSize: '14px' }}>{user.displayName}</span>
          <button className="btn-logout" onClick={handleLogout} style={{ marginLeft: '10px', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}>Salir</button>
        </div>
      </header>

      <main className="main-content" style={{ padding: "20px" }}>
        
        {/* 🔥 NUEVO MENÚ ENCAPSULADO Y COMPACTO 🔥 */}
        <div className="view-tabs" style={{ 
          display: "flex", 
          gap: "8px", 
          marginBottom: "25px", 
          flexWrap: "wrap", 
          alignItems: "center",
          background: "#ffffff",
          padding: "10px",
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
        }}>
          {(userRole === "Admin" || userRole === "Supervisor") && (
            <>
              <button onClick={() => { setView("workers_list"); setSearch(""); setEditTarget(null); }} style={getTabStyle(view.includes("workers"))}>
                👥 Personal
              </button>
              
              <button onClick={() => { setView("cuadrillas"); setSearch(""); setEditTarget(null); }} style={getTabStyle(view === "cuadrillas")}>
                🧑‍🤝‍🧑 Cuadrillas
              </button>
              
              <button onClick={() => { setView("contractors_list"); setSearch(""); setEditTarget(null); }} style={getTabStyle(view.includes("contractors"))}>
                🏢 Contratistas
              </button>
            </>
          )}

          <button onClick={() => { setView("tarjas"); setSearch(""); setEditTarget(null); }} style={getTabStyle(view === "tarjas", "#16a34a")}>
            🏷️ Tarjas de Cosecha
          </button>
          
          {userRole === "Admin" && (
            <>
              <button onClick={() => { setView("campos"); setSearch(""); setEditTarget(null); }} style={getTabStyle(view === "campos", "#b45309")}>
                📍 Campos y C. Costo
              </button>
              <button onClick={() => { setView("credentials_list"); setSearch(""); setEditTarget(null); }} style={getTabStyle(view === "credentials_list")}>
                🪪 Gestión Credenciales
              </button>
              <button onClick={() => { setView("users"); setSearch(""); setEditTarget(null); }} style={getTabStyle(view === "users", "#ef4444")}>
                🛡️ Usuarios
              </button>
            </>
          )}
        </div>

        <Suspense fallback={<div className="loading-wrap"><div className="splash-spinner" /></div>}>
          {view === "workers_form" && <WorkerForm onSave={handleSaveWorker} onCancel={() => setView("workers_list")} initial={editTarget} contractorsList={contractors} credentialsList={credentials} userEmpresa={userEmpresa} />}
          {view === "contractors_form" && <ContractorForm onSave={handleSaveContractor} onCancel={() => setView("contractors_list")} initial={editTarget} userEmpresa={userEmpresa} />}
          {view === "contractors_bulk" && userRole === "Admin" && userEmpresa === "TODAS" && <ContractorsBulkManager onBulkUpload={handleBulkUploadContractors} onCancel={() => setView("contractors_list")} loading={loadingData} />}
          {view === "tarjas" && <TarjasManager camposList={camposList} empresasMaestras={empresasDisponiblesPanel} contractorsList={contractors} userRole={userRole} />}
          
          {view === "campos" && userRole === "Admin" && <CamposManager camposList={camposList} onSave={handleSaveCampo} onBulkUpload={handleBulkUploadCampos} onDelete={handleDeleteCampo} loading={loadingData} empresasMaestras={empresasDisponiblesPanel} userEmpresa={userEmpresa} />}
          
          {view === "cuadrillas" && (userRole === "Admin" || userRole === "Supervisor") && <CuadrillasManager workersList={workers} userEmpresa={userEmpresa} empresasMaestras={empresasDisponiblesPanel} />}

          {view === "users" && userRole === "Admin" && <UsersManager rolesList={rolesList} onSaveUser={handleSaveUserRole} onDeleteUser={handleDeleteUserRole} />}
          {view === "credentials_list" && userRole === "Admin" && <CredentialsManager credentialsList={credentials} onBulkUpload={handleBulkUploadCredentials} onDelete={handleDeleteCredential} loading={loadingData} userEmpresa={userEmpresa} />}
        </Suspense>

        {(view === "workers_list" || view === "contractors_list") && (userRole === "Admin" || userRole === "Supervisor") && (
          <>
            <div className="stats-row">
              <div className="stat-card"><div className="stat-label">Total {isWorkerView ? "Trabajadores" : "Empresas"}</div><div className="stat-num">{listaParaStats.length}</div></div>
              <div className="stat-card stat-activo"><div className="stat-label">Activos</div><div className="stat-num">{listaParaStats.filter(w => w.estado === "Activo").length}</div></div>
              <div className="stat-card stat-inactivo"><div className="stat-label">Inactivos</div><div className="stat-num">{listaParaStats.filter(w => w.estado === "Inactivo").length}</div></div>
            </div>

            <div className="toolbar">
              <input className="search-input" placeholder={isWorkerView ? "Buscar trabajador..." : "Buscar contratista..."} value={search} onChange={(e) => setSearch(e.target.value)} />
              
              {userEmpresa === "TODAS" && (
                <select className="filter-select" value={filterEmpresaList} onChange={(e) => setFilterEmpresaList(e.target.value)}>
                  <option value="TODAS">Todas las Empresas</option>
                  {EMPRESAS_MAESTRAS.map(emp => <option key={emp.rut} value={emp.rut}>{emp.nombre.replace("AGRICOLA ", "")}</option>)}
                </select>
              )}

              <select className="filter-select" value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)}>
                <option value="Todos">Todos los Estados</option><option value="Activo">Activos</option><option value="Inactivo">Inactivos</option>
              </select>
              
              <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
                {!isWorkerView && userEmpresa === "TODAS" && (
                  <button className="btn-secondary" onClick={() => { setEditTarget(null); setView("contractors_bulk"); }}>📤 Carga Masiva (CSV)</button>
                )}
                
                <button className="btn-primary" onClick={() => { setEditTarget(null); setView(isWorkerView ? "workers_form" : "contractors_form"); }}>+ Nuevo {isWorkerView ? "Trabajador" : "Contratista"}</button>
              </div>
            </div>

            {loadingData ? (
              <div className="loading-wrap"><div className="splash-spinner" /></div>
            ) : filteredList.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">🔍</div><p>No se encontraron resultados.</p></div>
            ) : (
              <div className="table-wrap">
                <table className="workers-table">
                  <thead>
                    <tr>
                      <th>RUT</th>
                      <th>Nombre</th>
                      {userEmpresa === "TODAS" && <th>Empresa</th>}
                      {isWorkerView ? <th>Contratista</th> : <th>Contacto</th>}
                      {isWorkerView && <th>Cargo</th>}
                      {isWorkerView && <th>Folio Credencial</th>}
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.map((item) => {
                      const empAsociada = EMPRESAS_MAESTRAS.find(e => e.rut === item.empresaRut);
                      return (
                      <tr key={item.id}>
                        <td className="cell-mono">{formatRut(item.rut)}</td>
                        <td className="cell-name">{item.nombre} {isWorkerView ? item.apellido : ""}</td>
                        
                        {userEmpresa === "TODAS" && (
                          <td style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>
                            {empAsociada ? empAsociada.nombre.replace("AGRICOLA ", "") : "—"}
                          </td>
                        )}

                        <td>{isWorkerView ? (item.contratista || "—") : (item.contacto || "—")}</td>
                        
                        {isWorkerView && <td style={{ fontSize: "12px", color: "#64748b" }}>{item.cargo || "—"}</td>}

                        {isWorkerView && (
                          <td className="cell-mono" style={{color: "#64748b", fontWeight: "600"}}>
                            {item.estado === "Inactivo" ? "—" : (item.folioQR || "—")}
                          </td>
                        )}

                        <td><span className={`badge ${item.estado === "Activo" ? "badge-activo" : "badge-inactivo"}`}>{item.estado}</span></td>
                        <td className="cell-actions">
                          
                          {isWorkerView && item.codigoQR && item.estado === "Activo" && (
                            <button className="btn-action" title="Ver QR" onClick={() => setQrWorker(item)}>QR</button>
                          )}

                          {!isWorkerView && (
                            <button
                              className="btn-action"
                              title={item.asignadoCosecha ? "Quitar de cosecha" : "Asignar a cosecha"}
                              onClick={() => handleToggleCosecha(item)}
                              style={{
                                background: item.asignadoCosecha ? "#dcfce7" : "transparent",
                                borderColor: item.asignadoCosecha ? "#16a34a" : undefined,
                              }}
                            >
                              🍇
                            </button>
                          )}

                          <button className="btn-action" title="Editar" onClick={() => { setEditTarget(item); setView(isWorkerView ? "workers_form" : "contractors_form"); }}>✏️</button>
                          <button className={`btn-action ${item.estado === "Activo" ? "btn-action-warn" : "btn-action-ok"}`} onClick={() => handleToggleEstado(item, isWorkerView ? "workers" : "contractors")}>
                            {item.estado === "Activo" ? "🔴" : "🟢"}
                          </button>

                          {userEmpresa === "TODAS" && (
                            <button className="btn-action btn-action-warn" title="Eliminar Permanentemente" onClick={() => handleDeleteRecord(item, isWorkerView ? "workers" : "contractors")}>🗑️</button>
                          )}

                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>

      <Suspense fallback={null}>
        {qrWorker && <QRCard worker={qrWorker} logoUrl={LOGOS_EMPRESAS[qrWorker.empresaRut]} onClose={() => setQrWorker(null)} />}
      </Suspense>
    </div>
  );
}