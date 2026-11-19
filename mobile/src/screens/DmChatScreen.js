import { Pressable } from "react-native";
import ChatView from "../chat/ChatView";
import { Screen } from "../ui/kit";
import TopBar from "../ui/TopBar";
import { AvatarWithStatus } from "./DmsScreen";

const STATUS = { ONLINE: "online", AWAY: "ausente", DND: "não perturbe", OFFLINE: "offline" };

export default function DmChatScreen({ route, navigation, user }) {
  const p = route.params;
  const name = p.otherNickname || p.otherUsername;
  return (
    <Screen>
      <TopBar
        title={name}
        subtitle={`@${p.otherUsername} · ${STATUS[p.otherStatus] || "offline"}`}
        onBack={() => navigation.goBack()}
        tone="surface"
        right={
          <Pressable onPress={() => navigation.navigate("Profile", { userId: p.otherUserId })} accessibilityLabel={`Perfil de ${name}`}>
            <AvatarWithStatus name={p.otherUsername} url={p.otherAvatarUrl} status={p.otherStatus} size={40} />
          </Pressable>
        }
      />
      <ChatView
        kind="dm"
        channelId={p.channelId}
        placeholder={`Mensagem pra ${name}...`}
        user={user}
        navigation={navigation}
        emptyText={`Esse é o começo da sua conversa com ${name}. Manda um oi!`}
      />
    </Screen>
  );
}
