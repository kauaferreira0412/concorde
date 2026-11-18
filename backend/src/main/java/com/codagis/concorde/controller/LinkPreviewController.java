package com.codagis.concorde.controller;

import com.codagis.concorde.service.LinkPreviewService;
import com.codagis.concorde.service.LinkPreviewService.LinkPreview;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/link-preview")
public class LinkPreviewController {

    private final LinkPreviewService linkPreviewService;

    public LinkPreviewController(LinkPreviewService linkPreviewService) {
        this.linkPreviewService = linkPreviewService;
    }

    @GetMapping
    public LinkPreview preview(@RequestParam String url) {
        return linkPreviewService.preview(url);
    }
}
