import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StatusBar, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoTrack } from "@livekit/react-native";
import { startIOSPIP } from "@livekit/react-native-webrtc";
import { Track } from "livekit-client";
import api from "../api";
import { useTokens } from "../theme/ThemeContext";
import { useVoice } from "../voice/VoiceContext";
import { Avatar, Btn, IconBtn, Screen, SectionTitle, Sticker, Tag, Txt } from "../ui/kit";
import Sheet, { SheetItem } from "../ui/Sheet";
import Slider from "../ui/Slider";
import TopBar from "../ui/TopBar";

const PIP = { enabled: true, startAutomatically: true, stopAutomatically: true, preferredSize: { width: 16, height: 9 } };

function ParticipantCard({ p, onPress, mirrorLocal }) {
  const t = useTokens();
  const cam = p.camera;
  return (
    <Pressable style={{ flex: 1 }} onPress={onPress} accessibilityLabel={`Opções de ${p.name}`}>
      <Sticker radius={20} shadow={4} bg={p.speaking ? t.voiceBg : t.surface} border={p.speaking ? 3 : 2.5}>
        {cam ? (
          <View style={{ height: 150, backgroundColor: "#000" }}>
            <VideoTrack
              trackRef={{ participant: cam.participant, publication: cam.publication, source: Track.Source.Camera }}
              objectFit="cover"
              mirror={p.isLocal && mirrorLocal}
              style={{ flex: 1 }}
            />
            <View style={{ position: "absolute", left: 6, bottom: 6, right: 6, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ backgroundColor: t.backdrop, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, flexShrink: 1 }}>
                <Txt weight={900} size={12} color="#fff" numberOfLines={1}>
                  {p.isLocal ? "Você" : p.name}
                </Txt>
              </View>
              {p.muted ? <Tag label="MUTADO" /> : null}
            </View>
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: 16, paddingHorizontal: 8, gap: 6 }}>
            <Avatar name={p.name} url={p.avatarUrl} size={64} ring={p.speaking ? t.success : undefined} />
            <Txt weight={900} size={15} numberOfLines={1} style={{ maxWidth: "100%" }}>
              {p.isLocal ? "Você" : p.name}
            </Txt>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              {p.streaming ? <Tag label="AO VIVO" /> : p.audioLive ? <Tag label="ÁUDIO" bg={t.mint} color={t.onPop} /> : null}
              <Txt weight={800} size={12} color={p.muted || p.deafened ? t.danger : p.speaking ? t.mintText : t.textMuted}>
                {p.deafened ? "surdo" : p.muted ? "mutado" : p.speaking ? "falando" : "em silêncio"}
              </Txt>
            </View>
          </View>
        )}
      </Sticker>
    </Pressable>
  );
}

/** Vídeo da live, com Picture in Picture no iPhone (manual pelo botão ou sozinho ao minimizar). */
function StreamPlayer({ stream, onStop, onFullscreen, height = 210, fullscreen }) {
  const t = useTokens();
  const viewRef = useRef(null);
  const trackRef = { participant: stream.participant, publication: stream.publication, source: Track.Source.ScreenShare };
  return (
    <View style={{ height, backgroundColor: "#000", borderRadius: fullscreen ? 0 : 14, overflow: "hidden" }}>
      {stream.hasVideo ? (
        <VideoTrack ref={viewRef} trackRef={trackRef} objectFit="contain" style={{ flex: 1 }} iosPIP={Platform.OS === "ios" ? PIP : undefined} />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
          <ActivityIndicator color="#fff" />
          <Txt weight={800} color="#fff">
            Carregando a live...
          </Txt>
        </View>
      )}
      <View style={{ position: "absolute", top: 8, right: 8, flexDirection: "row", gap: 8 }}>
        {Platform.OS === "ios" && stream.hasVideo ? (
          <IconBtn icon="pip" size={38} label="Picture in Picture" onPress={() => viewRef.current && startIOSPIP(viewRef)} />
        ) : null}
        {onFullscreen ? <IconBtn icon="maximize" size={38} label="Tela cheia" onPress={onFullscreen} /> : null}
        <IconBtn icon="x" size={38} label={fullscreen ? "Fechar" : "Parar de assistir"} onPress={onStop} />
      </View>
      <View style={{ position: "absolute", left: 8, bottom: 8, flexDirection: "row", gap: 6, alignItems: "center" }}>
        <Tag label="AO VIVO" />
        <View style={{ backgroundColor: t.backdrop, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 }}>
          <Txt weight={800} size={12} color="#fff">
            {stream.name}
          </Txt>
        </View>
      </View>
    </View>
  );
}

