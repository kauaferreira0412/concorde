package com.codagis.concorde.service;

import com.codagis.concorde.domain.SoundboardClip;
import com.codagis.concorde.dto.SoundboardDtos.ClipResponse;
import com.codagis.concorde.repository.SoundboardClipRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Service
public class SoundboardService {

    private final SoundboardClipRepository soundboardClipRepository;
    private final GcsService gcsService;

    public SoundboardService(SoundboardClipRepository soundboardClipRepository, GcsService gcsService) {
        this.soundboardClipRepository = soundboardClipRepository;
        this.gcsService = gcsService;
    }

    public List<ClipResponse> listMyClips(Long userId) {
        return soundboardClipRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public ClipResponse uploadClip(Long userId, MultipartFile file, String name) {
        String cleanName = (name == null || name.isBlank()) ? "Som" : name.trim();
        if (cleanName.length() > 60) {
            cleanName = cleanName.substring(0, 60);
        }
        String url = gcsService.uploadAudio(file, "soundboard/" + userId);
        SoundboardClip clip = soundboardClipRepository.save(SoundboardClip.builder()
                .userId(userId)
                .name(cleanName)
                .fileUrl(url)
                .build());
        return toResponse(clip);
    }

    @Transactional
    public void deleteClip(Long userId, Long clipId) {
        SoundboardClip clip = requireOwned(userId, clipId);
        soundboardClipRepository.delete(clip);
    }

    public SoundboardClip requireOwned(Long userId, Long clipId) {
        SoundboardClip clip = soundboardClipRepository.findById(clipId)
                .orElseThrow(() -> new IllegalArgumentException("Som não encontrado"));
        if (!clip.getUserId().equals(userId)) {
            throw new IllegalStateException("Esse som não é seu");
        }
        return clip;
    }

    private ClipResponse toResponse(SoundboardClip clip) {
        return new ClipResponse(clip.getId(), clip.getName(), clip.getFileUrl(), clip.getCreatedAt());
    }
}
