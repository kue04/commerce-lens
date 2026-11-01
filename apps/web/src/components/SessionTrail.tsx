import { useState } from "react";
import { Check, ChevronDown, History } from "lucide-react";
import type { HistoryItem } from "../lib/types";

export function SessionTrail({
  history,
  reportId,
  sessionId,
  busy,
  onSelect,
}: {
  history: HistoryItem[];
  reportId: string;
  sessionId: string;
  busy: boolean;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const turns = history
    .filter((item) => item.sessionId === sessionId)
    .toReversed();
  const current = turns.findIndex((item) => item.reportId === reportId);
  if (turns.length < 2) return null;
  return (
    <section className="session-trail" aria-label="本次会话分析记录">
      <button
        className="session-toggle"
        aria-expanded={expanded}
        aria-controls="session-turns"
        onClick={() => setExpanded(!expanded)}
      >
        <History size={15} />
        <span>
          本次会话<span className="turn-count">{turns.length} 轮分析</span>
        </span>
        <span className="session-position">正在查看第 {current + 1} 轮</span>
        <ChevronDown size={14} />
      </button>
      {expanded && (
        <ol id="session-turns">
          {turns.map((turn, i) => (
            <li key={turn.reportId}>
              <button
                disabled={busy}
                aria-current={turn.reportId === reportId ? "step" : undefined}
                onClick={() => {
                  onSelect(turn.reportId);
                  setExpanded(false);
                }}
              >
                <span className="turn-index">{i + 1}</span>
                <span>{turn.question}</span>
                {turn.reportId === reportId && <Check size={14} />}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
