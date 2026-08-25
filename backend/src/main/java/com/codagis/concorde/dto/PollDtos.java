package com.codagis.concorde.dto;

import java.util.List;

public class PollDtos {

    public record CreatePollRequest(String question, List<String> options, boolean multipleChoice) {}

    public record AddPollOptionRequest(Long pollId, String text) {}

    public record VotePollRequest(Long pollId, Long optionId) {}

    public record PollOptionDto(Long id, String text, List<Long> voterUserIds) {}

    public record PollDto(Long id, String question, boolean multipleChoice, Long createdBy, List<PollOptionDto> options) {}
}
