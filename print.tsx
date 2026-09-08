// @ts-nocheck
// Entrada LEVE e dedicada da janela de impressão (/print.html).
// A janela aberta pelo PDV passa a carregar SÓ o PrintPage + seus componentes
// (bundle de ~tens de KB), em vez de baixar o app inteiro (~2,6 MB de JS:
// firebase, recharts, framer-motion, admin, etc.). Em browser lento isso fazia
// a impressão "demorar pra carregar a página".
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PrintPage } from './components/PrintPage';
import './index.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  if (rootElement.firstChild) rootElement.replaceChildren();
  const root = createRoot(rootElement);
  root.render(<PrintPage />);
}