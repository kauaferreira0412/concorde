package com.codagis.concorde.controller;

import com.codagis.concorde.enums.ServerPermission;
import com.codagis.concorde.dto.AuditLogDtos.AuditLogEntryResponse;
import com.codagis.concorde.dto.ServerDtos.*;
import com.codagis.concorde.dto.ServerRoleDtos.*;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.AuditLogService;
import com.codagis.concorde.service.GcsService;
import com.codagis.concorde.service.ServerService;
import com.codagis.concorde.dto.VoiceDtos.VoiceParticipantInfo;
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
    private final AuditLogService auditLogService;

    public ServerController(ServerService serverService, CurrentUser currentUser, GcsService gcsService,
                             AuditLogService auditLogService) {
        this.serverService = serverService;
        this.currentUser = currentUser;
        this.gcsService = gcsService;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public List<ServerResponse> listMyServers() {
        return serverService.listServersOfUser(currentUser.id());
    }

    @PostMapping
    public ServerResponse create(@Valid @RequestBody CreateServerRequest req) {
        return serverService.createServer(currentUser.id(), req);
    }

    @PutMapping("/{serverId}")
    public ServerResponse update(@PathVariable Long serverId, @Valid @RequestBody UpdateServerRequest req) {
        return serverService.updateServer(currentUser.id(), serverId, req);
    }

    @DeleteMapping("/{serverId}")
    public void delete(@PathVariable Long serverId) {
        serverService.deleteServer(currentUser.id(), serverId);
    }

    @PostMapping(value = "/{serverId}/icon", consumes = "multipart/form-data")
    public ServerResponse uploadIcon(@PathVariable Long serverId, @RequestParam("file") MultipartFile file) {
        String url = gcsService.upload(file, "servers/" + serverId);
        return serverService.updateServerIcon(currentUser.id(), serverId, url);
    }

    @GetMapping("/{serverId}/me/nickname")
    public SetNicknameRequest getMyNickname(@PathVariable Long serverId) {
        return new SetNicknameRequest(serverService.getMyNickname(serverId, currentUser.id()));
    }

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

    @GetMapping("/{serverId}/voice-presence")
    public List<VoiceParticipantInfo> getVoicePresence(@PathVariable Long serverId) {
        return serverService.getVoicePresence(serverId, currentUser.id());
    }

    @PostMapping("/{serverId}/channels")
    public ChannelResponse createChannel(@PathVariable Long serverId, @Valid @RequestBody CreateChannelRequest req) {
        return serverService.createChannel(serverId, currentUser.id(), req);
    }

    @DeleteMapping("/{serverId}/channels/{channelId}")
    public void deleteChannel(@PathVariable Long serverId, @PathVariable Long channelId) {
        serverService.deleteChannel(serverId, currentUser.id(), channelId);
    }

    @DeleteMapping("/{serverId}/members/{userId}")
    public void removeMember(@PathVariable Long serverId, @PathVariable Long userId) {
        serverService.removeMember(currentUser.id(), serverId, userId);
    }

    @PutMapping("/{serverId}/members/{userId}/nickname")
    public void setMemberNickname(@PathVariable Long serverId, @PathVariable Long userId, @RequestBody SetNicknameRequest req) {
        serverService.setMemberNickname(currentUser.id(), serverId, userId, req.nickname());
    }

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

    @PutMapping("/{serverId}/members/{userId}/roles")
    public void setMemberRoles(@PathVariable Long serverId, @PathVariable Long userId, @RequestBody SetMemberRolesRequest req) {
        serverService.setMemberRoles(currentUser.id(), serverId, userId, req.roleIds());
    }

    @GetMapping("/{serverId}/audit-log")
    public List<AuditLogEntryResponse> auditLog(@PathVariable Long serverId) {
        return auditLogService.list(serverId, currentUser.id());
    }

    @GetMapping("/{serverId}/categories")
    public List<CategoryResponse> listCategories(@PathVariable Long serverId) {
        return serverService.listCategories(serverId, currentUser.id());
    }

    @PostMapping("/{serverId}/categories")
    public CategoryResponse createCategory(@PathVariable Long serverId, @Valid @RequestBody CreateCategoryRequest req) {
        return serverService.createCategory(serverId, currentUser.id(), req);
    }

    @PutMapping("/{serverId}/categories/{categoryId}")
    public CategoryResponse updateCategory(@PathVariable Long serverId, @PathVariable Long categoryId, @Valid @RequestBody UpdateCategoryRequest req) {
        return serverService.updateCategory(serverId, currentUser.id(), categoryId, req);
    }

    @DeleteMapping("/{serverId}/categories/{categoryId}")
    public void deleteCategory(@PathVariable Long serverId, @PathVariable Long categoryId) {
        serverService.deleteCategory(serverId, currentUser.id(), categoryId);
    }

    @PutMapping("/{serverId}/channels/{channelId}/category")
    public ChannelResponse moveChannelToCategory(@PathVariable Long serverId, @PathVariable Long channelId, @RequestBody MoveChannelRequest req) {
        return serverService.moveChannelToCategory(serverId, currentUser.id(), channelId, req.categoryId());
    }
}
