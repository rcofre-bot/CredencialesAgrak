import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD0u_0c0yKTnLarvpdar0ruIZ_-X_khWUs",
  authDomain: "credencialesagrak.firebaseapp.com",
  projectId: "credencialesagrak",
  storageBucket: "credencialesagrak.firebasestorage.app",
  messagingSenderId: "1015802774112",
  appId: "1:1015802774112:web:80cc18c423cea86b26f905"
 };

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);