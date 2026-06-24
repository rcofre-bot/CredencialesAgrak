import { v4 as uuidv4 } from "uuid";

export const EMPRESAS_MAESTRAS = [
  { id: 0, nombre: "AGRICOLA CONVENTO VIEJO SPA", rut: "79.737.880-1", prefijo: "AAON" },
  { id: 1, nombre: "TORRETAGLE", rut: "76.064.746-2", prefijo: "AAON" }
];

export const LOGOS_EMPRESAS = {
  "79.737.880-1": "/convento.png",
  "76.064.746-2": "/torretagle.png"
};

export const formatRut = (value) => {
  if (!value) return "";
  const clean = value.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted}-${dv}`;
};

export const validateRut = (rut) => {
  if (!rut) return false;
  const cleanRut = rut.replace(/[^0-9kK]/g, "").toUpperCase();
  if (cleanRut.length < 2) return false;
  const body = cleanRut.slice(0, -1);
  const dv = cleanRut.slice(-1);
  let sum = 0; let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body.charAt(i)) * multiplier;
    multiplier = multiplier < 7 ? multiplier + 1 : 2;
  }
  const expectedDv = 11 - (sum % 11);
  let calculatedDv = expectedDv === 11 ? "0" : expectedDv === 10 ? "K" : expectedDv.toString();
  return dv === calculatedDv;
};

export const generateWorkerCode = () => JSON.stringify({ id: uuidv4(), type: "worker" });

export const parseDate = (dateStr) => {
  if (!dateStr || !dateStr.includes("-")) return "—";
  const [y, m, d] = dateStr.split("-"); 
  return `${d}/${m}/${y}`;
};

export const EMPTY_WORKER_FORM = { rut: "", nombre: "", apellido: "", contratista: "", fechaIngreso: "", estado: "Activo", empresaRut: "" };
export const EMPTY_CONTRACTOR_FORM = { rut: "", nombre: "", contacto: "", estado: "Activo", empresaRut: "" };