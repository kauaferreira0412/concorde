const DESKTOP_NOTIFICATIONS_KEY = "desktopNotificationsEnabled";

export function getDesktopNotificationsEnabled() {
  return localStorage.getItem(DESKTOP_NOTIFICATIONS_KEY) === "true";
}
export function setDesktopNotificationsEnabled(enabled) {
  localStorage.setItem(DESKTOP_NOTIFICATIONS_KEY, String(enabled));
}
