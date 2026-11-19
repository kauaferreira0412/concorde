import ChatView from "../chat/ChatView";
import { Screen } from "../ui/kit";
import TopBar from "../ui/TopBar";

export default function ChatScreen({ route, navigation, user }) {
  const { channel, server } = route.params;
  const readOnly = channel.adminOnly && user?.role !== "ADMIN";
  return (
    <Screen>
      <TopBar title={`# ${channel.name}`} subtitle={server?.name} onBack={() => navigation.goBack()} tone="surface" />
      <ChatView
        kind="channel"
        channelId={channel.id}
        serverId={server?.id}
        readOnly={readOnly}
        placeholder={`Manda no #${channel.name}...`}
        user={user}
        navigation={navigation}
      />
    </Screen>
  );
}
