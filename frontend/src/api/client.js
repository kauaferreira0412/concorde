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

// Um 401 isolado pode vir de um erro do servidor mal encaminhado; antes de deslogar,
// confirma numa rota simples se o token realmente deixou de valer.
let tokenCheck = null;
function confirmTokenExpired(authHeader) {
  if (!tokenCheck) {
    tokenCheck = axios
      .get(`${API_URL}/api/servers`, { headers: { Authorization: authHeader, "ngrok-skip-browser-warning": "true" } })
      .then(() => false)
      .catch((err) => err.response?.status === 401)
      .finally(() => {
        setTimeout(() => {
          tokenCheck = null;
        }, 2000);
      });
  }
  return tokenCheck;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const sentToken = error.config?.headers?.Authorization;
    if (error.response?.status === 401 && sentToken) {
      const expired = await confirmTokenExpired(sentToken);
      if (expired) window.dispatchEvent(new Event("auth:expired"));
    }
    return Promise.reject(error);
  }
);

export default api;
