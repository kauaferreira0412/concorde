package com.codagis.discordclone.dto;

public class VoiceDtos {

    /**
     * Token JWT que o frontend usa para conectar direto no servidor LiveKit dessa sala/canal.
     * forceMuted/forceDeafened refletem uma punicao GRAVADA (ver Membership) que continua
     * valendo mesmo depois de sair e entrar de novo na call - o frontend usa isso pra ja'
     * entrar com o microfone desligado (e nao publicar audio nem por um instante) em vez de
     * ligar e desligar de novo logo em seguida.
     */
    public record VoiceTokenResponse(String token, String wsUrl, String room, String identity,
                                      boolean forceMuted, boolean forceDeafened) {}
}
