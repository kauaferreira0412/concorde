import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import { AlertProvider } from "./context/AlertContext.jsx";
import { ProfileProvider } from "./context/ProfileContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import ServerPage from "./pages/ServerPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import UpdateRequiredGate from "./components/UpdateRequiredGate.jsx";
import DesktopTitleBar from "./components/DesktopTitleBar.jsx";

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    // Bem por fora de tudo (inclusive do roteamento) - versao desatualizada nem chega a ver
    // a tela de login, ver UpdateRequiredGate.jsx. So' bloqueia dentro do app desktop
    // (Electron); no navegador sempre libera na hora.
    <UpdateRequiredGate>
      {/* window.concordeDesktop so' existe dentro do app instalado (ver preload.cjs) - no
          navegador normal isso e' undefined e a pagina usa a barra de titulo de verdade do
          proprio navegador, sem nenhuma mudanca. */}
      {window.concordeDesktop && <DesktopTitleBar />}
      <AlertProvider>
        <ProfileProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/admin"
              element={
                <PrivateRoute>
                  <AdminPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/servers/:serverId?"
              element={
                <PrivateRoute>
                  <ServerPage />
                </PrivateRoute>
              }
            />
            <Route path="*" element={<Navigate to="/servers" replace />} />
          </Routes>
        </ProfileProvider>
      </AlertProvider>
    </UpdateRequiredGate>
  );
}
