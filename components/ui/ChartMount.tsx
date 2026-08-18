import React from 'react';

// Monta os filhos SOMENTE após o primeiro frame de layout. Resolve o aviso
// do Recharts "The width(-1) and height(-1) of chart should be greater than 0":
// o ResponsiveContainer media o container antes do navegador terminar o
// primeiro layout (transições de aba, fontes carregando etc.) e recebia
// 0x0. Um frame de atraso garante dimensões reais em todas as montagens.
export const ChartMount: React.FC<{ minHeight?: number; className?: string; children?: React.ReactNode }> = ({
  minHeight,
  className = '',
  children,
}) => {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let raf = 0;
    const t = setTimeout(() => {
      raf = requestAnimationFrame(() => setReady(true));
    }, 50);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (!ready) {
    return <div className={className} style={{ minHeight }} aria-hidden />;
  }
  return <div className={className} style={{ minHeight }}>{children}</div>;
};