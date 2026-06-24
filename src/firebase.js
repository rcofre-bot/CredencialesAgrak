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
// 🔥 Importamos la forma MODERNA de activar el caché en la versión 10+ de Firebase
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

// ⚠️ MANTÉN TUS PROPIAS CREDENCIALES AQUÍ ⚠️
const firebaseConfig = {
  apiKey: "AIzaSyD0u_0c0yKTnLarvpdar0ruIZ_-X_khWUs",
  authDomain: "credencialesagrak.firebaseapp.com",
  projectId: "credencialesagrak",
  storageBucket: "credencialesagrak.firebasestorage.app",
  messagingSenderId: "1015802774112",
  appId: "1:1015802774112:web:80cc18c423cea86b26f905"
 };

// 1. Inicializamos la app
const app = initializeApp(firebaseConfig);

// 2. Inicializamos Autenticación
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// 3. 🔥 Inicializamos Firestore con el Modo Offline Moderno (Soporta múltiples pestañas)
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export { db, auth, googleProvider };