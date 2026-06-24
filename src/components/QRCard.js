import React, { useState, useEffect } from "react";
import QRCode from "qrcode";

export default function QRCard({ worker, logoUrl, onClose }) {
  const [qrUrl, setQrUrl] = useState("");

  useEffect(() => {
    if (worker?.codigoQR) {
      QRCode.toDataURL(worker.codigoQR, { 
        width: 300, 
        margin: 1, 
        color: { dark: "#000000", light: "#ffffff" } 
      })
      .then(url => setQrUrl(url))
      .catch(err => console.error("Error generando QR:", err));
    }
  }, [worker]);

  const imprimirCredencial = () => {
    let html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Credencial - ${worker.nombre}</title>
          <style>
            body { font-family: 'Arial', sans-serif; text-align: center; padding: 20px; }
            /* 🔥 AQUÍ ESTÁ EL BORDE OSCURO PARA RECORTAR 🔥 */
            .card { border: 3px solid #101c38; border-radius: 10px; width: 300px; padding: 20px; margin: 0 auto; display: inline-block; }
            
            .logo { max-width: 150px; max-height: 50px; margin-bottom: 15px; }
            .name { font-size: 20px; font-weight: bold; margin: 10px 0 5px 0; }
            .rut { font-size: 16px; color: #333; margin-bottom: 10px; }
            .cargo { font-size: 14px; font-weight: bold; background-color: #f1f5f9; padding: 5px 10px; border-radius: 5px; margin-bottom: 15px; display: inline-block; color: #101c38; border: 1px solid #cbd5e1;}
            .qr { width: 200px; height: 200px; }
            .folio { font-size: 12px; margin-top: 15px; color: #666; }
          </style>
        </head>
        <body>
          <div class="card">
            ${logoUrl ? `<img class="logo" src="${window.location.origin}${logoUrl}" alt="Logo" />` : '<h2>CREDENCIAL</h2>'}
            <div class="name">${worker.nombre} ${worker.apellido}</div>
            <div class="rut">${worker.rut}</div>
            
            ${worker.cargo ? `<div class="cargo">${worker.cargo}</div>` : ''}
            
            <div>
              <img class="qr" src="${qrUrl}" alt="QR Code" />
            </div>
            <div class="folio">FOLIO: ${worker.folioQR || "S/F"}</div>
          </div>
        </body>
      </html>
    `;

    const printFrame = document.createElement("iframe");
    printFrame.style.position = "absolute";
    printFrame.style.width = "0px";
    printFrame.style.height = "0px";
    printFrame.style.border = "none";
    document.body.appendChild(printFrame);
    
    const docFrame = printFrame.contentWindow.document;
    docFrame.open();
    docFrame.write(html);
    docFrame.close();
    
    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
      setTimeout(() => document.body.removeChild(printFrame), 1000);
    }, 500);
  };

  if (!worker) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 }}>
      {/* 🔥 BORDE OSCURO TAMBIÉN EN PANTALLA 🔥 */}
      <div style={{ background: "#fff", border: "3px solid #101c38", padding: "30px", borderRadius: "10px", textAlign: "center", minWidth: "320px", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
        
        {logoUrl && <img src={logoUrl} alt="Logo" style={{ maxHeight: "40px", marginBottom: "15px" }} />}
        
        <h2 style={{ margin: "0 0 5px 0", color: "#0f172a" }}>{worker.nombre} {worker.apellido}</h2>
        <p style={{ margin: "0 0 10px 0", color: "#64748b", fontSize: "16px", fontWeight: "bold" }}>{worker.rut}</p>
        
        {worker.cargo && (
          <div style={{ fontWeight: "bold", marginTop: "5px", marginBottom: "15px", fontSize: "14px", color: "#101c38", background: "#f1f5f9", padding: "5px 15px", borderRadius: "6px", display: "inline-block", border: "1px solid #cbd5e1" }}>
            {worker.cargo}
          </div>
        )}

        <div style={{ margin: "20px 0" }}>
          {qrUrl ? <img src={qrUrl} alt="QR Code" style={{ width: "200px", height: "200px" }} /> : <p>Cargando QR...</p>}
        </div>
        
        <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 20px 0", fontWeight: "bold" }}>FOLIO: {worker.folioQR || "S/F"}</p>
        
        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
          <button onClick={onClose} className="btn-secondary" style={{ flex: 1, padding: "10px" }}>Cerrar</button>
          <button onClick={imprimirCredencial} className="btn-primary" style={{ flex: 1, padding: "10px" }}>🖨️ Imprimir</button>
        </div>
        
      </div>
    </div>
  );
}