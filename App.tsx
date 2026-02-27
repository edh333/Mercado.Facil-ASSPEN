import React from 'react';
import { StoreProvider, useApp } from './context/StoreContext';
import { Login } from './pages/Login';
import { UserDashboard } from './pages/UserDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { Layout } from './components/Layout';
import { UserRole } from './types';

const MainApp: React.FC = () => {
  const { currentUser } = useApp();

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