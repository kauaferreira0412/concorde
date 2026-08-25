package com.codagis.concorde.dto;

import java.time.Instant;

public class SoundboardDtos {

    public record ClipResponse(Long id, String name, String fileUrl, Instant createdAt) {}

    public record UploadClipRequest(String name) {}
}
