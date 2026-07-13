// src/hooks/useAuth.js
// =====================================================================
//  HOOK DE AUTENTICACIÓN
// =====================================================================
//  Encapsula todo el ciclo de sesión del usuario:
//   - Estado de conexión (online/offline)
//   - Login / logout con Google
//   - Escucha de cambios de sesión (onAuthStateChanged)
//   - Resolución de rol y empresa desde la colección "userRoles"
//   - Vista inicial según el rol
//
//  App.js solo consume los valores y funciones que expone este hook,
//  sin preocuparse de CÓMO se obtienen. El comportamiento es idéntico
//  al que estaba embebido en App.js.
// =====================================================================

import { useState, useEffect, useCallback } from "react";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import toast from "react-hot-toast";
import { db, auth, googleProvider } from "../firebase";

export default function useAuth() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [userEmpresa, setUserEmpresa] = useState(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  // Vista inicial sugerida según el rol (App.js la aplica cuando quiera).
  const [initialView, setInitialView] = useState("tarjas");

  // ---- Conectividad ----
  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); toast.success("Conexión restablecida."); };
    const handleOffline = () => { setIsOnline(false); toast.error("Sin internet. Trabajando offline."); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // ---- Sesión + resolución de rol/empresa ----
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
            setInitialView(assignedRole === "Operador" ? "tarjas" : "workers_list");
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

  // ---- Acciones ----
  const login = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Error al ingresar:", e);
      toast.error("Error al ingresar");
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setUserRole(null);
    setUserEmpresa(null);
  }, []);

  // Degrada el acceso a "Desconocido" (p. ej. si Firestore devuelve
  // permission-denied durante la carga de datos). Antes App.js llamaba
  // setUserRole directamente; ahora lo hace a través de esta función.
  const revokeAccess = useCallback(() => {
    setUserRole("Desconocido");
  }, []);

  return {
    user,
    authLoading,
    userRole,
    userEmpresa,
    isOnline,
    initialView,
    login,
    logout,
    revokeAccess,
  };
}