package com.codagis.discordclone.domain;

/**
 * Catalogo FIXO de permissoes que existem no sistema - so' o time que mantem o codigo
 * adiciona/remove uma permissao daqui (nao e' algo que o admin cadastra pela UI). O que o
 * ADMIN e quem ele autorizar (via a permissao MANAGE_ROLES) fazem pela UI e' criar "Perfis"
 * (ver ServerRole) que agrupam um subconjunto dessas permissoes e atribuir esses perfis aos
 * membros de um servidor especifico (ver Membership.roleIds/PermissionService).
 */
public enum ServerPermission {
    /** Mover um membro de um canal de voz pra outro a força. */
    MOVE_MEMBERS,
    /** Mutar/desmutar o microfone de outro membro a força (ver VoiceModerationController). */
    MUTE_MEMBERS,
    /** Ensurdecer/reativar o audio de outro membro a força. */
    DEAFEN_MEMBERS,
    /** Desconectar um membro de uma call de voz (sem tirar o acesso ao servidor). */
    KICK_VOICE,
    /** Criar/editar/apagar canais de texto e voz do servidor. */
    MANAGE_CHANNELS,
    /** Remover um membro do SERVIDOR e editar o apelido de outros membros nesse servidor. */
    MANAGE_MEMBERS,
    /** Criar/editar/apagar Perfis (ServerRole) e atribui-los a membros - controla quem mais
     * pode conceder as outras permissoes daqui pra frente. */
    MANAGE_ROLES,
    /** Editar nome/descricao/icone do SERVIDOR em si (ver EditServerModal.jsx) - NAO inclui
     * excluir o servidor inteiro, isso continua so' do dono/ADMIN global (ver
     * ServerService.deleteServer, deliberadamente mais restrito por ser irreversivel). */
    MANAGE_SERVER
}
