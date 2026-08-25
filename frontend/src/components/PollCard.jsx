import { useState } from "react";
import { addPollOption, votePoll } from "../ws/chatSocket";
import { CheckIcon, PlusIcon } from "./icons.jsx";

const MAX_OPTIONS = 10;

/**
 * Card da enquete no chat (ver PollController/PollService no backend). A enquete comeca so'
 * com a pergunta - so' quem CRIOU ela (poll.createdBy) ve o campo de adicionar opcao aqui
 * embaixo; todo mundo mais so' vota nas opcoes que ja existem (clique de novo tira o voto).
 */
export default function PollCard({ poll, channelId, myUserId, stompClient, stompConnected }) {
  const [newOption, setNewOption] = useState("");
  const [adding, setAdding] = useState(false);
  const totalVotes = poll.options.reduce((sum, o) => sum + o.voterUserIds.length, 0);
  const isCreator = myUserId != null && myUserId === poll.createdBy;

  function toggleVote(optionId) {
    if (!stompConnected) return;
    votePoll(stompClient, channelId, poll.id, optionId);
  }

  function handleAddOption(e) {
    e.preventDefault();
    const text = newOption.trim();
    if (!text || !stompConnected) return;
    addPollOption(stompClient, channelId, poll.id, text);
    setNewOption("");
    setAdding(false);
  }

  return (
    <div className="poll-card">
      <div className="poll-card-question">
        📊 {poll.question}
        {poll.multipleChoice && <span className="poll-card-hint">escolha múltipla</span>}
      </div>

      {poll.options.length === 0 ? (
        <p className="poll-card-empty">
          {isCreator ? "Nenhuma opção ainda - adicione a primeira abaixo." : "Aguardando quem criou adicionar as opções..."}
        </p>
      ) : (
        <div className="poll-card-options">
          {poll.options.map((o) => {
            const votes = o.voterUserIds.length;
            const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            const votedByMe = myUserId != null && o.voterUserIds.includes(myUserId);
            return (
              <button
                type="button"
                key={o.id}
                className={"poll-card-option" + (votedByMe ? " voted" : "")}
                onClick={() => toggleVote(o.id)}
                disabled={!stompConnected}
              >
                <div className="poll-card-option-bar" style={{ width: `${pct}%` }} />
                <span className="poll-card-option-check">{votedByMe && <CheckIcon size={14} />}</span>
                <span className="poll-card-option-text">{o.text}</span>
                <span className="poll-card-option-votes">
                  {votes} {votes === 1 ? "voto" : "votos"} · {pct}%
                </span>
              </button>
            );
          })}
        </div>
      )}

      {isCreator && poll.options.length < MAX_OPTIONS && (
        adding ? (
          <form className="poll-card-add-form" onSubmit={handleAddOption}>
            <input
              autoFocus
              placeholder="Nova opção..."
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              maxLength={100}
              onBlur={() => !newOption.trim() && setAdding(false)}
            />
            <button type="submit" disabled={!stompConnected || !newOption.trim()}>
              Adicionar
            </button>
          </form>
        ) : (
          <button type="button" className="poll-card-add-btn" onClick={() => setAdding(true)}>
            <PlusIcon size={13} /> Adicionar opção
          </button>
        )
      )}

      {totalVotes > 0 && (
        <div className="poll-card-total">{totalVotes} {totalVotes === 1 ? "voto no total" : "votos no total"}</div>
      )}
    </div>
  );
}
