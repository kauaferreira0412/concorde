import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "";

export const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers["ngrok-skip-browser-warning"] = "true";
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const sentToken = error.config?.headers?.Authorization;
    if (error.response?.status === 401 && sentToken) {
      window.dispatchEvent(new Event("auth:expired"));
    }
    return Promise.reject(error);
  }
);

export default api;
