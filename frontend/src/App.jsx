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
    <UpdateRequiredGate>
      {window.concordeDesktop && <DesktopTitleBar />}
      <AlertProvider>
        <ProfileProvider>
        <DmNotificationsProvider>
        <GlobalVoiceCallProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
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
