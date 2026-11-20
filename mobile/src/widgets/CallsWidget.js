import { FlexWidget, ImageWidget, TextWidget } from "react-native-android-widget";
import { callLink } from "./activeCalls";

// cores fixas do tema escuro do Concorde (o widget não lê o tema do app)
const C = {
  bg: "#15122B",
  card: "#2A2550",
  ink: "#000000",
  text: "#F4F1FF",
  muted: "#B4ACD6",
  accent: "#7C4DEB",
  mint: "#6FE3CF",
  live: "#3DDC97",
};

function Header({ count }) {
  return (
    <FlexWidget style={{ flexDirection: "row", alignItems: "center", width: "match_parent", marginBottom: 8 }} clickAction="OPEN_APP">
      <FlexWidget style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: count ? C.live : C.muted, marginRight: 8 }} />
      <TextWidget text={count ? "EM CALL AGORA" : "CONCORDE"} style={{ fontSize: 13, fontWeight: "900", color: C.text, letterSpacing: 0.08 }} />
      <FlexWidget style={{ flex: 1 }} />
      {count ? <TextWidget text={`${count} ${count > 1 ? "calls" : "call"}`} style={{ fontSize: 12, fontWeight: "700", color: C.muted }} /> : null}
    </FlexWidget>
  );
}

function CallRow({ call }) {
  const people = call.participants || [];
  const shown = people.slice(0, 4);
  const extra = people.length - shown.length;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: callLink(call) }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        width: "match_parent",
        backgroundColor: C.card,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: C.ink,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 6,
      }}
    >
      <FlexWidget style={{ flex: 1, flexDirection: "column" }}>
        <TextWidget text={`🔊 ${call.channelName}`} maxLines={1} truncate="END" style={{ fontSize: 14, fontWeight: "900", color: C.text }} />
        <TextWidget
          text={`${call.serverName} · ${people.map((p) => p.username).join(", ")}`}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 11, fontWeight: "700", color: C.muted }}
        />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: "row", alignItems: "center", marginLeft: 8 }}>
        {shown.map((p) =>
          p.avatarUrl && /^https?:/.test(p.avatarUrl) ? (
            <ImageWidget key={p.userId} image={p.avatarUrl} imageWidth={26} imageHeight={26} radius={9} style={{ marginLeft: 3 }} />
          ) : (
            <FlexWidget
              key={p.userId}
              style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: C.accent, marginLeft: 3, justifyContent: "center", alignItems: "center" }}
            >
              <TextWidget text={(p.username || "?").slice(0, 1).toUpperCase()} style={{ fontSize: 12, fontWeight: "900", color: "#FFFFFF" }} />
            </FlexWidget>
          )
        )}
        {extra > 0 ? <TextWidget text={`+${extra}`} style={{ fontSize: 12, fontWeight: "900", color: C.mint, marginLeft: 4 }} /> : null}
      </FlexWidget>
    </FlexWidget>
  );
}

/** Widget "Em call agora": as calls com gente nos seus servidores; tocar numa call abre o app e entra nela. */
export function CallsWidget({ calls = [], loggedIn = true, error = false, height = 110 }) {
  const max = Math.max(1, Math.floor((height - 40) / 58));
  const list = calls.slice(0, max);
  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        backgroundColor: C.bg,
        borderRadius: 22,
        padding: 12,
        flexDirection: "column",
      }}
    >
      <Header count={calls.length} />
      {!loggedIn ? (
        <TextWidget text="Entre no app pra ver quem está em call." clickAction="OPEN_APP" style={{ fontSize: 13, fontWeight: "700", color: C.muted }} />
      ) : error && !calls.length ? (
        <TextWidget text="Sem conexão agora. Toque pra abrir o app." clickAction="OPEN_APP" style={{ fontSize: 13, fontWeight: "700", color: C.muted }} />
      ) : !calls.length ? (
        <TextWidget text="Ninguém em call agora. Toque pra abrir o Concorde." clickAction="OPEN_APP" style={{ fontSize: 13, fontWeight: "700", color: C.muted }} />
      ) : (
        list.map((call) => <CallRow key={call.channelId} call={call} />)
      )}
      {calls.length > list.length ? (
        <TextWidget text={`e mais ${calls.length - list.length}...`} clickAction="OPEN_APP" style={{ fontSize: 11, fontWeight: "700", color: C.muted }} />
      ) : null}
    </FlexWidget>
  );
}
