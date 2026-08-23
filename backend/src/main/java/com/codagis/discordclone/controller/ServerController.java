package com.codagis.discordclone.controller;

import com.codagis.discordclone.domain.ServerPermission;
import com.codagis.discordclone.dto.ServerDtos.*;
import com.codagis.discordclone.dto.ServerRoleDtos.*;
import com.codagis.discordclone.security.CurrentUser;
import com.codagis.discordclone.service.GcsService;
import com.codagis.discordclone.service.ServerService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/api/servers")
public class ServerController {

    private final ServerService serverService;
    private final CurrentUser currentUser;
    private final GcsService gcsService;

    public ServerController(ServerService serverService, CurrentUser currentUser, GcsService gcsService) {
        this.serverService = serverService;
        this.currentUser = currentUser;
        this.gcsService = gcsService;
    }

    @GetMapping
    public List<ServerResponse> listMyServers() {
        return serverService.listServersOfUser(currentUser.id());
    }

    @PostMapping
    public ServerResponse create(@Valid @RequestBody CreateServerRequest req) {
        return serverService.createServer(currentUser.id(), req);
    }

    /** Dono/ADMIN global sempre podem, ou quem tiver MANAGE_SERVER nesse servidor especifico
     *  (ver ServerService.updateServer). */
    @PutMapping("/{serverId}")
    public ServerResponse update(@PathVariable Long serverId, @Valid @RequestBody UpdateServerRequest req) {
        return serverService.updateServer(currentUser.id(), serverId, req);
    }

    /** Apaga o servidor inteiro (canais, mensagens, membros e perfis) - so' o ADMIN global,
     *  mais restrito que editar por ser irreversivel (ver ServerService.deleteServer). */
    @DeleteMapping("/{serverId}")
    public void delete(@PathVariable Long serverId) {
        serverService.deleteServer(currentUser.id(), serverId);
    }

    /** Troca o icone do servidor. Salva em potato/servers/{serverId}/... no GCS. */
    @PostMapping(value = "/{serverId}/icon", consumes = "multipart/form-data")
    public ServerResponse uploadIcon(@PathVariable Long serverId, @RequestParam("file") MultipartFile file) {
        String url = gcsService.upload(file, "servers/" + serverId);
        return serverService.updateServerIcon(currentUser.id(), serverId, url);
    }

    /** O apelido que o usuario logado ja tem hoje NESSE servidor (null = nenhum ainda) -
     * pra pre-preencher o campo de edicao (ver Configurações > Perfil no frontend). */
    @GetMapping("/{serverId}/me/nickname")
    public SetNicknameRequest getMyNickname(@PathVariable Long serverId) {
        return new SetNicknameRequest(serverService.getMyNickname(serverId, currentUser.id()));
    }

    /** Qualquer membro escolhe o proprio apelido dentro DESSE servidor - string vazia limpa
     * (volta a mostrar o apelido/username global, ver Membership.nickname). */
    @PutMapping("/{serverId}/me/nickname")
    public void setMyNickname(@PathVariable Long serverId, @RequestBody SetNicknameRequest req) {
        serverService.setMyNickname(serverId, currentUser.id(), req.nickname());
    }

    @GetMapping("/{serverId}/members")
    public List<MemberResponse> listMembers(@PathVariable Long serverId) {
        return serverService.listMembers(serverId, currentUser.id());
    }

    @GetMapping("/{serverId}/channels")
    public List<ChannelResponse> listChannels(@PathVariable Long serverId) {
        return serverService.listChannels(serverId, currentUser.id());
    }

    @PostMapping("/{serverId}/channels")
    public ChannelResponse createChannel(@PathVariable Long serverId, @Valid @RequestBody CreateChannelRequest req) {
        return serverService.createChannel(serverId, currentUser.id(), req);
    }

    @DeleteMapping("/{serverId}/channels/{channelId}")
    public void deleteChannel(@PathVariable Long serverId, @PathVariable Long channelId) {
        serverService.deleteChannel(serverId, currentUser.id(), channelId);
    }

    // ============================================================
    // Moderacao de membros (MANAGE_MEMBERS)
    // ============================================================

    /** Tira o acesso de alguem a esse servidor. */
    @DeleteMapping("/{serverId}/members/{userId}")
    public void removeMember(@PathVariable Long serverId, @PathVariable Long userId) {
        serverService.removeMember(currentUser.id(), serverId, userId);
    }

    /** Edita o apelido de OUTRO membro nesse servidor - diferente de PUT .../me/nickname. */
    @PutMapping("/{serverId}/members/{userId}/nickname")
    public void setMemberNickname(@PathVariable Long serverId, @PathVariable Long userId, @RequestBody SetNicknameRequest req) {
        serverService.setMemberNickname(currentUser.id(), serverId, userId, req.nickname());
    }

    // ============================================================
    // Perfis / permissoes (MANAGE_ROLES)
    // ============================================================

    /** O que EU posso fazer nesse servidor - usado pelo frontend pra decidir o que mostrar. */
    @GetMapping("/{serverId}/me/permissions")
    public Set<ServerPermission> getMyPermissions(@PathVariable Long serverId) {
        return serverService.getMyPermissions(serverId, currentUser.id());
    }

    @GetMapping("/{serverId}/roles")
    public List<RoleResponse> listRoles(@PathVariable Long serverId) {
        return serverService.listRoles(serverId, currentUser.id());
    }

    @PostMapping("/{serverId}/roles")
    public RoleResponse createRole(@PathVariable Long serverId, @Valid @RequestBody CreateRoleRequest req) {
        return serverService.createRole(currentUser.id(), serverId, req);
    }

    @PutMapping("/{serverId}/roles/{roleId}")
    public RoleResponse updateRole(@PathVariable Long serverId, @PathVariable Long roleId, @Valid @RequestBody UpdateRoleRequest req) {
        return serverService.updateRole(currentUser.id(), serverId, roleId, req);
    }

    @DeleteMapping("/{serverId}/roles/{roleId}")
    public void deleteRole(@PathVariable Long serverId, @PathVariable Long roleId) {
        serverService.deleteRole(currentUser.id(), serverId, roleId);
    }

    /** Substitui os perfis atribuidos a um membro (lista inteira, nao incremental). */
    @PutMapping("/{serverId}/members/{userId}/roles")
    public void setMemberRoles(@PathVariable Long serverId, @PathVariable Long userId, @RequestBody SetMemberRolesRequest req) {
        serverService.setMemberRoles(currentUser.id(), serverId, userId, req.roleIds());
    }
}
