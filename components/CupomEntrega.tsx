import React from "react";
import { Order } from "../types";

export const CupomEntrega: React.FC<{ 
    order: Order | null, 
    printerName?: string, 
    customText?: string,
    title?: string,
    subtitle?: string,
    docName?: string
}> = ({ order, printerName, customText, title, subtitle, docName }) => {
  if (!order) return null;

  // Safe data mapping
  const id = order.id || '';
  const codigo = id.slice(0, 6).toUpperCase();
  const dateObj = new Date(order.createdAt || Date.now());
  const dataHora = dateObj.toLocaleDateString('pt-BR') + ' ' + dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  
  const cliente = order.userName || 'N/D';
  const cpfCliente = order.userCpf || '';
  
  const recuperando = order.inmateName || 'N/D';
  const cpfRecuperando = order.inmateCpf || '';
  
  // Robust Location Mapping: Checks both PT and EN keys to prevent empty data
  const rawLoc = order.inmateLocation || order.deliveryLocation || {};
  const location = {
      raio: rawLoc.raio || rawLoc.ray || '___',
      ala: rawLoc.ala || rawLoc.wing || '___',
      cela: rawLoc.cela || rawLoc.cell || '___'
  };

  const items = order.items || [];
  const total = Number(order.total) || 0;

  const statusMap: Record<string, string> = {
      'pending': 'PENDENTE (VERIFICAR PAGAMENTO)',
      'pending_payment': 'AGUARDANDO PAGAMENTO',
      'paid': 'PAGO (LIBERADO)',
      'preparing': 'EM SEPARAÇÃO',
      'out_for_delivery': 'SAIU P/ ENTREGA',
      'delivered': 'ENTREGUE',
      'cancelled': 'CANCELADO'
  };
  const statusDesc = statusMap[(order.status||'').toLowerCase()] || (order.status || '').toUpperCase();

  return (
    <div
      className="print-thermal"
      style={{
        backgroundColor: "#ffffff",
        color: "#000000",
        padding: "0",
        fontFamily: "'Courier New', Courier, monospace",
        width: "80mm",
        maxWidth: "80mm",
        margin: "0 auto",
        fontSize: "12px",
        lineHeight: "1.1",
        boxSizing: "border-box"
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <h2 style={{ fontWeight: "900", fontSize: "16px", margin: "0", textTransform: "uppercase" }}>
          {title || 'ASSPEN - Gestão'}
        </h2>
        <div style={{ fontSize: "10px" }}>
          {subtitle || 'CDP Peixoto de Azevedo - MT'}
        </div>
      </div>

      <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: "5px", marginBottom: "8px" }}>
        <h3 style={{ fontWeight: "900", fontSize: "14px", margin: "0" }}>{docName || 'CUPOM DE ENTREGA'}</h3>
        <div style={{ fontSize: "11px" }}>{dataHora}</div>
      </div>

      {/* Order ID */}
      <div style={{ marginBottom: "8px", borderBottom: "1px dashed #000", paddingBottom: "4px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: "bold" }}>PEDIDO:</span>
            <span style={{ fontWeight: "900", fontSize: "14px" }}>#{codigo}</span>
        </div>
        <div style={{ fontSize: "10px" }}>ID: {id}</div>
      </div>

      {/* Customer Data */}
      <div style={{ marginBottom: "6px" }}>
        <div style={{ fontWeight: "bold", fontSize: "10px", textTransform: "uppercase", backgroundColor: "#eee", padding: "1px 0" }}>FAMILIAR (CLIENTE)</div>
        <div style={{ textTransform: "uppercase", fontWeight: "bold" }}>{cliente}</div>
        <div style={{ fontSize: "11px" }}>CPF: {cpfCliente}</div>
      </div>

      {/* Inmate Data */}
      <div style={{ marginBottom: "8px" }}>
        <div style={{ fontWeight: "bold", fontSize: "10px", textTransform: "uppercase", backgroundColor: "#eee", padding: "1px 0" }}>RECUPERANDO (DESTINO)</div>
        <div style={{ textTransform: "uppercase", fontWeight: "bold" }}>{recuperando}</div>
        <div style={{ fontSize: "11px" }}>CPF: {cpfRecuperando}</div>
      </div>

      {/* Location - Highlighted */}
      <div style={{ marginBottom: "10px", border: "2px solid #000", padding: "4px" }}>
        <div style={{ fontWeight: "bold", textAlign: "center", fontSize: "10px", backgroundColor: "#000", color: "#fff", marginBottom: "4px" }}>LOCALIZAÇÃO INTERNA</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: "900", padding: "0 5px", textAlign: "center" }}>
            <div>
                <span style={{fontSize: '9px', fontWeight: 'normal', display: 'block'}}>RAIO</span>
                {location.raio}
            </div>
            <div>
                <span style={{fontSize: '9px', fontWeight: 'normal', display: 'block'}}>ALA</span>
                {location.ala}
            </div>
            <div>
                <span style={{fontSize: '9px', fontWeight: 'normal', display: 'block'}}>CELA</span>
                {location.cela}
            </div>
        </div>
      </div>

      {/* Items */}
      <div style={{ marginBottom: "8px" }}>
        <div style={{ fontWeight: "bold", marginBottom: "4px", borderBottom: "1px solid #000" }}>ITENS</div>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            color: "#000000",
            fontSize: "11px"
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px dashed #000", width: "60%" }}>DESC.</th>
              <th style={{ textAlign: "center", borderBottom: "1px dashed #000", width: "15%" }}>QTD</th>
              <th style={{ textAlign: "right", borderBottom: "1px dashed #000", width: "25%" }}>TOT</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx}>
                <td style={{ paddingTop: "2px", fontSize: "10px" }}>{item.name}</td>
                <td style={{ textAlign: "center", paddingTop: "2px", fontWeight: "bold" }}>{item.quantity}</td>
                <td style={{ textAlign: "right", paddingTop: "2px" }}>
                  {(item.quantity * item.priceAtPurchase).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div style={{ borderTop: "2px solid #000", paddingTop: "5px", marginBottom: "10px" }}>
        <div style={{ fontSize: "11px" }}>Itens: {items.length}</div>
        <div style={{ fontWeight: "900", fontSize: "18px", marginTop: "2px", display: "flex", justifyContent: "space-between" }}>
            <span>TOTAL</span>
            <span>R$ {total.toFixed(2)}</span>
        </div>
      </div>

      {/* Status */}
      <div style={{ marginBottom: "15px", textAlign: "center" }}>
          <div style={{ border: "1px solid #000", padding: "4px", fontWeight: "bold", textTransform: "uppercase", fontSize: "12px", backgroundColor: "#f0f0f0" }}>
              {statusDesc}
          </div>
      </div>

      {/* Custom Footer Text */}
      {customText && (
          <div style={{ marginBottom: "10px", fontSize: "10px", fontStyle: "italic", textAlign: "center", border: "1px dotted #000", padding: "4px" }}>
              {customText}
          </div>
      )}

      {/* Footer Audit */}
      <div style={{ marginTop: "5px", fontStyle: "italic", fontSize: "9px", textAlign: "center", borderTop: "1px dotted #000", paddingTop: "5px" }}>
        Imp: {printerName || 'Admin'}
      </div>

      {/* Signature */}
      <div style={{ marginTop: "25px", textAlign: "center" }}>
        <div style={{ borderTop: "1px solid #000", width: "80%", margin: "0 auto 4px auto" }}></div>
        <div style={{ fontSize: "10px", fontWeight: "bold" }}>ASSINATURA RECEBEDOR</div>
        <div style={{ fontSize: "9px" }}>({recuperando})</div>
      </div>

      {/* CUT AREA FOR PRINTER */}
      <div style={{ marginTop: "20px", textAlign: "center", borderTop: "1px dashed #000", paddingTop: "10px" }}>
          <p style={{fontSize: "10px"}}>--- CORTE AQUI ---</p>
          <div style={{ height: "15mm" }}></div> 
      </div>
    </div>
  );
};