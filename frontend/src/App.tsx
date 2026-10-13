import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Cadastro from './pages/Cadastro';
import VagasPublicas from './pages/VagasPublicas';
import VagaDetalhe from './pages/VagaDetalhe';
import ComoFunciona from './pages/ComoFunciona';
import DashboardProfissional from './pages/DashboardProfissional';
import DashboardContratante from './pages/DashboardContratante';
import ProfissionalPerfil from './pages/ProfissionalPerfil';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/vagas" element={<VagasPublicas />} />
          <Route path="/vagas/:id" element={<VagaDetalhe />} />
          <Route path="/como-funciona" element={<ComoFunciona />} />
          <Route path="/profissional/:id" element={<ProfissionalPerfil />} />
          <Route
            path="/dashboard/profissional"
            element={
              <ProtectedRoute tipo="profissional">
                <DashboardProfissional />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/contratante"
            element={
              <ProtectedRoute tipo="contratante">
                <DashboardContratante />
              </ProtectedRoute>
            }
          />
          <Route
            path="*"
            element={
              <div className="text-center py-20">
                <h1 className="text-4xl font-bold">404</h1>
                <p className="text-slate-500 mt-2">Página não encontrada</p>
              </div>
            }
          />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
