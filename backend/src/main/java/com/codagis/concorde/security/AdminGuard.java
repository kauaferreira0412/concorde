package com.codagis.concorde.security;

import com.codagis.concorde.enums.Role;
import com.codagis.concorde.repository.UserRepository;
import org.springframework.stereotype.Component;

@Component
public class AdminGuard {

    private final UserRepository userRepository;

    public AdminGuard(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public void assertAdmin(Long userId) {
        boolean isAdmin = userRepository.findById(userId)
                .map(u -> u.getRole() == Role.ADMIN)
                .orElse(false);
        if (!isAdmin) {
            throw new IllegalStateException("Somente o administrador pode fazer isso");
        }
    }

    /**
     * Acesso ao painel de administracao: precisa ser ADMIN e ter a flag admin_panel,
     * que so e liberada direto no banco pelo dono da VPS.
     */
    public void assertAdminPanel(Long userId) {
        boolean allowed = userRepository.findById(userId)
                .map(u -> u.getRole() == Role.ADMIN && u.isAdminPanel())
                .orElse(false);
        if (!allowed) {
            throw new IllegalStateException("Você não tem acesso ao painel de administração");
        }
    }

    /** Terminal da VPS: painel + flag terminal_access (também só liberada direto no banco). */
    public boolean hasTerminalAccess(Long userId) {
        return userRepository.findById(userId)
                .map(u -> u.getRole() == Role.ADMIN && u.isAdminPanel() && u.isTerminalAccess())
                .orElse(false);
    }

    public void assertTerminalAccess(Long userId) {
        if (!hasTerminalAccess(userId)) {
            throw new IllegalStateException("Você não tem acesso ao terminal da VPS");
        }
    }
}
