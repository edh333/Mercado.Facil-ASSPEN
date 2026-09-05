import React from 'react';
import { X, Printer, Download, ExternalLink, ZoomIn, ZoomOut, RefreshCw, AlertTriangle } from 'lucide-react';

interface ImagePreviewModalProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ src, alt, onClose }) => {
  const [zoom, setZoom] = React.useState(1);
  const [imgError, setImgError] = React.useState(false);
  const [isPdf, setIsPdf] = React.useState(false);

  React.useEffect(() => {
    setIsPdf(src.toLowerCase().includes('.pdf') || src.toLowerCase().includes('pdf'));
    setImgError(false);
  }, [src]);

  const handlePrint = () => {
    if (isPdf) {
      // Para PDF, abre em nova aba e imprime de lá
      const win = window.open(src, '_blank');
      if (win) {
        setTimeout(() => { try { win.print(); } catch { /* noop */ } }, 1000);
      } else {
        alert('Popup bloqueado. Permita popups para imprimir PDFs.');
      }
      return;
    }
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      alert('Não foi possível abrir a impressão.');
      iframe.remove();
      return;
    }
    doc.open();
    doc.write(`
      <html>
        <head><title>Imprimir Comprovante</title>
        <style>
          body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: white; }
          img { max-width: 100%; max-height: 100vh; object-fit: contain; }
          @media print { body { margin: 0; } img { max-width: 100%; max-height: 100vh; } }
        </style>
        </head>
        <body><img src="${src}" /></body>
      </html>
    `);
    doc.close();
    const doPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        alert('Falha ao imprimir. Use "Abrir em nova aba" e imprima pelo navegador.');
      } finally {
        setTimeout(() => iframe.remove(), 1000);
      }
    };
    const img = doc.querySelector('img');
    if (img && !img.complete) {
      img.onload = doPrint;
      img.onerror = doPrint;
    } else {
      setTimeout(doPrint, 100);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = blob.type.split('/')[1] || (isPdf ? 'pdf' : 'jpg');
      a.download = `comprovante.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      const a = document.createElement('a');
      a.href = src;
      a.download = isPdf ? 'comprovante.pdf' : 'comprovante';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleOpenNewTab = () => {
    const win = window.open(src, '_blank');
    if (!win) alert('Popup bloqueado. Permita popups.');
  };

  const handleRetry = () => {
    setImgError(false);
    // Força recarregar a imagem adicionando um timestamp
    // Nota: isso não resolve URLs expiradas do Firebase Storage, mas ajuda com erros de rede temporários
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4 md:p-8 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative max-w-full max-h-full flex flex-col items-center"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4 bg-black/50 rounded-2xl p-2 backdrop-blur-sm flex-wrap justify-center">
          <button
            onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
            className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center text-white transition-all active:scale-90"
            title="Reduzir zoom"
          >
            <ZoomOut size={18} />
          </button>
          <span className="text-white/60 text-xs font-bold w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(z => Math.min(3, z + 0.25))}
            className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center text-white transition-all active:scale-90"
            title="Aumentar zoom"
          >
            <ZoomIn size={18} />
          </button>
          <div className="w-px h-8 bg-white/20 mx-1" />
          <button
            onClick={handlePrint}
            className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center text-white transition-all active:scale-90"
            title="Imprimir"
          >
            <Printer size={18} />
          </button>
          <button
            onClick={handleDownload}
            className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center text-white transition-all active:scale-90"
            title="Baixar"
          >
            <Download size={18} />
          </button>
          <button
            onClick={handleOpenNewTab}
            className="w-10 h-10 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-xl flex items-center justify-center text-emerald-300 transition-all active:scale-90"
            title="Abrir em nova aba (recomendado para PDFs e se a imagem não carregar)"
          >
            <ExternalLink size={18} />
          </button>
          {imgError && (
            <button
              onClick={handleRetry}
              className="w-10 h-10 bg-amber-500/20 hover:bg-amber-500/30 rounded-xl flex items-center justify-center text-amber-300 transition-all active:scale-90"
              title="Tentar recarregar a imagem"
            >
              <RefreshCw size={18} className="animate-spin" />
            </button>
          )}
          <div className="w-px h-8 bg-white/20 mx-1" />
          <button
            onClick={onClose}
            className="w-10 h-10 bg-white/10 hover:bg-white/30 rounded-xl flex items-center justify-center text-white transition-all active:scale-90"
            title="Fechar"
          >
            <X size={20} />
          </button>
        </div>
        <div className="overflow-auto max-w-full max-h-[85vh] rounded-2xl" style={{ cursor: zoom > 1 ? 'grab' : 'default' }}>
          {imgError ? (
            <div className="flex flex-col items-center justify-center p-10 bg-slate-900/50 rounded-xl text-center min-w-[300px]">
              <AlertTriangle size={48} className="text-amber-400 mb-4" />
              <h5 className="font-black text-amber-300 uppercase text-sm mb-2">Não foi possível carregar a visualização</h5>
              <p className="text-[11px] text-slate-400 mb-4 max-w-xs">A URL do comprovante pode ter expirado ou há restrição de acesso (CORS).</p>
              <div className="flex gap-3">
                <button onClick={handleOpenNewTab} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-[10px] font-black uppercase transition-all">
                  <ExternalLink size={14} className="mr-1" /> Abrir em Nova Aba
                </button>
                <button onClick={handleDownload} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-[10px] font-black uppercase transition-all">
                  <Download size={14} className="mr-1" /> Baixar Arquivo
                </button>
              </div>
            </div>
          ) : isPdf ? (
            <iframe
              src={`${src}#toolbar=0&navpanes=0&scrollbar=0`}
              className="w-full h-[70vh] min-h-[400px] border-0 rounded-xl"
              title="Visualização de PDF"
              onLoad={() => setImgError(false)}
              onError={() => setImgError(true)}
            />
          ) : (
            <img
              src={src}
              alt={alt || 'Comprovante'}
              className="rounded-xl transition-transform duration-200"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
              onError={() => setImgError(true)}
              onLoad={() => setImgError(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ImagePreviewModal;
