import React from 'react';

interface CupomEntregaProps {
  order?: any;
  venda?: any;
  printerName?: string;
  customText?: string;
  title?: string;
  subtitle?: string;
  docName?: string;
  remainingBalance?: number;
  onClose?: () => void;
}

export const CupomEntrega: React.FC<CupomEntregaProps> = ({ 
  order, 
  venda, 
  printerName, 
  customText, 
  title, 
  subtitle, 
  docName, 
  remainingBalance,
  onClose 
}) => {
  // Usar order ou venda (para compatibilidade)
  const data = order || venda;
  
  if (!data) {
    return (
      <div className="p-4 text-center">
        <p>Nenhum dado disponível</p>
      </div>
    );
  }

  const itens = data.items || data.itens || [];
  const total = data.total || 0;
  const dataCriacao = data.createdAt || data.date || data.data;
  const creditoRestante = remainingBalance || data.creditoRestante || data.walletBalanceAfter || 0;

  const formatDate = (date: string | Date) => {
    if (!date) return new Date().toLocaleString('pt-BR');
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="bg-white p-6 max-w-md mx-auto font-sans">
      {/* Cabeçalho */}
      <div className="text-center border-b pb-4 mb-4">
        <h1 className="text-xl font-bold text-gray-800">
          {title || 'Mercado Fácil'}
        </h1>
        <p className="text-xs text-gray-500">{subtitle || 'Cupom de Entrega'}</p>
        <p className="text-xs text-gray-400 mt-1">{docName || 'Recibo de Venda'}</p>
      </div>

      {/* Informações */}
      <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
        <p><strong>Data:</strong> {formatDate(dataCriacao)}</p>
        <p><strong>Pedido:</strong> #{data.id?.slice(0, 8) || '---'}</p>
        {printerName && <p><strong>Atendente:</strong> {printerName}</p>}
      </div>

      {/* Itens */}
      <div className="mb-4">
        <h3 className="font-semibold text-sm mb-2 border-b pb-1">Itens do Pedido</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1">Produto</th>
              <th className="text-center py-1">Qtd</th>
              <th className="text-right py-1">Unit.</th>
              <th className="text-right py-1">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item: any, index: number) => (
              <tr key={index} className="border-b">
                <td className="py-1 text-xs">{item.name || item.nome}</td>
                <td className="text-center py-1">{item.quantity || item.quantidade}</td>
                <td className="text-right py-1">
                  R$ {(item.priceAtPurchase || item.preco || 0).toFixed(2)}
                </td>
                <td className="text-right py-1">
                  R$ {((item.priceAtPurchase || item.preco || 0) * (item.quantity || item.quantidade || 1)).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totais */}
      <div className="border-t pt-3 mb-4">
        <div className="flex justify-between font-bold text-lg">
          <span>TOTAL:</span>
          <span className="text-green-600">R$ {total.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span>Forma de Pagamento:</span>
          <span>{data.paymentMethod === 'WALLET' ? 'Crédito em Carteira' : 'PIX'}</span>
        </div>
        {creditoRestante > 0 && (
          <div className="flex justify-between text-sm mt-1 text-blue-600">
            <span>Crédito Restante:</span>
            <span className="font-bold">R$ {creditoRestante.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Mensagem */}
      <div className="text-center text-xs text-gray-400 border-t pt-4 mt-2">
        <p>{customText || 'Obrigado pela preferência!'}</p>
      </div>
    </div>
  );
};

export default CupomEntrega;