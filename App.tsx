import React, { useEffect } from 'react';
import { StoreProvider, useApp } from './context/StoreContext';
import { Login } from './pages/Login';
import { UserDashboard } from './pages/UserDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { Layout } from './components/Layout';
import { UserRole } from './types';

const MainApp: React.FC = () => {
  const { currentUser, showNotification } = useApp();

  useEffect(() => {
    const handleSessionExpired = (e: Event) => {
      const customEvent = e as CustomEvent;
      showNotification(customEvent.detail.message, 'warning');
    };

    window.addEventListener('session-expired', handleSessionExpired);
    return () => window.removeEventListener('session-expired', handleSessionExpired);
  }, [showNotification]);

  if (!currentUser) {
    return <Login />;
  }

  return (
    <Layout>
      {currentUser.role === UserRole.ADMIN ? (
        <AdminDashboard />
      ) : (
        <UserDashboard />
      )}
    </Layout>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <MainApp />
    </StoreProvider>
  );
}