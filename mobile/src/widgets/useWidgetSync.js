import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { API_URL } from "../config";
import { getToken } from "../api";
import { fetchActiveCalls } from "./activeCalls";

const APP_GROUP = "group.com.codagis.concorde";
const IOS_WIDGET_KIND = "CallsWidget";

// carregados só na plataforma certa (o módulo nativo de um não existe no outro)
function iosStorage() {
  try {
    const { ExtensionStorage } = require("@bacons/apple-targets");
    return { storage: new ExtensionStorage(APP_GROUP), ExtensionStorage };
  } catch {
    return null;
  }
}

async function pushToWidgets(user, calls) {
  if (Platform.OS === "ios") {
    const ios = iosStorage();
    if (!ios) return;
    // o widget do iPhone busca sozinho de tempos em tempos: precisa do token e do endereço do servidor
    ios.storage.set("token", user ? getToken() || undefined : undefined);
    ios.storage.set("apiUrl", API_URL);
    ios.storage.set("calls", user ? JSON.stringify(calls || []) : undefined);
    ios.storage.set("updatedAt", Date.now());
    ios.ExtensionStorage.reloadWidget(IOS_WIDGET_KIND);
  } else if (Platform.OS === "android") {
    const { requestWidgetUpdate } = require("react-native-android-widget");
    const { CallsWidget } = require("./CallsWidget");
    await requestWidgetUpdate({
      widgetName: "CallsWidget",
      renderWidget: (info) => <CallsWidget calls={calls || []} loggedIn={!!user} height={info.height} />,
      widgetNotFound: () => {},
    });
  }
}

/**
 * Mantém o widget "Em call agora" em dia enquanto o app está aberto (a cada 60s, ao voltar pro app
 * e quando você entra/sai de uma call). Fechado, cada widget se atualiza sozinho.
 */
export function useWidgetSync(user, currentChannelId) {
  useEffect(() => {
    let active = true;
    async function refresh() {
      if (!user) {
        pushToWidgets(null, []).catch(() => {});
        return;
      }
      try {
        const { calls } = await fetchActiveCalls();
        if (active) await pushToWidgets(user, calls);
      } catch {
        // sem rede: o widget fica com a última lista
      }
    }
    refresh();
    const timer = setInterval(() => AppState.currentState === "active" && refresh(), 60000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => {
      active = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [user, currentChannelId]);
}
