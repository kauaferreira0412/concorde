import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { applyAppearance, loadAppearanceState } from "./theme/themes";
import { initUiPrefs } from "./utils/uiPrefs";
import "./styles/theme.css";
import "./styles/global.css";

// Aplica o tema salvo antes do primeiro render pra não piscar o tema padrão.
applyAppearance(loadAppearanceState());
// Estilo das mensagens e imagem de fundo (separado do tema).
initUiPrefs();

const isElectronDesktop = typeof window !== "undefined" && !!window.concordeDesktop;
const Router = isElectronDesktop ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <Router>
        <AuthProvider>
          <App />
        </AuthProvider>
      </Router>
    </ThemeProvider>
  </React.StrictMode>
);
