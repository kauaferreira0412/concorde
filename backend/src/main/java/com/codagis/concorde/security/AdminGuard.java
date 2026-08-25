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
}
