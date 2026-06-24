import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
import {
  collection, addDoc, doc, updateDoc, setDoc, getDoc, query, where, serverTimestamp, writeBatch, deleteDoc, onSnapshot, orderBy, limit
} from "firebase/firestore";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { db, auth, googleProvider } from "./firebase";
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

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [userRole, setUserRole] = useState(null); 
  const [userEmpresa, setUserEmpresa] = useState(null); 
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  
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

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); toast.success("Conexión restablecida."); };
    const handleOffline = () => { setIsOnline(false); toast.error("Sin internet. Trabajando offline."); };
    window.addEventListener("online", handleOnline); window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const roleDoc = await getDoc(doc(db, "userRoles", u.email.toLowerCase()));
          if (roleDoc.exists()) {
            const assignedRole = roleDoc.data().rol;
            const assignedEmpresa = roleDoc.data().empresaRut || "TODAS";
            
            setUserRole(assignedRole);
            setUserEmpresa(assignedEmpresa);
            
            if (assignedRole === "Operador") setView("tarjas");
            else setView("workers_list");
          } else {
            setUserRole("Desconocido"); 
            setUserEmpresa(null);
          }
        } catch (error) {
          console.error("Acceso denegado:", error);
          setUserRole("Desconocido");
          setUserEmpresa(null);
        }
      } else {
        setUserRole(null);
        setUserEmpresa(null);
      }
      setAuthLoading(false);
    });
  }, []);

  // 🔥 SOLUCIÓN DEFINITIVA A REGLAS DE SEGURIDAD E ÍNDICES 🔥
  useEffect(() => {
    if (!user || userRole === "Desconocido" || userRole === null || userEmpresa === null) return;
    setLoadingData(true);

    const unsubs = [];
    
    // Si Firebase rechaza la consulta, nos envía a "Desconocido" (lo que veías como cierre de sesión)
    const handleError = (error) => {
      console.error("Error de Lectura Firebase:", error);
      if (error.code === "permission-denied") setUserRole("Desconocido");
    };

    let qcampos, qworkers, qcontractors, qcred;

    if (userEmpresa !== "TODAS") {
      // Usamos el 'where' para que las Reglas de Seguridad nos dejen pasar.
      // NO usamos 'orderBy' aquí para evitar que Firebase pida el Índice Compuesto.
      qcampos = query(collection(db, "campos"), where("empresaRut", "==", userEmpresa));
      qworkers = query(collection(db, "workers"), where("empresaRut", "==", userEmpresa));
      qcontractors = query(collection(db, "contractors"), where("empresaRut", "==", userEmpresa));
      qcred = query(collection(db, "credentials"), where("empresaRut", "==", userEmpresa));
    } else {
      // El admin global pide todo ordenado normalmente
      qcampos = query(collection(db, "campos"), orderBy("creadoEn", "desc"));
      qworkers = query(collection(db, "workers"), orderBy("creadoEn", "desc"));
      qcontractors = query(collection(db, "contractors"), orderBy("creadoEn", "desc"));
      qcred = query(collection(db, "credentials"), orderBy("creadoEn", "desc"));
    }

    unsubs.push(onSnapshot(qcampos, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
      // Ordenamos manualmente con JS si es supervisor
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

    if (userRole === "Admin") {
      const qroles = query(collection(db, "userRoles"), orderBy("creadoEn", "desc"), limit(100));
      unsubs.push(onSnapshot(qroles, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
        setRolesList(docs);
      }, handleError));
    }

    setLoadingData(false);
    return () => unsubs.forEach(unsub => unsub());
  }, [user, userRole, userEmpresa]);

  const handleLogin = async () => { try { await signInWithPopup(auth, googleProvider); } catch (e) { toast.error("Error al ingresar"); } };
  const handleLogout = async () => { await signOut(auth); setView("tarjas"); setUserRole(null); setUserEmpresa(null); };

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

  const handleSaveWorker = async (form) => {
    const rutExiste = workers.some(w => w.rut === form.rut && (!editTarget || w.id !== editTarget.id));
    if (rutExiste) throw new Error("RUT ya registrado.");
    let finalForm = { ...form, empresaRut: userEmpresa !== "TODAS" ? userEmpresa : form.empresaRut };
    const targetRut = finalForm.empresaRut;
    
    if (!editTarget) {
      const availableCredentials = credentials.filter(c => c.estado === "Disponible" && c.empresaRut === targetRut).sort((a, b) => String(a.folio).localeCompare(String(b.folio), undefined, { numeric: true, sensitivity: 'base' }));
      if (availableCredentials.length > 0) {
        const nextCred = availableCredentials[0]; finalForm.codigoQR = nextCred.codigo; finalForm.folioQR = nextCred.folio;
        updateDoc(doc(db, "credentials", nextCred.id), { estado: "Asignado", asignadoA: form.rut, actualizadoEn: serverTimestamp() }).catch(console.error);
      } else { 
        finalForm.codigoQR = generateWorkerCode(); 
        finalForm.folioQR = "V-AUTO-" + Math.floor(Math.random() * 10000); 
      }
      addDoc(collection(db, "workers"), { ...finalForm, creadoEn: serverTimestamp() }).catch(console.error); 
      toast.success("Trabajador registrado localmente.");
    } else {
      if (form.estado === "Inactivo" && editTarget.codigoQR) {
        const credDoc = credentials.find(c => c.codigo === editTarget.codigoQR && c.empresaRut === targetRut);
        if (credDoc) { updateDoc(doc(db, "credentials", credDoc.id), { estado: "Disponible", asignadoA: null, actualizadoEn: serverTimestamp() }).catch(console.error); } 
        else { addDoc(collection(db, "credentials"), { folio: editTarget.folioQR || "RECICLADO-" + Math.floor(Math.random() * 1000), codigo: editTarget.codigoQR, empresaRut: targetRut, estado: "Disponible", asignadoA: null, creadoEn: serverTimestamp(), eliminado: false }).catch(console.error); }
        finalForm.codigoQR = null; finalForm.folioQR = null;
      } else if (form.estado === "Activo" && editTarget.estado === "Inactivo" && !editTarget.codigoQR) {
        const today = new Date(); finalForm.fechaIngreso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const availableCredentials = credentials.filter(c => c.estado === "Disponible" && c.empresaRut === targetRut).sort((a, b) => String(a.folio).localeCompare(String(b.folio), undefined, { numeric: true, sensitivity: 'base' }));
        if (availableCredentials.length > 0) {
          const nextCred = availableCredentials[0]; finalForm.codigoQR = nextCred.codigo; finalForm.folioQR = nextCred.folio;
          updateDoc(doc(db, "credentials", nextCred.id), { estado: "Asignado", asignadoA: form.rut, actualizadoEn: serverTimestamp() }).catch(console.error);
        } else { 
          finalForm.codigoQR = generateWorkerCode(); 
          finalForm.folioQR = "V-AUTO-" + Math.floor(Math.random() * 10000); 
        }
      }
      updateDoc(doc(db, "workers", editTarget.id), { ...finalForm, actualizadoEn: serverTimestamp() }).catch(console.error); 
      toast.success("Ficha actualizada localmente.");
    }
    setView("workers_list"); setEditTarget(null);
  };

  const handleSaveContractor = async (form) => {
    let finalForm = { ...form, empresaRut: userEmpresa !== "TODAS" ? userEmpresa : form.empresaRut };
    if (editTarget) { updateDoc(doc(db, "contractors", editTarget.id), { ...finalForm, actualizadoEn: serverTimestamp() }).catch(console.error); toast.success("Contratista actualizado.");
    } else { addDoc(collection(db, "contractors"), { ...finalForm, creadoEn: serverTimestamp() }).catch(console.error); toast.success("Contratista registrado."); }
    setView("contractors_list"); setEditTarget(null);
  };

  const handleToggleEstado = async (item, collectionName) => {
    const nuevoEstado = item.estado === "Activo" ? "Inactivo" : "Activo";
    if (collectionName === "workers") {
      const targetRut = item.empresaRut || userEmpresa;
      if (nuevoEstado === "Activo") {
        if (!window.confirm(`¿Seguro que deseas Reactivar a ${item.nombre}? Su fecha de ingreso se actualizará a hoy.`)) return;
        const today = new Date(); const fechaHoy = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        let updates = { estado: nuevoEstado, fechaIngreso: fechaHoy, actualizadoEn: serverTimestamp() };
        if (!item.codigoQR) {
          const availableCredentials = credentials.filter(c => c.estado === "Disponible" && c.empresaRut === targetRut).sort((a, b) => String(a.folio).localeCompare(String(b.folio), undefined, { numeric: true, sensitivity: 'base' }));
          if (availableCredentials.length > 0) {
            const nextCred = availableCredentials[0]; updates.codigoQR = nextCred.codigo; updates.folioQR = nextCred.folio;
            updateDoc(doc(db, "credentials", nextCred.id), { estado: "Asignado", asignadoA: item.rut, actualizadoEn: serverTimestamp() }).catch(console.error);
          } else { updates.codigoQR = generateWorkerCode(); updates.folioQR = "V-AUTO-" + Math.floor(Math.random() * 10000); }
        }
        updateDoc(doc(db, collectionName, item.id), updates).catch(console.error);
      } else {
        if (!window.confirm(`¿Seguro que deseas Desactivar a ${item.nombre}? Su credencial quedará libre para su empresa.`)) return;
        if (item.codigoQR) {
          const credDoc = credentials.find(c => c.codigo === item.codigoQR && c.empresaRut === targetRut);
          if (credDoc) { updateDoc(doc(db, "credentials", credDoc.id), { estado: "Disponible", asignadoA: null, actualizadoEn: serverTimestamp() }).catch(console.error); } 
          else { addDoc(collection(db, "credentials"), { folio: item.folioQR || "RECICLADO-" + Math.floor(Math.random() * 1000), codigo: item.codigoQR, empresaRut: targetRut, estado: "Disponible", asignadoA: null, creadoEn: serverTimestamp(), eliminado: false }).catch(console.error); }
        }
        updateDoc(doc(db, collectionName, item.id), { estado: nuevoEstado, codigoQR: null, folioQR: null, actualizadoEn: serverTimestamp() }).catch(console.error);
      }
    } else { updateDoc(doc(db, collectionName, item.id), { estado: nuevoEstado, actualizadoEn: serverTimestamp() }).catch(console.error); }
    toast.success("Estado actualizado localmente");
  };

  const handleDeleteRecord = async (item, collectionName) => {
    if (!window.confirm(`¿Seguro que deseas ELIMINAR permanentemente a ${item.nombre}?`)) return;
    try {
      if (collectionName === "workers" && item.codigoQR) {
        const targetRut = item.empresaRut || userEmpresa;
        const credDoc = credentials.find(c => c.codigo === item.codigoQR && c.empresaRut === targetRut);
        if (credDoc) { updateDoc(doc(db, "credentials", credDoc.id), { estado: "Disponible", asignadoA: null, actualizadoEn: serverTimestamp() }).catch(console.error); } 
        else { addDoc(collection(db, "credentials"), { folio: item.folioQR || "RECICLADO-" + Math.floor(Math.random() * 1000), codigo: item.codigoQR, empresaRut: targetRut, estado: "Disponible", asignadoA: null, creadoEn: serverTimestamp(), eliminado: false }).catch(console.error); }
      }
      deleteDoc(doc(db, collectionName, item.id)).catch(console.error); toast.success("Registro eliminado");
    } catch (e) { toast.error("Error al eliminar: " + e.message); }
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
        
        <div className="view-tabs" style={{ display: "flex", gap: "10px", marginBottom: "25px", flexWrap: "wrap" }}>
          {(userRole === "Admin" || userRole === "Supervisor") && (
            <>
              <button onClick={() => { setView("workers_list"); setSearch(""); setEditTarget(null); }} style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view.includes("workers") ? "#101c38" : "#f1f5f9", color: view.includes("workers") ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}>👥 Personal</button>
              <button onClick={() => { setView("contractors_list"); setSearch(""); setEditTarget(null); }} style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view.includes("contractors") ? "#101c38" : "#f1f5f9", color: view.includes("contractors") ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}>🏢 Contratistas</button>
            </>
          )}

          <button onClick={() => { setView("tarjas"); setSearch(""); setEditTarget(null); }} style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view === "tarjas" ? "#16a34a" : "#f1f5f9", color: view === "tarjas" ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}>🏷️ Tarjas de Cosecha</button>
          
          {userRole === "Admin" && (
            <>
              <button onClick={() => { setView("campos"); setSearch(""); setEditTarget(null); }} style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view === "campos" ? "#b45309" : "#f1f5f9", color: view === "campos" ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}>📍 Campos y C. Costo</button>
              <button onClick={() => { setView("credentials_list"); setSearch(""); setEditTarget(null); }} style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view === "credentials_list" ? "#101c38" : "#f1f5f9", color: view === "credentials_list" ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}>🪪 Gestión Credenciales</button>
              <button onClick={() => { setView("users"); setSearch(""); setEditTarget(null); }} style={{ padding: "10px 20px", border: "none", borderRadius: "6px", backgroundColor: view === "users" ? "#ef4444" : "#f1f5f9", color: view === "users" ? "#ffffff" : "#475569", cursor: "pointer", fontWeight: "600", fontSize: "14px", transition: "all 0.2s" }}>🛡️ Usuarios</button>
            </>
          )}
        </div>

        <Suspense fallback={<div className="loading-wrap"><div className="splash-spinner" /></div>}>
          {view === "workers_form" && <WorkerForm onSave={handleSaveWorker} onCancel={() => setView("workers_list")} initial={editTarget} contractorsList={contractors} credentialsList={credentials} userEmpresa={userEmpresa} />}
          {view === "contractors_form" && <ContractorForm onSave={handleSaveContractor} onCancel={() => setView("contractors_list")} initial={editTarget} userEmpresa={userEmpresa} />}
          {view === "contractors_bulk" && userRole === "Admin" && userEmpresa === "TODAS" && <ContractorsBulkManager onBulkUpload={handleBulkUploadContractors} onCancel={() => setView("contractors_list")} loading={loadingData} />}
          {view === "tarjas" && <TarjasManager camposList={camposList} empresasMaestras={empresasDisponiblesPanel} />}
          
          {view === "campos" && userRole === "Admin" && <CamposManager camposList={camposList} onSave={handleSaveCampo} onBulkUpload={handleBulkUploadCampos} onDelete={handleDeleteCampo} loading={loadingData} empresasMaestras={empresasDisponiblesPanel} userEmpresa={userEmpresa} />}
          
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