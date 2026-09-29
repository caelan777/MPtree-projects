import { gold, type T } from "../themes";

/** A sentence with the word Pro in gold. `on` is the colour it sits on, when
 *  that is not the page (a button in the accent colour, say), so the gold is
 *  the bright one on dark and the deep one on light. */
export function GoldPro({ text, T, on }: { text: string; T: T; on?: string }) {
  const G = gold(on ? { ...T, bg: on } : T);
  return (
    <>
      {text.split(/\b(Pro)\b/).map((part, i) => part === "Pro"
        // backgroundImage, not background: React rewriting the shorthand
        // would reset the clip and paint a solid block.
        ? <span key={i} style={{ backgroundImage: G.textFill, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: G.text }}>Pro</span>
        : part)}
    </>
  );
}
