import { CallsWidget } from "./CallsWidget";
import { fetchActiveCalls } from "./activeCalls";

/** Roda quando o Android pede pra atualizar o widget (ao adicionar, a cada 30 min, ao redimensionar). */
export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }) {
  if (widgetInfo.widgetName !== "CallsWidget" || widgetAction === "WIDGET_DELETED") return;
  try {
    const { loggedIn, calls } = await fetchActiveCalls();
    renderWidget(<CallsWidget calls={calls} loggedIn={loggedIn} height={widgetInfo.height} />);
  } catch {
    renderWidget(<CallsWidget calls={[]} error height={widgetInfo.height} />);
  }
}
