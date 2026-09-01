package com.codagis.concorde.service;

import com.codagis.concorde.domain.BattleMap;
import com.codagis.concorde.domain.Channel;
import com.codagis.concorde.domain.ChannelCategory;
import com.codagis.concorde.domain.MapToken;
import com.codagis.concorde.dto.MapDtos.AddTokenRequest;
import com.codagis.concorde.dto.MapDtos.BattleMapResponse;
import com.codagis.concorde.dto.MapDtos.MapSnapshot;
import com.codagis.concorde.dto.MapDtos.MapTokenResponse;
import com.codagis.concorde.dto.MapDtos.RenameTokenRequest;
import com.codagis.concorde.enums.ServerPermission;
import com.codagis.concorde.repository.BattleMapRepository;
import com.codagis.concorde.repository.CategoryAccessRepository;
import com.codagis.concorde.repository.ChannelCategoryRepository;
import com.codagis.concorde.repository.ChannelRepository;
import com.codagis.concorde.repository.MapTokenRepository;
import com.codagis.concorde.repository.MembershipRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Mapa de batalha de um canal de VOZ - kit de RPG (ver BattleMap.jsx no frontend, pedido
 * explicito do usuario: "algo muito parecido com o Roll20"). Um mapa por canal (subir um novo
 * substitui a imagem, os tokens continuam onde estavam); x/y dos tokens sao FRACOES da imagem
 * (0..1), pra bater certinho pra todo mundo independente do zoom/tela de cada um - ver
 * MapToken.java.
 */
@Service
public class MapService {

    private final BattleMapRepository battleMapRepository;
    private final MapTokenRepository mapTokenRepository;
    private final ChannelRepository channelRepository;
    private final MembershipRepository membershipRepository;
    private final CategoryAccessRepository categoryAccessRepository;
    private final ChannelCategoryRepository channelCategoryRepository;
    private final PermissionService permissionService;

    public MapService(BattleMapRepository battleMapRepository, MapTokenRepository mapTokenRepository,
                       ChannelRepository channelRepository, MembershipRepository membershipRepository,
                       CategoryAccessRepository categoryAccessRepository, ChannelCategoryRepository channelCategoryRepository,
                       PermissionService permissionService) {
        this.battleMapRepository = battleMapRepository;
        this.mapTokenRepository = mapTokenRepository;
        this.channelRepository = channelRepository;
        this.membershipRepository = membershipRepository;
        this.categoryAccessRepository = categoryAccessRepository;
        this.channelCategoryRepository = channelCategoryRepository;
        this.permissionService = permissionService;
    }

