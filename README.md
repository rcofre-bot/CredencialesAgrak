# 👷 Sistema de Registro de Personal con QR

Sistema web para registrar personal, generar códigos QR únicos e imprimir credenciales. Construido con React + Firebase.

---

## 🚀 Instalación local

### 1. Requisitos previos
- [Node.js](https://nodejs.org/) v16 o superior
- Cuenta de Google (para Firebase)

### 2. Clonar o descomprimir el proyecto

```bash
cd worker-registry
npm install
```

---

## 🔥 Configurar Firebase

### Paso 1 — Crear proyecto Firebase
1. Ve a [https://console.firebase.google.com](https://console.firebase.google.com)
2. Clic en **"Agregar proyecto"** → pon un nombre (ej: `registro-personal`)
3. Desactiva Google Analytics si no lo necesitas → **Crear proyecto**

### Paso 2 — Habilitar Authentication con Google
1. En el menú izquierdo → **Authentication** → **Comenzar**
2. Pestaña **"Sign-in method"** → clic en **Google** → Habilitar → Guardar

### Paso 3 — Crear base de datos Firestore
1. En el menú → **Firestore Database** → **Crear base de datos**
2. Elige **"Iniciar en modo de prueba"** (puedes cambiar las reglas después)
3. Selecciona la región más cercana (ej: `us-central1`) → Listo

### Paso 4 — Registrar la app web
1. En la página principal del proyecto → clic en el ícono **`</>`** (Web)
2. Ponle un nombre (ej: `registro-personal-web`) → **Registrar app**
3. Copia el objeto `firebaseConfig` que aparece

### Paso 5 — Pegar la config en el proyecto
Abre el archivo `src/firebase.js` y reemplaza los valores:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### Paso 6 — Configurar reglas de Firestore
En Firebase Console → Firestore → pestaña **"Reglas"**, pega esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /workers/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
Esto requiere que el usuario esté autenticado con Google para leer/escribir.

---

## ▶️ Correr en desarrollo

```bash
npm start
```
Abre [http://localhost:3000](http://localhost:3000)

---

## 🌐 Despliegue gratuito en Netlify

### Opción A — Desde GitHub (recomendado)

1. Sube el proyecto a un repositorio en [GitHub](https://github.com)
2. Ve a [https://app.netlify.com](https://app.netlify.com) → **Add new site** → **Import from Git**
3. Conecta tu repo → configura:
   - **Build command:** `npm run build`
   - **Publish directory:** `build`
4. Clic en **Deploy site**
5. Netlify te dará una URL pública (ej: `https://tu-app.netlify.app`)

### Opción B — Subir manualmente

```bash
npm run build
```
Luego arrastra la carpeta `build/` a [https://app.netlify.com/drop](https://app.netlify.com/drop)

### ⚠️ Importante para Netlify: Redireccionamiento SPA
Crea el archivo `public/_redirects` con este contenido:
```
/*    /index.html   200
```
Esto ya está incluido en el proyecto.

---

## 🔐 Agregar emails autorizados (opcional)

Si quieres que solo ciertos usuarios puedan acceder, en Firebase Console:
- Authentication → Users → puedes ver quién se ha logueado
- Para mayor control, ajusta las reglas de Firestore para verificar el email:

```
allow read, write: if request.auth != null 
  && request.auth.token.email in ['admin@tuempresa.com'];
```

---

## 📋 Estructura del proyecto

```
worker-registry/
├── public/
│   ├── index.html
│   └── _redirects        ← para Netlify
├── src/
│   ├── App.js            ← componente principal
│   ├── App.css           ← estilos
│   ├── firebase.js       ← configuración Firebase ⚠️ editar
│   └── index.js          ← entry point
├── package.json
└── README.md
```

---

## 🏗️ Estructura del QR

Cada QR contiene un JSON con este formato:
```json
{
  "id": "b9d0242b-84fa-4973-b1fb-5872b041e968",
  "type": "worker"
}
```
El `id` es único (UUID v4) y se verifica contra Firestore antes de asignarse.

---

## 📱 Uso del sistema

1. **Login** con cuenta Google autorizada
2. **Registrar** trabajadores con RUT, nombre, apellido, contratista, fecha de ingreso y estado
3. **Subir logo** de empresa (se guarda localmente en el navegador)
4. **Ver QR** de cada trabajador y **imprimir** la credencial
5. **Activar/desactivar** trabajadores con un clic
6. **Buscar** por nombre, RUT o contratista

---

## 🛠️ Tecnologías

| Tecnología | Uso |
|---|---|
| React 18 | Frontend |
| Firebase Auth | Login con Google |
| Firestore | Base de datos en tiempo real |
| qrcode | Generación de QR |
| uuid | Códigos únicos |
| Netlify | Hosting gratuito |
