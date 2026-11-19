import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import api from "../api";
import { useTokens } from "../theme/ThemeContext";
import { mix } from "../theme/themes";
import { Btn, SectionTitle, Txt } from "../ui/kit";
import Sheet from "../ui/Sheet";
import { AvatarWithStatus } from "./DmsScreen";

/** Membros do servidor (online primeiro), igual ao painel lateral do site. */
export default function MembersSheet({ serverId, visible, onClose, onOpenProfile, isAdmin }) {
  const t = useTokens();
  const [members, setMembers] = useState(null);
  const [canInvite, setCanInvite] = useState(false);
  const [friends, setFriends] = useState([]);
  const [invited, setInvited] = useState({});

  function load() {
    api
      .get(`/api/servers/${serverId}/members`)
      .then(({ data }) => setMembers(data || []))
      .catch(() => setMembers([]));
  }

  useEffect(() => {
    if (!visible) return;
    load();
    api
      .get(`/api/servers/${serverId}/me/permissions`)
      .then(({ data }) => setCanInvite(isAdmin || (Array.isArray(data) && data.includes("MANAGE_MEMBERS"))))
      .catch(() => setCanInvite(!!isAdmin));
    api
      .get("/api/friends")
      .then(({ data }) => setFriends(data || []))
      .catch(() => setFriends([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, serverId]);

  async function invite(f) {
    setInvited((p) => ({ ...p, [f.userId]: "busy" }));
    try {
      await api.post(`/api/servers/${serverId}/invite-friend`, { userId: f.userId });
      setInvited((p) => ({ ...p, [f.userId]: "ok" }));
      load();
    } catch (err) {
      setInvited((p) => ({ ...p, [f.userId]: undefined }));
      Alert.alert("Convite", err.response?.data?.error || "Não deu pra convidar agora.");
    }
  }

  const memberIds = new Set((members || []).map((m) => m.userId));
  const invitable = friends.filter((f) => !memberIds.has(f.userId));

  const online = (members || []).filter((m) => m.status && m.status !== "OFFLINE");
  const offline = (members || []).filter((m) => !m.status || m.status === "OFFLINE");

  function Row({ m }) {
    const name = m.nickname || m.username;
    return (
      <Pressable
        onPress={() => onOpenProfile(m.userId)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 8,
          borderRadius: 14,
          backgroundColor: pressed ? t.hover : "transparent",
          opacity: m.status === "OFFLINE" ? 0.6 : 1,
        })}
      >
        <AvatarWithStatus name={m.username} url={m.avatarUrl} status={m.status} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt weight={900} numberOfLines={1} color={m.accentColor ? mix(m.accentColor, 78, t.text) : t.text}>
            {name}
            {m.role === "ADMIN" ? "  🛡️" : ""}
          </Txt>
          {m.customStatus ? (
            <Txt weight={700} size={12} color={t.textMuted} numberOfLines={1}>
              {m.customStatus}
            </Txt>
          ) : null}
        </View>
      </Pressable>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={members ? `MEMBROS · ${members.length}` : "MEMBROS"}>
      {members === null ? (
        <ActivityIndicator color={t.text} />
      ) : (
        <>
          <SectionTitle>Online · {online.length}</SectionTitle>
          {online.map((m) => (
            <Row key={m.userId} m={m} />
          ))}
          {offline.length ? <SectionTitle style={{ marginTop: 8 }}>Offline · {offline.length}</SectionTitle> : null}
          {offline.map((m) => (
            <Row key={m.userId} m={m} />
          ))}
          {canInvite && invitable.length ? (
            <>
              <SectionTitle style={{ marginTop: 8 }}>Convidar amigos</SectionTitle>
              {invitable.map((f) => (
                <View key={f.userId} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 8 }}>
                  <AvatarWithStatus name={f.username} url={f.avatarUrl} status={f.status} size={36} />
                  <Txt weight={900} style={{ flex: 1 }} numberOfLines={1}>
                    {f.nickname || f.username}
                  </Txt>
                  <Btn
                    small
                    icon={invited[f.userId] === "ok" ? "check" : "plus"}
                    label={invited[f.userId] === "ok" ? "Convidado" : "Convidar"}
                    disabled={!!invited[f.userId]}
                    onPress={() => invite(f)}
                  />
                </View>
              ))}
            </>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
