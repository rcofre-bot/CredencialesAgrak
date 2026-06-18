// src/firebase.js
// =====================================================
//  CONFIGURACIÓN FIREBASE
//  Reemplaza estos valores con los de tu proyecto Firebase
//  Ve a: https://console.firebase.google.com
//  → Nuevo proyecto → Agrega app web → Copia la config
// =====================================================

// import { initializeApp } from "firebase/app";
// import { getFirestore } from "firebase/firestore";
// import { getAuth, GoogleAuthProvider } from "firebase/auth";
// import { getStorage } from "firebase/storage";

// const firebaseConfig = {
//  apiKey: "AIzaSyD0u_0c0yKTnLarvpdar0ruIZ_-X_khWUs",
//  authDomain: "credencialesagrak.firebaseapp.com",
//  projectId: "credencialesagrak",
//  storageBucket: "credencialesagrak.firebasestorage.app",
//  messagingSenderId: "1015802774112",
//  appId: "1:1015802774112:web:80cc18c423cea86b26f905"
// };

// const app = initializeApp(firebaseConfig);

// export const db = getFirestore(app);
// export const auth = getAuth(app);
// export const storage = getStorage(app);
// export const googleProvider = new GoogleAuthProvider();

// export default app;

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
// 🚨 NUEVO: Importamos las herramientas de caché offline
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

// Tu configuración actual de Firebase (no la borres, deja las tuyas)
const firebaseConfig = {
  apiKey: "AIzaSyD0u_0c0yKTnLarvpdar0ruIZ_-X_khWUs",
  authDomain: "credencialesagrak.firebaseapp.com",
  projectId: "credencialesagrak",
  storageBucket: "credencialesagrak.firebasestorage.app",
  messagingSenderId: "1015802774112",
  appId: "1:1015802774112:web:80cc18c423cea86b26f905"
 };

// Inicializamos la app
const app = initializeApp(firebaseConfig);

// Inicializamos Auth
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// 🚨 NUEVO: Inicializamos Firestore con la Memoria Caché Activada
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export { auth, googleProvider, db };