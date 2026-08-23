package com.codagis.discordclone.ws;

import java.util.List;

/** Snapshot de quem esta em um canal de voz agora - transmitido via /topic/channel.{id}.voice.
 * forceMuted/forceDeafened = um moderador aplicou isso NELE (ver VoiceModerationController) -
 * enquanto estiver true, o proprio dono nao consegue reverter sozinho a nao ser que TAMBEM
 * tenha a permissao (ver VoicePresenceController.mic/deafen). watchingUserIds = de QUEM (pode
 * ser mais de uma pessoa ao mesmo tempo) essa pessoa esta assistindo a transmissao de tela
 * agora (lista vazia = ninguem) - existe pra quem esta compartilhando a tela saber quem esta
 * vendo, na hora (ver icone no cantinho do quadrado de transmissao, VoiceChannel.jsx - pedido
 * explicito do usuario). */
public record VoiceParticipantInfo(Long userId, String username, String avatarUrl, boolean micEnabled,
                                    boolean deafened, boolean forceMuted, boolean forceDeafened,
                                    List<Long> watchingUserIds) {}
