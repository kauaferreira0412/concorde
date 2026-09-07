package com.codagis.concorde.enums;

public enum ChannelType {
    TEXT,
    VOICE,
    // Canal de mapa de batalha (kit de RPG, ver BattleMap.jsx/MapService) - independente de call
    // de voz agora (pedido explicito do usuario: "quero uma opcao no servidor que os usuarios
    // clicam, e abre o mapa... como se fosse um canal parecido com o de chat"). O mestre
    // controla quem ve qual mapa (ver MapService.activateMap) igual antes, so' que agora o
    // canal em si e' um lugar proprio pra abrir, nao precisa estar numa call.
    MAP
}
