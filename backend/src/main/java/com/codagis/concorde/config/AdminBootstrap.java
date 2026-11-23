package com.codagis.concorde.config;

import com.codagis.concorde.enums.Role;
import com.codagis.concorde.domain.User;
import com.codagis.concorde.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class AdminBootstrap implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final String adminUsername;
    private final String adminEmail;
    private final String adminPassword;

    public AdminBootstrap(UserRepository userRepository, PasswordEncoder passwordEncoder,
                           @Value("${app.admin.username}") String adminUsername,
                           @Value("${app.admin.email}") String adminEmail,
                           @Value("${app.admin.password}") String adminPassword) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.adminUsername = adminUsername;
        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
    }

    @Override
    public void run(String... args) {
        if (userRepository.existsByRole(Role.ADMIN)) {
            ensurePanelOwner();
            return;
        }
        User admin = User.builder()
                .username(adminUsername)
                .email(adminEmail)
                .passwordHash(passwordEncoder.encode(adminPassword))
                .role(Role.ADMIN)
                .adminPanel(true)
                .build();
        userRepository.save(admin);
        System.out.println("==============================================================");
        System.out.println(" Conta ADMIN criada: usuario='" + adminUsername + "'");
        System.out.println(" Troque a senha padrao em application.yml (app.admin.password)");
        System.out.println("==============================================================");
    }

    /**
     * Na primeira subida depois que a coluna admin_panel foi criada ninguem tem a flag -
     * entrega pro admin mais antigo (o dono) pra ele nao ficar trancado fora do painel.
     * Depois disso, a flag so muda direto no banco.
     */
    private void ensurePanelOwner() {
        if (userRepository.existsByAdminPanelTrue()) {
            return;
        }
        userRepository.findFirstByRoleOrderByIdAsc(Role.ADMIN).ifPresent(owner -> {
            owner.setAdminPanel(true);
            userRepository.save(owner);
            System.out.println("Acesso ao painel de administracao liberado para '" + owner.getUsername()
                    + "' (nenhuma conta tinha a flag admin_panel)");
        });
    }
}
