import { createContext, useContext, useState } from "react";
import ProfileModal from "../components/ProfileModal.jsx";

const ProfileContext = createContext(null);

export function ProfileProvider({ children }) {
  const [openUserId, setOpenUserId] = useState(null);

  return (
    <ProfileContext.Provider value={{ openProfile: setOpenUserId }}>
      {children}
      {openUserId && <ProfileModal userId={openUserId} onClose={() => setOpenUserId(null)} />}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
