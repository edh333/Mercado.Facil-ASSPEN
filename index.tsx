// @ts-nocheck
import React, { Component, ReactNode, ErrorInfo } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PWAInstallProvider } from './components/PWAInstallProvider';
import './index.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '30px', background: '#0f172a', color: '#f8fafc', fontFamily: 'sans-serif', minHeight: '100vh' }}>
          <h2 style={{ color: '#f87171' }}>⚠️ Erro Crítico de Renderização</h2>
          <p>O aplicativo não conseguiu iniciar. Isso pode ser causado por falta de memória no sistema ou falha na conexão com o Firebase.</p>
          <pre style={{ background: '#1e293b', padding: '15px', borderRadius: '8px', overflow: 'auto', border: '1px solid #334155' }}>
            {this.state.error?.toString()}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: '20px', padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            Tentar Novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <ErrorBoundary>
      <PWAInstallProvider>
        <App />
      </PWAInstallProvider>
    </ErrorBoundary>
  );
}