package com.codagis.concorde.repository;

import com.codagis.concorde.domain.Server;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ServerRepository extends JpaRepository<Server, Long> {
}
