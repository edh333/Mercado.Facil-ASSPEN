import React, { useRef } from 'react';
import { useApp } from '../context/StoreContext';

interface CupomEntregaProps {
  venda: {
    itens: any[];
    total: number;
    data: Date;
    creditoRestante: number;
  };
  onClose: () => void;
}

const CupomEntrega: React.FC<CupomEntregaProps> = ({ venda, onClose }) => {
  const { appConfig, currentUser } = useApp();
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (printRef.current) {
      const printContent = printRef.current.innerHTML;
      const originalContent = document.body.innerHTML;
      
      document.body.innerHTML = printContent;
      window.print();
      document.body.innerHTML = originalContent;
      window.location.reload();
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        {/* Cabeçalho do Modal */}
        <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">🧾 Cupom de Entrega</h2>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition"
            >
              🖨️ Imprimir
            </button>
            <button
              onClick={onClose}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-lg text-sm transition"
            >
              ✖ Fechar
            </button>
          </div>
        </div>

        {/* Conteúdo para Impressão */}
        <div ref={printRef} className="p-6">
          {/* Cabeçalho do Cupom */}
          <div className="text-center border-b pb-4 mb-4">
            <h1 className="text-2xl font-bold text-gray-800">
              {appConfig?.systemName || 'Mercado Fácil'}
            </h1>
            <p className="text-sm text-gray-600">{appConfig?.institutionName}</p>
            <p className="text-xs text-gray-500">CNPJ: {appConfig?.cnpj || '00.000.000/0001-00'}</p>
            <p className="text-xs text-gray-500">{appConfig?.contactAddress}</p>
            <p className="text-xs text-gray-500">Tel: {appConfig?.contactPhone}</p>
          </div>

          {/* Informações do Cliente */}
          <div className="mb-4 p-3 bg-gray-50 rounded">
            <p className="text-sm">
              <strong>Cliente:</strong> {currentUser?.name || '---'}
            </p>
            <p className="text-sm">
              <strong>CPF:</strong> {currentUser?.cpf || '---'}
            </p>
            <p className="text-sm">
              <strong>Data:</strong> {formatDate(venda.data)}
            </p>
          </div>

          {/* Itens do Pedido */}
          <div className="mb-4">
            <h3 className="font-semibold text-lg mb-2 border-b pb-1">Itens do Pedido</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Produto</th>
                  <th className="text-center py-2">Qtd</th>
                  <th className="text-right py-2">Unitário</th>
                  <th className="text-right py-2">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {venda.itens.map((item, index) => (
                  <tr key={index} className="border-b">
                    <td className="py-2">{item.name}</td>
                    <td className="text-center py-2">{item.quantity}</td>
                    <td className="text-right py-2">
                      R$ {item.priceAtPurchase?.toFixed(2) || '0,00'}
                    </td>
                    <td className="text-right py-2">
                      R$ {((item.priceAtPurchase || 0) * (item.quantity || 0)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totais */}
          <div className="border-t pt-4 mb-4">
            <div className="flex justify-between items-center text-lg font-bold">
              <span>TOTAL:</span>
              <span className="text-green-600">R$ {venda.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-md mt-2">
              <span>Forma de Pagamento:</span>
              <span>Crédito em Carteira</span>
            </div>
            <div className="flex justify-between items-center text-md mt-2 text-blue-600">
              <span>Crédito Restante:</span>
              <span className="font-bold">R$ {venda.creditoRestante.toFixed(2)}</span>
            </div>
          </div>

          {/* Mensagem de Agradecimento */}
          <div className="text-center text-sm text-gray-500 border-t pt-4 mt-4">
            <p>{appConfig?.footerText || 'Sistema oficial de gestão de entregas.'}</p>
            <p className="mt-2">Obrigado pela preferência!</p>
          </div>

          {/* Assinatura */}
          <div className="mt-8 pt-4 border-t text-center">
            <div className="border-t border-dashed w-48 mx-auto pt-2">
              <p className="text-xs text-gray-500">Assinatura do Recebedor</p>
            </div>
          </div>
        </div>

        {/* Rodapé do Modal */}
        <div className="sticky bottom-0 bg-gray-50 border-t p-4 flex justify-center">
          <p className="text-xs text-gray-500">
            Este documento é um comprovante de compra válido.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CupomEntrega;