package com.codagis.concorde.enums;

// NORMAL = servidor comum (canais de texto/voz do dia a dia). RPG = ativa o "kit" de RPG - o
// canal de voz padrao criado junto vira "Sessão" em vez de "Geral" (ver ServerService.
// createServer), e o app pode oferecer recursos especificos de RPG (mapa de batalha, fichas em
// PDF - ver VoiceChannel.jsx) so' pros servidores desse tipo. Escolhido na criacao do servidor
// (ver CreateServerModal.jsx), nao muda depois.
public enum ServerType {
    NORMAL,
    RPG
}