/** Menu de uma pessoa da call: perfil, volume e moderação. */
function ParticipantSheet({ p, onClose, navigation, user }) {
  const t = useTokens();
  const voice = useVoice();
  const [vol, setVol] = useState(() => (p ? voice.getVolume(p.identity) : 100));
  const [streamVol, setStreamVol] = useState(() => (p ? voice.getVolume(p.identity, "stream") : 100));
  const [moveOpen, setMoveOpen] = useState(false);
  const [voiceChannels, setVoiceChannels] = useState(null);

  useEffect(() => {
    if (!p) return;
    setVol(voice.getVolume(p.identity));
    setStreamVol(voice.getVolume(p.identity, "stream"));
    setMoveOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.identity]);

  if (!p) return null;
  const isAdmin = user?.role === "ADMIN";
  const can = (perm) => isAdmin || voice.permissions.includes(perm);
  const others = !p.isLocal && p.userId != null;

  async function openMove() {
    setMoveOpen(true);
    if (voiceChannels || !voice.channel?.serverId) return;
    try {
      const { data } = await api.get(`/api/servers/${voice.channel.serverId}/channels`);
      setVoiceChannels(data.filter((c) => c.type === "VOICE" && c.id !== voice.channel.id));
    } catch {
      setVoiceChannels([]);
    }
  }

  return (
    <Sheet visible onClose={onClose} title={p.isLocal ? "VOCÊ" : p.name.toUpperCase()}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <Avatar name={p.name} url={p.avatarUrl} size={52} />
        <View style={{ flex: 1 }}>
          <Txt weight={900} size={16}>
            {p.isLocal ? "Você" : p.name}
          </Txt>
          <Txt weight={700} size={13} color={t.textMuted}>
            {p.deafened ? "surdo" : p.muted ? "mutado" : "microfone ligado"}
            {p.forceMuted ? " · silenciado por moderador" : ""}
          </Txt>
        </View>
      </View>
      {p.userId != null ? (
        <SheetItem
          icon="user"
          label="Ver perfil"
          onPress={() => {
            onClose();
            navigation.navigate("Profile", { userId: p.userId });
          }}
        />
      ) : null}
      {others ? (
        <Sticker radius={14} shadow={0} bg={t.surface2}>
          <View style={{ padding: 12, gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt weight={800}>Volume da voz</Txt>
              <Txt weight={900}>{vol}%</Txt>
            </View>
            <Slider value={vol} onChange={setVol} onDone={(v) => voice.setVolume(p.identity, v)} />
            {p.streaming ? (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                  <Txt weight={800}>Volume da live</Txt>
                  <Txt weight={900}>{streamVol}%</Txt>
                </View>
                <Slider value={streamVol} onChange={setStreamVol} onDone={(v) => voice.setVolume(p.identity, v, "stream")} />
              </>
            ) : null}
            <Txt weight={600} size={12} color={t.textMuted}>
              Só pra você, fica salvo nesse aparelho.
            </Txt>
          </View>
        </Sticker>
      ) : null}
      {others && can("MUTE_MEMBERS") ? (
        <SheetItem
          icon={p.forceMuted ? "mic" : "micOff"}
          label={p.forceMuted ? "Liberar microfone" : "Silenciar (mute forçado)"}
          onPress={() => {
            voice.moderation.forceMute(p.userId, !p.forceMuted);
            onClose();
          }}
        />
      ) : null}
      {others && can("DEAFEN_MEMBERS") ? (
        <SheetItem
          icon={p.forceDeafened ? "headphones" : "headphonesOff"}
          label={p.forceDeafened ? "Liberar áudio" : "Ensurdecer (forçado)"}
          onPress={() => {
            voice.moderation.forceDeafen(p.userId, !p.forceDeafened);
            onClose();
          }}
        />
      ) : null}
      {others && can("MOVE_MEMBERS") ? (
        moveOpen ? (
          <Sticker radius={14} shadow={0} bg={t.surface2}>
            <View style={{ padding: 10, gap: 6 }}>
              <Txt weight={900}>Mover pra qual canal?</Txt>
              {voiceChannels === null ? (
                <ActivityIndicator color={t.text} />
              ) : voiceChannels.length === 0 ? (
                <Txt weight={700} color={t.textMuted}>
                  Nenhum outro canal de voz.
                </Txt>
              ) : (
                voiceChannels.map((c) => (
                  <SheetItem
                    key={c.id}
                    icon="volume"
                    label={c.name}
                    onPress={() => {
                      voice.moderation.move(p.userId, c.id);
                      onClose();
                    }}
                  />
                ))
              )}
            </View>
          </Sticker>
        ) : (
          <SheetItem icon="users" label="Mover pra outro canal" onPress={openMove} />
        )
      ) : null}
      {others && can("KICK_VOICE") ? (
        <SheetItem
          icon="logout"
          label="Desconectar da call"
          danger
          onPress={() => {
            voice.moderation.kick(p.userId);
            onClose();
          }}
        />
      ) : null}
    </Sheet>
  );
}

export default function VoiceScreen({ route, navigation, user }) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const { channel: target } = route.params || {};
  const voice = useVoice();
  const inThisCall = voice.channel && target && voice.channel.id === target.id;
  const [fullscreen, setFullscreen] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (target && !inThisCall && !voice.connecting) voice.join(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  const watched = voice.streams.find((s) => s.watching);
  useEffect(() => {
    if (!watched) setFullscreen(false);
  }, [watched]);

  const title = (target?.name || voice.channel?.name || "Call").toUpperCase();

  if (!voice.channel || voice.connecting) {
    return (
      <Screen>
        <TopBar title={title} subtitle="Canal de voz" onBack={() => navigation.goBack()} />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 10 }}>
          <ActivityIndicator color={t.text} />
          <Txt weight={800}>Entrando na call...</Txt>
        </View>
      </Screen>
    );
  }

  // a câmera local entra no card "Você"
  const people = voice.participants.map((p) => (p.isLocal && voice.localCamera ? { ...p, camera: voice.localCamera } : p));
  const rows = [];
  for (let i = 0; i < people.length; i += 2) rows.push(people.slice(i, i + 2));
  const selectedP = selected ? people.find((p) => p.identity === selected) : null;

  return (
    <Screen>
      <TopBar title={title} subtitle={`Canal de voz · ${voice.participants.length} na call`} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 30 }}>
        {voice.streams.length > 0 ? (
          <Sticker radius={20} shadow={4}>
            <View style={{ padding: 12, gap: 10 }}>
              <SectionTitle>AO VIVO</SectionTitle>
              {watched && !fullscreen ? (
                <StreamPlayer stream={watched} onStop={() => voice.toggleWatch(watched.identity)} onFullscreen={() => setFullscreen(true)} />
              ) : null}
              {voice.streams
                .filter((s) => !s.watching)
                .map((s) => (
                  <View key={s.identity} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Avatar name={s.name} url={s.avatarUrl} size={36} />
                    <View style={{ flex: 1 }}>
                      <Txt weight={900} numberOfLines={1}>
                        {s.name}
                      </Txt>
                      <Txt weight={700} size={12} color={t.textMuted}>
                        transmitindo a tela
                      </Txt>
                    </View>
                    <Btn
                      small
                      icon="eye"
                      label="Assistir"
                      onPress={() => {
                        // uma live por vez no celular (economiza dados e bateria)
                        if (watched) voice.toggleWatch(watched.identity);
                        voice.toggleWatch(s.identity);
                      }}
                    />
                  </View>
                ))}
            </View>
          </Sticker>
        ) : null}

        <SectionTitle>NA CALL</SectionTitle>
        {rows.map((row, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 12 }}>
            {row.map((p) => (
              <ParticipantCard key={p.identity} p={p} mirrorLocal={voice.facing === "user"} onPress={() => setSelected(p.identity)} />
            ))}
            {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
          </View>
        ))}
      </ScrollView>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 10,
          paddingTop: 14,
          paddingBottom: 14 + insets.bottom,
          backgroundColor: t.surface,
          borderTopWidth: 2.5,
          borderTopColor: t.ink,
        }}
      >
        <IconBtn
          icon={voice.micEnabled ? "mic" : "micOff"}
          tone={voice.micEnabled ? "surface2" : "off"}
          size={52}
          label={voice.micEnabled ? "Desligar microfone" : "Ligar microfone"}
          onPress={voice.toggleMic}
        />
        <IconBtn
          icon={voice.deafened ? "headphonesOff" : "headphones"}
          tone={voice.deafened ? "off" : "surface2"}
          size={52}
          label={voice.deafened ? "Voltar a ouvir" : "Ensurdecer"}
          onPress={voice.toggleDeafen}
        />
        <IconBtn
          icon={voice.cameraOn ? "camera" : "cameraOff"}
          tone={voice.cameraOn ? "mint" : "surface2"}
          size={52}
          label={voice.cameraOn ? "Desligar câmera" : "Ligar câmera"}
          onPress={voice.toggleCamera}
        />
        {voice.cameraOn ? (
          <IconBtn
            icon="switchCamera"
            tone="surface2"
            size={52}
            label={voice.facing === "user" ? "Usar câmera traseira" : "Usar câmera frontal"}
            onPress={voice.switchCamera}
          />
        ) : null}
        <IconBtn
          icon="phoneOff"
          tone="danger"
          size={52}
          label="Sair da call"
          onPress={async () => {
            await voice.leave();
            navigation.goBack();
          }}
        />
      </View>

      {fullscreen && watched ? (
        <Modal visible animationType="fade" onRequestClose={() => setFullscreen(false)} supportedOrientations={["portrait", "landscape"]}>
          <StatusBar hidden />
          <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", paddingTop: insets.top }}>
            <StreamPlayer stream={watched} fullscreen height="100%" onStop={() => setFullscreen(false)} />
          </View>
        </Modal>
      ) : null}

      <ParticipantSheet p={selectedP} onClose={() => setSelected(null)} navigation={navigation} user={user} />
    </Screen>
  );
}
