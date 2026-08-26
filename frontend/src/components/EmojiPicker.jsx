import { useState } from "react";
import { EMOJI_CATEGORIES } from "../utils/emojiData";

/**
 * Picker de emoji com categorias de verdade (Pessoas, Natureza, Alimentos, Atividades, Viagem,
 * Objetos, Símbolos, Bandeiras) - antes o Concorde só tinha 32 emojis fixos numa gradinha só,
 * o Discord tem centenas divididos em categoria (pedido explicito do usuario, com print
 * comparando os dois). Emojis customizados do SERVIDOR (ver CustomEmojiModal.jsx) entram como
 * uma categoria a mais, só quando o servidor tem pelo menos um.
 */
export default function EmojiPicker({ customEmojis = [], onPick }) {
  const hasCustom = customEmojis.length > 0;
  const [activeKey, setActiveKey] = useState(hasCustom ? "servidor" : EMOJI_CATEGORIES[0].key);

  const activeCustom = activeKey === "servidor";
  const activeCategory = EMOJI_CATEGORIES.find((c) => c.key === activeKey);

  return (
    <div className="emoji-picker">
      <div className="emoji-picker-tabs">
        {hasCustom && (
          <button
            type="button"
            className={"emoji-picker-tab" + (activeCustom ? " active" : "")}
            onClick={() => setActiveKey("servidor")}
            title="Emojis do servidor"
          >
            {customEmojis[0].imageUrl ? (
              <img src={customEmojis[0].imageUrl} alt="" className="emoji-picker-tab-custom" />
            ) : (
              "🙂"
            )}
          </button>
        )}
        {EMOJI_CATEGORIES.map((cat) => (
          <button
            type="button"
            key={cat.key}
            className={"emoji-picker-tab" + (activeKey === cat.key ? " active" : "")}
            onClick={() => setActiveKey(cat.key)}
            title={cat.label}
          >
            {cat.icon}
          </button>
        ))}
      </div>
      <p className="emoji-picker-category-label">{activeCustom ? "Servidor" : activeCategory?.label}</p>
      <div className="emoji-picker-grid">
        {activeCustom
          ? customEmojis.map((e) => (
              <button type="button" key={e.id} title={`:${e.name}:`} onClick={() => onPick(`:${e.name}:`)}>
                <img src={e.imageUrl} alt={e.name} className="chat-custom-emoji" />
              </button>
            ))
          : activeCategory?.emojis.map((emoji, i) => (
              <button type="button" key={emoji + i} onClick={() => onPick(emoji)}>
                {emoji}
              </button>
            ))}
      </div>
    </div>
  );
}
