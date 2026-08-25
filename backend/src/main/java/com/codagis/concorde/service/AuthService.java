package com.codagis.concorde.service;

import com.codagis.concorde.domain.Role;
import com.codagis.concorde.domain.User;
import com.codagis.concorde.dto.AdminDtos.UpdateUserRequest;
import com.codagis.concorde.dto.AuthDtos.*;
import com.codagis.concorde.repository.MembershipRepository;
import com.codagis.concorde.repository.UserRepository;
import com.codagis.concorde.security.AdminGuard;
import com.codagis.concorde.security.JwtService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final MembershipRepository membershipRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AdminGuard adminGuard;

    public AuthService(UserRepository userRepository, MembershipRepository membershipRepository,
                        PasswordEncoder passwordEncoder, JwtService jwtService, AdminGuard adminGuard) {
        this.userRepository = userRepository;
        this.membershipRepository = membershipRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.adminGuard = adminGuard;
    }

    public AuthResponse login(LoginRequest req) {
        User user = userRepository.findByUsername(req.usernameOrEmail())
                .or(() -> userRepository.findByEmail(req.usernameOrEmail()))
                .orElseThrow(() -> new IllegalArgumentException("Credenciais invalidas"));
        if (!passwordEncoder.matches(req.password(), user.getPasswordHash())) {
            throw new IllegalArgumentException("Credenciais invalidas");
        }
        return buildAuthResponse(user);
    }

    @Transactional
    public UserResponse createUserAsAdmin(Long requesterId, CreateUserRequest req) {
        adminGuard.assertAdmin(requesterId);
        if (userRepository.existsByUsername(req.username())) {
            throw new IllegalArgumentException("Nome de usuario ja esta em uso");
        }
        if (userRepository.existsByEmail(req.email())) {
            throw new IllegalArgumentException("Email ja esta em uso");
        }
        User user = User.builder()
                .username(req.username())
                .email(req.email())
                .passwordHash(passwordEncoder.encode(req.password()))
                .role(Role.USER)
                .build();
        user = userRepository.save(user);
        return toUserResponse(user);
    }

    public List<UserResponse> listUsersAsAdmin(Long requesterId) {
        adminGuard.assertAdmin(requesterId);
        return userRepository.findAll().stream().map(this::toUserResponse).toList();
    }

    @Transactional
    public UserResponse updateUserAsAdmin(Long requesterId, Long targetUserId, UpdateUserRequest req) {
        adminGuard.assertAdmin(requesterId);
        User user = userRepository.findById(targetUserId)
                .orElseThrow(() -> new IllegalArgumentException("Usuario nao encontrado"));

        if (!user.getUsername().equalsIgnoreCase(req.username()) && userRepository.existsByUsername(req.username())) {
            throw new IllegalArgumentException("Nome de usuario ja esta em uso");
        }
        if (!user.getEmail().equalsIgnoreCase(req.email()) && userRepository.existsByEmail(req.email())) {
            throw new IllegalArgumentException("Email ja esta em uso");
        }
        if (user.getRole() == Role.ADMIN && req.role() != Role.ADMIN && countAdmins() <= 1) {
            throw new IllegalArgumentException("Não é possível rebaixar o único administrador");
        }

        user.setUsername(req.username());
        user.setEmail(req.email());
        user.setRole(req.role());
        if (req.password() != null && !req.password().isBlank()) {
            if (req.password().length() < 6) {
                throw new IllegalArgumentException("Senha precisa ter pelo menos 6 caracteres");
            }
            user.setPasswordHash(passwordEncoder.encode(req.password()));
        }
        userRepository.save(user);
        return toUserResponse(user);
    }

    @Transactional
    public void deleteUserAsAdmin(Long requesterId, Long targetUserId) {
        adminGuard.assertAdmin(requesterId);
        if (requesterId.equals(targetUserId)) {
            throw new IllegalArgumentException("Você não pode excluir a própria conta");
        }
        User user = userRepository.findById(targetUserId)
                .orElseThrow(() -> new IllegalArgumentException("Usuario nao encontrado"));
        if (user.getRole() == Role.ADMIN && countAdmins() <= 1) {
            throw new IllegalArgumentException("Não é possível excluir o único administrador");
        }
        membershipRepository.findByUserId(targetUserId).forEach(membershipRepository::delete);
        userRepository.delete(user);
    }

    private long countAdmins() {
        return userRepository.findAll().stream().filter(u -> u.getRole() == Role.ADMIN).count();
    }

    private AuthResponse buildAuthResponse(User user) {
        String token = jwtService.generateToken(user.getId(), user.getUsername());
        return new AuthResponse(token, toUserResponse(user));
    }

    private UserResponse toUserResponse(User user) {
        return new UserResponse(user.getId(), user.getUsername(), user.getEmail(), user.getAvatarUrl(), user.getRole(),
                user.getStatus(), user.getNickname(), user.getBio());
    }
}
