package com.codagis.discordclone.ws;

/** Snapshot de quem esta em um canal de voz agora - transmitido via /topic/channel.{id}.voice.
 * forceMuted/forceDeafened = um moderador aplicou isso NELE (ver VoiceModerationController) -
 * enquanto estiver true, o proprio dono nao consegue reverter sozinho a nao ser que TAMBEM
 * tenha a permissao (ver VoicePresenceController.mic/deafen). */
public record VoiceParticipantInfo(Long userId, String username, String avatarUrl, boolean micEnabled,
                                    boolean deafened, boolean forceMuted, boolean forceDeafened) {}
