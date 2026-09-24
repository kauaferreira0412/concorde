import { createContext, useContext, useState } from "react";
import AlertModal from "../components/AlertModal.jsx";

const AlertContext = createContext(null);

export function AlertProvider({ children }) {
  const [alertState, setAlertState] = useState(null);

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
