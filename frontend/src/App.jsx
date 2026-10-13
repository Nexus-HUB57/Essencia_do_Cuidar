import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import ComoFunciona from './pages/ComoFunciona.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import DashboardProfissional from './pages/DashboardProfissional.jsx';
import DashboardContratante from './pages/DashboardContratante.jsx';
import VagaDetail from './pages/VagaDetail.jsx';
import Candidatos from './pages/Candidatos.jsx';
import ChatPage from './pages/ChatPage.jsx';
import NotFound from './pages/NotFound.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/como-funciona" element={<ComoFunciona />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Register />} />
        <Route path="/vagas/:id" element={<VagaDetail />} />
        <Route
          path="/dashboard-profissional"
          element={
            <ProtectedRoute role="profissional">
              <DashboardProfissional />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard-contratante"
          element={
            <ProtectedRoute role="contratante">
              <DashboardContratante />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vagas/:id/candidatos"
          element={
            <ProtectedRoute role="contratante">
              <Candidatos />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vagas/:id/chat"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
