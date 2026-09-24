package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "category_access_entries", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"categoryId", "userId"})
}, indexes = {
        @Index(name = "idx_category_access_entries_category_id", columnList = "categoryId"),
        @Index(name = "idx_category_access_entries_user_id", columnList = "userId")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CategoryAccessEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long categoryId;

    @Column(nullable = false)
    private Long userId;
}
