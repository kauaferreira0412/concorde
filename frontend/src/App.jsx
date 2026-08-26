import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import { AlertProvider } from "./context/AlertContext.jsx";
import { ProfileProvider } from "./context/ProfileContext.jsx";
import { DmNotificationsProvider } from "./context/DmNotificationsContext.jsx";
import { GlobalVoiceCallProvider } from "./context/GlobalVoiceCallProvider.jsx";
import LoginPage from "./pages/login";
import ServerPage from "./pages/servers";
import HomePage from "./pages/home";
import AdminPage from "./pages/admin";
import CameraPipPage from "./pages/camera-pip";
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
        <DmNotificationsProvider>
        <GlobalVoiceCallProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* Janela SEPARADA das cameras, so' no app desktop (ver CameraPipPage.jsx pro
                motivo/electron/main.cjs que abre isso) - fora de PrivateRoute de proposito,
                o token do app vem pela propria URL (janela nova, sem sessionStorage
                compartilhado), nao do fluxo normal de login. */}
            <Route path="/camera-pip/:channelId" element={<CameraPipPage />} />
            <Route
              path="/channels/@me"
              element={
                <PrivateRoute>
                  <HomePage />
                </PrivateRoute>
              }
            />
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
        </GlobalVoiceCallProvider>
        </DmNotificationsProvider>
        </ProfileProvider>
      </AlertProvider>
    </UpdateRequiredGate>
  );
}
