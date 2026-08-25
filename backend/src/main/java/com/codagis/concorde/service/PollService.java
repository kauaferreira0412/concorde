package com.codagis.concorde.service;

import com.codagis.concorde.domain.Message;
import com.codagis.concorde.domain.Poll;
import com.codagis.concorde.domain.PollOption;
import com.codagis.concorde.domain.PollVote;
import com.codagis.concorde.dto.MessageDtos.ChatMessage;
import com.codagis.concorde.repository.MessageRepository;
import com.codagis.concorde.repository.PollOptionRepository;
import com.codagis.concorde.repository.PollRepository;
import com.codagis.concorde.repository.PollVoteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class PollService {

    private final PollRepository pollRepository;
    private final PollOptionRepository pollOptionRepository;
    private final PollVoteRepository pollVoteRepository;
    private final MessageRepository messageRepository;
    private final MessageService messageService;

    public PollService(PollRepository pollRepository, PollOptionRepository pollOptionRepository,
                        PollVoteRepository pollVoteRepository, MessageRepository messageRepository,
                        MessageService messageService) {
        this.pollRepository = pollRepository;
        this.pollOptionRepository = pollOptionRepository;
        this.pollVoteRepository = pollVoteRepository;
        this.messageRepository = messageRepository;
        this.messageService = messageService;
    }

    private static final int MAX_OPTIONS = 10;

    @Transactional
    public ChatMessage createPoll(Long channelId, Long userId, String question, List<String> optionTexts, boolean multipleChoice) {
        String q = question == null ? "" : question.trim();
        if (q.isBlank() || q.length() > 200) {
            throw new IllegalArgumentException("A pergunta da enquete precisa ter entre 1 e 200 caracteres");
        }
        List<String> cleanOptions = optionTexts == null ? List.of() : optionTexts.stream()
                .map(o -> o == null ? "" : o.trim())
                .filter(o -> !o.isBlank())
                .toList();
        if (cleanOptions.size() > MAX_OPTIONS) {
            throw new IllegalArgumentException("Uma enquete pode ter no máximo " + MAX_OPTIONS + " opções");
        }

        Poll poll = pollRepository.save(Poll.builder()
                .question(q)
                .createdBy(userId)
                .multipleChoice(multipleChoice)
                .build());
        for (int i = 0; i < cleanOptions.size(); i++) {
            pollOptionRepository.save(PollOption.builder()
                    .pollId(poll.getId())
                    .text(cleanOptions.get(i))
                    .position(i)
                    .build());
        }
        return messageService.saveWithPoll(channelId, userId, "📊 " + q, poll.getId());
    }

    @Transactional
    public ChatMessage addOption(Long channelId, Long userId, Long pollId, String text) {
        Poll poll = pollRepository.findById(pollId)
                .orElseThrow(() -> new IllegalArgumentException("Enquete não encontrada"));
        if (!poll.getCreatedBy().equals(userId)) {
            throw new IllegalStateException("Só quem criou a enquete pode adicionar opções");
        }
        String cleanText = text == null ? "" : text.trim();
        if (cleanText.isBlank() || cleanText.length() > 100) {
            throw new IllegalArgumentException("A opção precisa ter entre 1 e 100 caracteres");
        }
        List<PollOption> existing = pollOptionRepository.findByPollIdOrderByPositionAsc(pollId);
        if (existing.size() >= MAX_OPTIONS) {
            throw new IllegalArgumentException("Uma enquete pode ter no máximo " + MAX_OPTIONS + " opções");
        }
        pollOptionRepository.save(PollOption.builder()
                .pollId(pollId)
                .text(cleanText)
                .position(existing.size())
                .build());

        Message message = messageRepository.findByPollId(pollId)
                .orElseThrow(() -> new IllegalArgumentException("Mensagem dessa enquete não encontrada"));
        return messageService.get(channelId, message.getId());
    }

    @Transactional
    public ChatMessage vote(Long channelId, Long userId, Long pollId, Long optionId) {
        Poll poll = pollRepository.findById(pollId)
                .orElseThrow(() -> new IllegalArgumentException("Enquete não encontrada"));
        PollOption option = pollOptionRepository.findById(optionId)
                .filter(o -> o.getPollId().equals(pollId))
                .orElseThrow(() -> new IllegalArgumentException("Opção inválida"));

        Optional<PollVote> existing = pollVoteRepository.findByOptionIdAndUserId(option.getId(), userId);
        if (existing.isPresent()) {
            pollVoteRepository.delete(existing.get());
        } else {
            if (!poll.isMultipleChoice()) {
                pollVoteRepository.deleteByPollIdAndUserId(pollId, userId);
            }
            pollVoteRepository.save(PollVote.builder()
                    .pollId(pollId)
                    .optionId(option.getId())
                    .userId(userId)
                    .build());
        }

        Message message = messageRepository.findByPollId(pollId)
                .orElseThrow(() -> new IllegalArgumentException("Mensagem dessa enquete não encontrada"));
        return messageService.get(channelId, message.getId());
    }
}
