package com.codagis.concorde.controller;

import com.codagis.concorde.dto.AdminDtos.GrantAccessRequest;
import com.codagis.concorde.dto.AdminDtos.UpdateUserRequest;
import com.codagis.concorde.dto.AuthDtos.CreateUserRequest;
import com.codagis.concorde.dto.AuthDtos.UserResponse;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.AuthService;
import com.codagis.concorde.service.ServerService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AuthService authService;
    private final ServerService serverService;
    private final CurrentUser currentUser;

    public AdminController(AuthService authService, ServerService serverService, CurrentUser currentUser) {
        this.authService = authService;
        this.serverService = serverService;
        this.currentUser = currentUser;
    }

    @PostMapping("/users")
    public UserResponse createUser(@Valid @RequestBody CreateUserRequest req) {
        return authService.createUserAsAdmin(currentUser.id(), req);
    }

    @GetMapping("/users")
    public List<UserResponse> listUsers() {
        return authService.listUsersAsAdmin(currentUser.id());
    }

    @PutMapping("/users/{userId}")
    public UserResponse updateUser(@PathVariable Long userId, @Valid @RequestBody UpdateUserRequest req) {
        return authService.updateUserAsAdmin(currentUser.id(), userId, req);
    }

    @DeleteMapping("/users/{userId}")
    public void deleteUser(@PathVariable Long userId) {
        authService.deleteUserAsAdmin(currentUser.id(), userId);
    }

    @PostMapping("/servers/{serverId}/members")
    public void grantAccess(@PathVariable Long serverId, @Valid @RequestBody GrantAccessRequest req) {
        serverService.grantAccessAsAdmin(currentUser.id(), serverId, req.userId());
    }
}
