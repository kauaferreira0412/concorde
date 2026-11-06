import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";

let token = null;
let onExpired = null;

export async function loadSession() {
  token = await SecureStore.getItemAsync("token");
  const rawUser = await SecureStore.getItemAsync("user");
  if (!token || !rawUser) return null;
  try {
    return JSON.parse(rawUser);
  } catch {
    return null;
  }
}

export async function saveSession(newToken, user) {
  token = newToken;
  if (newToken) {
    await SecureStore.setItemAsync("token", newToken);
    await SecureStore.setItemAsync("user", JSON.stringify(user));
  } else {
    await SecureStore.deleteItemAsync("token");
    await SecureStore.deleteItemAsync("user");
  }
}

export function getToken() {
  return token;
}

export function setExpiredHandler(fn) {
  onExpired = fn;
}

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && token && onExpired) onExpired();
    return Promise.reject(error);
  }
);

export default api;
