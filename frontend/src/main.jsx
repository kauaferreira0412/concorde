import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import "./styles/global.css";

// window.concordeDesktop so' existe dentro do app Electron (ver electron/preload.cjs). O app
// desktop empacotado abre a pagina via file:// - a History API que o BrowserRouter usa (rotas
// tipo /servers/1) nao funciona nesse protocolo (sem "origem" nenhuma pra navegar de verdade,
// so' da tela branca). HashRouter usa #/servers/1 em vez disso, que funciona em qualquer
// protocolo - e' o mesmo esquema que o deep link concorde://invite/... ja usa (ver
// routeDeepLink em electron/main.cjs). No navegador normal continua BrowserRouter, sem
// nenhuma mudanca de URL/comportamento.
const isElectronDesktop = typeof window !== "undefined" && !!window.concordeDesktop;
const Router = isElectronDesktop ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Router>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  </React.StrictMode>
);
