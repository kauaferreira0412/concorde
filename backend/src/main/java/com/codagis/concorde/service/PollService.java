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
        if (cleanOptions.size() < 2 || cleanOptions.size() > 10) {
            throw new IllegalArgumentException("Uma enquete precisa de 2 a 10 opções");
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
