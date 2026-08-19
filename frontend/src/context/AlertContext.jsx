import { createContext, useContext, useState } from "react";
import AlertModal from "../components/AlertModal.jsx";

const AlertContext = createContext(null);

/**
 * Deixa QUALQUER componente/contexto mostrar um aviso so' chamando showAlert(mensagem) - em
 * vez do alert() nativo do navegador (caixinha feia "localhost:5173 diz..."), mostra um modal
 * com a mesma cara do resto do app. Mesmo padrao do ProfileContext (um provider so' na raiz,
 * estado global, resto da arvore so' consome via useAlert()).
 */
export function AlertProvider({ children }) {
  const [alertState, setAlertState] = useState(null); // { title, message }

  function showAlert(message, title) {
    setAlertState({ message, title });
  }

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      {alertState && (
        <AlertModal title={alertState.title} message={alertState.message} onClose={() => setAlertState(null)} />
      )}
    </AlertContext.Provider>
  );
}

export function useAlert() {
  return useContext(AlertContext);
}
