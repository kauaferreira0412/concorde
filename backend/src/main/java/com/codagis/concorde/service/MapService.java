package com.codagis.concorde.service;

import com.codagis.concorde.domain.BattleMap;
import com.codagis.concorde.domain.Channel;
import com.codagis.concorde.domain.ChannelCategory;
import com.codagis.concorde.domain.MapToken;
import com.codagis.concorde.dto.MapDtos.AddTokenRequest;
import com.codagis.concorde.dto.MapDtos.BattleMapResponse;
import com.codagis.concorde.dto.MapDtos.MapDetail;
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
 * Mapas de batalha de um canal de VOZ - kit de RPG (ver BattleMap.jsx no frontend, pedido
 * explicito do usuario: "algo muito parecido com o Roll20"). Um canal pode ter VARIOS mapas
 * (mapa 1, mapa 2, mapa 3...) - so' o mestre cria/apaga/decide qual esta' ATIVO (o que todo
 * mundo ve agora); cada mapa guarda o PROPRIO conjunto de tokens, entao trocar de mapa e voltar
 * restaura os tokens exatamente onde estavam (pedido explicito do usuario). x/y dos tokens sao
 * FRACOES da imagem (0..1), pra bater certinho pra todo mundo independente do zoom/tela de cada
 * um - ver MapToken.java.
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

    /** Versao PUBLICA de assertCanUseMap - usada pelo MapController antes de subir a imagem de
     *  um token pro GCS (mesma regra de "pode usar o mapa desse canal", nao precisa ser o
     *  mestre pra isso - qualquer jogador customiza o proprio token). */
    public void assertCanUploadTokenImage(Long channelId, Long userId) {
        assertCanUseMap(channelId, userId);
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

    /** maps = TODOS os mapas do canal quando ESSE usuario e' o mestre (ele precisa ver/gerenciar
     *  os mapas que ainda esta' preparando, que os jogadores nao devem ver ainda - pedido
     *  explicito do usuario: "o mestre pode criar o mapa e adicionar os inimigos antes dos
     *  jogadores verem"); pra quem NAO e' o mestre, so' o mapa ATIVO aparece (ou nenhum, se o
     *  mestre ainda nao ativou nenhum) - assim nenhum jogador enxerga sequer a MINIATURA de um
     *  mapa que o mestre ainda esta' preparando. tokens = os do mapa ATIVO (usado so' como valor
     *  inicial - o mestre troca de mapa localmente sem mexer no ativo, ver getMapDetail). */
    public MapSnapshot getSnapshot(Long channelId, Long userId) {
        Channel channel = assertCanUseMap(channelId, userId);
        boolean manage = canManageMap(channel, userId);
        List<BattleMap> maps = battleMapRepository.findByChannelIdOrderByIdAsc(channelId);
        BattleMap active = maps.stream().filter(m -> Boolean.TRUE.equals(m.getActive())).findFirst().orElse(null);
        List<MapTokenResponse> tokens = active == null ? List.of()
                : mapTokenRepository.findByMapIdOrderByIdAsc(active.getId()).stream().map(this::toResponse).toList();
        List<BattleMap> visibleMaps = manage ? maps : (active == null ? List.of() : List.of(active));
        List<BattleMapResponse> mapResponses = visibleMaps.stream()
                .map(m -> toResponse(m, active != null && m.getId().equals(active.getId())))
                .toList();
        return new MapSnapshot(mapResponses, active == null ? null : active.getId(), tokens, manage);
    }

    /** Detalhe (mapa + tokens) de UM mapa especifico, pra quando o mestre esta' "olhando"/
     *  preparando um mapa diferente do que esta' ativo pros jogadores agora (ver BattleMap.jsx -
     *  "viewingMapId" e' independente do mapa ativo). So' o mestre pode pedir um mapa que ainda
     *  nao esta' ativo - um jogador so' consegue pedir o mapa que ja' esta' ativo mesmo (defesa
     *  a mais, alem do frontend nem oferecer essa opcao pra ele). */
    public MapDetail getMapDetail(Long channelId, Long userId, Long mapId) {
        Channel channel = assertCanUseMap(channelId, userId);
        BattleMap map = requireMapOfChannel(channelId, mapId);
        boolean manage = canManageMap(channel, userId);
        if (!manage && !Boolean.TRUE.equals(map.getActive())) {
            throw new IllegalStateException("Esse mapa ainda não foi liberado pelo mestre");
        }
        List<MapTokenResponse> tokens = mapTokenRepository.findByMapIdOrderByIdAsc(mapId).stream().map(this::toResponse).toList();
        return new MapDetail(toResponse(map, Boolean.TRUE.equals(map.getActive())), tokens);
    }

    /** So' o "mestre" (quem CRIOU a categoria desse canal, ver ChannelCategory.createdBy) pode
     *  criar/apagar/trocar o mapa ativo, e agora tambem ADICIONAR token - pedido explicito do
     *  usuario: "apenas o mestre que pode adicionar um token". Cai pro fallback de
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

    /** Cria um mapa NOVO (nao substitui os existentes - pedido explicito do usuario: "mapa um,
     *  mapa dois, mapa tres..."). Nasce SEMPRE inativo, mesmo o primeiro do canal - pedido
     *  explicito do usuario: "o mestre pode criar o mapa e adicionar os inimigos, antes dos
     *  jogadores verem"; ele decide quando "revelar" pros jogadores via activateMap. Enquanto
     *  nenhum mapa estiver ativo, os jogadores so' veem "o mestre ainda não subiu um mapa". */
    @Transactional
    public BattleMapResponse createMap(Long channelId, Long userId, String name, String imageUrl) {
        Channel channel = assertCanUseMap(channelId, userId);
        if (!canManageMap(channel, userId)) {
            throw new IllegalStateException("Só o mestre dessa categoria pode adicionar um mapa");
        }
        String cleanName = (name == null || name.isBlank()) ? null : name.trim();
        if (cleanName != null && cleanName.length() > 60) cleanName = cleanName.substring(0, 60);
        BattleMap map = battleMapRepository.save(BattleMap.builder()
                .channelId(channelId)
                .name(cleanName)
                .imageUrl(imageUrl)
                .active(false)
                .createdBy(userId)
                .build());
        return toResponse(map, false);
    }

    /** Troca qual mapa esta' "ativo" (o que TODOS os jogadores veem) - pedido explicito do
     *  usuario: "o mestre deve ter o controle de mudar a visão dos jogadores". */
    @Transactional
    public BattleMapResponse activateMap(Long channelId, Long userId, Long mapId) {
        Channel channel = assertCanUseMap(channelId, userId);
        if (!canManageMap(channel, userId)) {
            throw new IllegalStateException("Só o mestre dessa categoria pode trocar o mapa ativo");
        }
        BattleMap target = requireMapOfChannel(channelId, mapId);
        for (BattleMap m : battleMapRepository.findByChannelIdOrderByIdAsc(channelId)) {
            boolean shouldBeActive = m.getId().equals(mapId);
            if (!Boolean.valueOf(shouldBeActive).equals(m.getActive())) {
                m.setActive(shouldBeActive);
                battleMapRepository.save(m);
            }
        }
        return toResponse(target, true);
    }

    /** Apaga um mapa e todos os tokens dele. Se era o mapa ativo, ativa automaticamente o mais
     *  recente que sobrou (senao ninguem veria mapa nenhum ate' o mestre escolher outro). */
    @Transactional
    public void deleteMap(Long channelId, Long userId, Long mapId) {
        Channel channel = assertCanUseMap(channelId, userId);
        if (!canManageMap(channel, userId)) {
            throw new IllegalStateException("Só o mestre dessa categoria pode apagar um mapa");
        }
        BattleMap target = requireMapOfChannel(channelId, mapId);
        boolean wasActive = Boolean.TRUE.equals(target.getActive());
        mapTokenRepository.deleteByMapId(mapId);
        battleMapRepository.delete(target);
        if (wasActive) {
            List<BattleMap> remaining = battleMapRepository.findByChannelIdOrderByIdAsc(channelId);
            if (!remaining.isEmpty()) {
                BattleMap next = remaining.get(remaining.size() - 1);
                next.setActive(true);
                battleMapRepository.save(next);
            }
        }
    }

    @Transactional
    public MapTokenResponse addToken(Long channelId, Long userId, AddTokenRequest req) {
        Channel channel = assertCanUseMap(channelId, userId);
        if (!canManageMap(channel, userId)) {
            throw new IllegalStateException("Só o mestre dessa categoria pode adicionar um token");
        }
        BattleMap map = requireMapOfChannel(channelId, req.mapId());
        double x = clamp01(req.x());
        double y = clamp01(req.y());
        String label = (req.label() == null || req.label().isBlank()) ? "Token" : req.label().trim();
        if (label.length() > 40) label = label.substring(0, 40);
        String color = (req.color() == null || req.color().isBlank()) ? "#5865f2" : req.color();
        MapToken token = mapTokenRepository.save(MapToken.builder()
                .channelId(channelId)
                .mapId(map.getId())
                .label(label)
                .color(color)
                .imageUrl(req.imageUrl() == null || req.imageUrl().isBlank() ? null : req.imageUrl())
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
        // "" (vazio) = REMOVE a imagem (volta pro circulo colorido) - null = nao mexe na
        // imagem atual (ver comentario no RenameTokenRequest/MapDtos.java).
        if (req.imageUrl() != null) {
            token.setImageUrl(req.imageUrl().isBlank() ? null : req.imageUrl());
        }
        return toResponse(mapTokenRepository.save(token));
    }

    @Transactional
    public void removeToken(Long channelId, Long userId, Long tokenId) {
        assertCanUseMap(channelId, userId);
        MapToken token = requireTokenOfChannel(channelId, tokenId);
        mapTokenRepository.delete(token);
    }

    private BattleMap requireMapOfChannel(Long channelId, Long mapId) {
        if (mapId == null) throw new IllegalArgumentException("Mapa não informado");
        BattleMap map = battleMapRepository.findById(mapId)
                .orElseThrow(() -> new IllegalArgumentException("Mapa não encontrado"));
        if (!map.getChannelId().equals(channelId)) {
            throw new IllegalArgumentException("Mapa não pertence a esse canal");
        }
        return map;
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

    private BattleMapResponse toResponse(BattleMap map, boolean active) {
        return new BattleMapResponse(map.getId(), map.getChannelId(), map.getName(), map.getImageUrl(), active, map.getCreatedAt());
    }

    private MapTokenResponse toResponse(MapToken token) {
        return new MapTokenResponse(token.getId(), token.getMapId(), token.getLabel(), token.getColor(),
                token.getX(), token.getY(), token.getImageUrl());
    }
}
