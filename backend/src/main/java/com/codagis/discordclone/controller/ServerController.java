package com.codagis.discordclone.controller;

import com.codagis.discordclone.dto.ServerDtos.*;
import com.codagis.discordclone.security.CurrentUser;
import com.codagis.discordclone.service.GcsService;
import com.codagis.discordclone.service.ServerService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

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

    /** So o ADMIN (mesmo criterio de quem pode criar servidor) pode editar nome/descricao. */
    @PutMapping("/{serverId}")
    public ServerResponse update(@PathVariable Long serverId, @Valid @RequestBody UpdateServerRequest req) {
        return serverService.updateServer(currentUser.id(), serverId, req);
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
}
