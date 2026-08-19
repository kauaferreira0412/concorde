package com.codagis.discordclone.ws;

/**
 * Comando de moderacao endereçado a UM participante especifico de uma call - transmitido
 * pra TODO MUNDO que esta olhando aquele canal via /topic/channel.{id}.voice.control (mesmo
 * padrao ja usado pra presenca), mas so' o cliente cujo userId bate com targetUserId age de
 * verdade (ver VoiceCallContext.jsx) - os outros so' ignoram.
 *
 * type: "MOVE" (vai pro canal toChannelId/toChannelName), "KICK" (desconecta da call),
 * "FORCE_MUTE" (muted=true/false) ou "FORCE_DEAFEN" (deafened=true/false).
 */
public record VoiceControlEvent(String type, Long targetUserId, Long toChannelId, String toChannelName,
                                 Boolean muted, Boolean deafened) {}
