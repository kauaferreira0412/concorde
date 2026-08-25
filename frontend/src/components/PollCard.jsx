import { votePoll } from "../ws/chatSocket";
import { CheckIcon } from "./icons.jsx";

export default function PollCard({ poll, channelId, myUserId, stompClient, stompConnected }) {
  const totalVotes = poll.options.reduce((sum, o) => sum + o.voterUserIds.length, 0);

  function toggleVote(optionId) {
    if (!stompConnected) return;
    votePoll(stompClient, channelId, poll.id, optionId);
  }

  return (
    <div className="poll-card">
      <div className="poll-card-question">
        📊 {poll.question}
        {poll.multipleChoice && <span className="poll-card-hint">escolha múltipla</span>}
      </div>
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
      <div className="poll-card-total">{totalVotes} {totalVotes === 1 ? "voto no total" : "votos no total"}</div>
    </div>
  );
}