    /** Confere que o canal existe, que o usuario e' membro do servidor dono dele, e que (se a
     *  categoria do canal tiver acesso restrito) o usuario esta' na lista - devolve o canal pra
     *  quem chamou nao precisar buscar de novo. */
    private Channel assertCanUseMap(Long channelId, Long userId) {
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new IllegalArgumentException("Canal não encontrado"));
        if (!membershipRepository.existsByServerIdAndUserId(channel.getServerId(), userId)) {
            throw new IllegalStateException("Você não pertence a esse servidor");
        }
        if (channel.getCategoryId() != null) {
            var entries = categoryAccessRepository.findByCategoryId(channel.getCategoryId());
            boolean restricted = !entries.isEmpty();
            boolean allowed = entries.stream().anyMatch(e -> e.getUserId().equals(userId));
            if (restricted && !allowed) {
                throw new IllegalStateException("Você não tem acesso a essa categoria");
            }
        }
        return channel;
    }

    public MapSnapshot getSnapshot(Long channelId, Long userId) {
        Channel channel = assertCanUseMap(channelId, userId);
        BattleMapResponse map = battleMapRepository.findByChannelId(channelId).map(this::toResponse).orElse(null);
        List<MapTokenResponse> tokens = mapTokenRepository.findByChannelIdOrderByIdAsc(channelId).stream()
                .map(this::toResponse)
                .toList();
        return new MapSnapshot(map, tokens, canManageMap(channel, userId));
    }

    /** So' o "mestre" (quem CRIOU a categoria desse canal, ver ChannelCategory.createdBy) pode
     *  subir/trocar o mapa - pedido explicito do usuario: "quem vai criar a categoria do seu
     *  RPG e' o mestre... apenas eu posso adicionar o mapa". Cai pro fallback de
     *  MANAGE_CHANNELS quando o canal nao tem categoria, ou quando a categoria e' de ANTES
     *  dessa regra existir (createdBy null - nao da' pra saber quem criou). Dono do servidor/
     *  admin global sempre passam (ver PermissionService.isOwnerOrGlobalAdmin, embutido em
     *  has()). */
    private boolean canManageMap(Channel channel, Long userId) {
        if (channel.getCategoryId() != null) {
            ChannelCategory category = channelCategoryRepository.findById(channel.getCategoryId()).orElse(null);
            if (category != null && category.getCreatedBy() != null) {
                return category.getCreatedBy().equals(userId);
            }
        }
        return permissionService.has(channel.getServerId(), userId, ServerPermission.MANAGE_CHANNELS);
    }

    @Transactional
    public BattleMapResponse uploadMap(Long channelId, Long userId, String imageUrl) {
        Channel channel = assertCanUseMap(channelId, userId);
        if (!canManageMap(channel, userId)) {
            throw new IllegalStateException("Só o mestre dessa categoria pode subir o mapa");
        }
        BattleMap map = battleMapRepository.findByChannelId(channelId)
                .orElseGet(() -> BattleMap.builder().channelId(channelId).build());
        map.setImageUrl(imageUrl);
        map.setUpdatedAt(Instant.now());
        return toResponse(battleMapRepository.save(map));
    }

    @Transactional
    public MapTokenResponse addToken(Long channelId, Long userId, AddTokenRequest req) {
        assertCanUseMap(channelId, userId);
        double x = clamp01(req.x());
        double y = clamp01(req.y());
        String label = (req.label() == null || req.label().isBlank()) ? "Token" : req.label().trim();
        if (label.length() > 40) label = label.substring(0, 40);
        String color = (req.color() == null || req.color().isBlank()) ? "#5865f2" : req.color();
        MapToken token = mapTokenRepository.save(MapToken.builder()
                .channelId(channelId)
                .label(label)
                .color(color)
                .x(x)
                .y(y)
                .createdBy(userId)
                .build());
        return toResponse(token);
    }

    @Transactional
    public void moveToken(Long channelId, Long userId, Long tokenId, double x, double y) {
        assertCanUseMap(channelId, userId);
        MapToken token = requireTokenOfChannel(channelId, tokenId);
        token.setX(clamp01(x));
        token.setY(clamp01(y));
        mapTokenRepository.save(token);
    }

    @Transactional
    public MapTokenResponse renameToken(Long channelId, Long userId, Long tokenId, RenameTokenRequest req) {
        assertCanUseMap(channelId, userId);
        MapToken token = requireTokenOfChannel(channelId, tokenId);
        if (req.label() != null && !req.label().isBlank()) {
            token.setLabel(req.label().trim().length() > 40 ? req.label().trim().substring(0, 40) : req.label().trim());
        }
        if (req.color() != null && !req.color().isBlank()) {
            token.setColor(req.color());
        }
        return toResponse(mapTokenRepository.save(token));
    }

    @Transactional
    public void removeToken(Long channelId, Long userId, Long tokenId) {
        assertCanUseMap(channelId, userId);
        MapToken token = requireTokenOfChannel(channelId, tokenId);
        mapTokenRepository.delete(token);
    }

    private MapToken requireTokenOfChannel(Long channelId, Long tokenId) {
        MapToken token = mapTokenRepository.findById(tokenId)
                .orElseThrow(() -> new IllegalArgumentException("Token não encontrado"));
        if (!token.getChannelId().equals(channelId)) {
            throw new IllegalArgumentException("Token não pertence a esse canal");
        }
        return token;
    }

    private double clamp01(double v) {
        return Math.max(0, Math.min(1, v));
    }

    private BattleMapResponse toResponse(BattleMap map) {
        return new BattleMapResponse(map.getChannelId(), map.getImageUrl(), map.getUpdatedAt());
    }

    private MapTokenResponse toResponse(MapToken token) {
        return new MapTokenResponse(token.getId(), token.getChannelId(), token.getLabel(), token.getColor(), token.getX(), token.getY());
    }
}
