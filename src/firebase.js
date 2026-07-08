// src/firebase.js
// =====================================================================
//  CONFIGURACIÓN FIREBASE (web)
// =====================================================================
//  La configuración se lee desde variables de entorno (.env) para no
//  dejar credenciales escritas directamente en el código fuente.
//
//  1. Copia .env.example como .env y rellena los valores.
//  2. En Create React App las variables deben empezar por REACT_APP_.
//
//  Nota de seguridad: la apiKey de Firebase web NO es un secreto (viaja
//  al navegador de todas formas). La seguridad real la imponen las
//  reglas de Firestore (ver firestore.rules).
// =====================================================================

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

// Aviso temprano si falta configuración (evita errores confusos en runtime)
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error(
    "⚠️ Falta configuración de Firebase. Revisa tu archivo .env " +
      "(usa .env.example como plantilla) y reinicia el servidor de desarrollo."
  );
}

// 1. Inicializamos la app
const app = initializeApp(firebaseConfig);

// 2. Autenticación con Google
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// 3. Firestore con caché offline moderno (soporta múltiples pestañas)
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export { db, auth, googleProvider };
