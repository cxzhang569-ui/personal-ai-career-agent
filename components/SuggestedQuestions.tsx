import { suggestedQuestions } from "@/config/profile";
import { Icon } from "./Icon";

export function SuggestedQuestions({ onSend, disabled }: { onSend: (question: string) => void; disabled: boolean }) {
  return <div className="suggestions">{suggestedQuestions.map((item) => <button key={item.label} className="suggestion" onClick={() => onSend(item.question)} disabled={disabled}>
    <Icon name={item.icon} /><span>{item.label}</span><Icon name="arrow" className="suggestion-arrow" />
  </button>)}</div>;
}
