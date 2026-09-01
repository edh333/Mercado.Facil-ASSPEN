import React from 'react';
import { X, Printer, Download, ExternalLink, ZoomIn, ZoomOut } from 'lucide-react';

interface ImagePreviewModalProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ src, alt, onClose }) => {
  const [zoom, setZoom] = React.useState(1);

  const handlePrint = () => {
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
      a.download = 'comprovante.' + ((blob.type.split('/')[1]) || 'jpg');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      const a = document.createElement('a');
      a.href = src;
      a.download = 'comprovante';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleOpenNewTab = () => {
    const win = window.open(src, '_blank');
    if (!win) alert('Popup bloqueado. Permita popups.');
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
        <div className="flex items-center gap-2 mb-4 bg-black/50 rounded-lg p-2 backdrop-blur-sm">
          <button
            onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
            className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white transition-all active:scale-90"
            title="Reduzir zoom"
          >
            <ZoomOut size={18} />
          </button>
          <span className="text-white/60 text-xs font-bold w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(z => Math.min(3, z + 0.25))}
            className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white transition-all active:scale-90"
            title="Aumentar zoom"
          >
            <ZoomIn size={18} />
          </button>
          <div className="w-px h-8 bg-white/20 mx-1" />
          <button
            onClick={handlePrint}
            className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white transition-all active:scale-90"
            title="Imprimir"
          >
            <Printer size={18} />
          </button>
          <button
            onClick={handleDownload}
            className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white transition-all active:scale-90"
            title="Baixar"
          >
            <Download size={18} />
          </button>
          <button
            onClick={handleOpenNewTab}
            className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white transition-all active:scale-90"
            title="Abrir em nova aba"
          >
            <ExternalLink size={18} />
          </button>
          <div className="w-px h-8 bg-white/20 mx-1" />
          <button
            onClick={onClose}
            className="w-10 h-10 bg-white/10 hover:bg-white/30 rounded-lg flex items-center justify-center text-white transition-all active:scale-90"
            title="Fechar"
          >
            <X size={20} />
          </button>
        </div>
        <div className="overflow-auto max-w-full max-h-[85vh] rounded-lg" style={{ cursor: zoom > 1 ? 'grab' : 'default' }}>
          <img
            src={src}
            alt={alt || 'Comprovante'}
            className="rounded-lg transition-transform duration-200"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          />
        </div>
      </div>
    </div>
  );
};

export default ImagePreviewModal;
