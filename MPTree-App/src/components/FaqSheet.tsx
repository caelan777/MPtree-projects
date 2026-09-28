import { useState } from "react";
import type { T } from "../themes";
import { t } from "../i18n";
import { InfoSheet } from "./InfoSheet";
import { IC } from "./Icons";

// The questions people actually send, answered in the app so the answer is
// there without a connection. Keep every answer true to what the code does:
// each one names the real place in the app, and if that place moves, the
// answer moves with it.
const FAQ: { q: string; a: string }[] = [
  {
    q: "Where does MPTree get my music from?",
    a: "From the music files already on your phone. It reads the list Android keeps of every audio file, so songs you downloaded, copied over or recorded into your music folder all show up. Nothing is streamed and nothing is uploaded.",
  },
  {
    q: "A song is missing. Why?",
    a: "Android only lists a file as music when it is marked as music. Voice notes, ringtones and some audio saved by chat apps are not. Try moving the file into your Music folder, then pull down on the song list to scan again.",
  },
  {
    q: "What is \"Removed songs\"?",
    a: "Removing a song hides it from MPTree and leaves the file alone. It waits in Settings > Removed songs, where you can put it back or, if you are sure, delete the file from your phone for good.",
  },
  {
    q: "How do I back up my playlists and likes?",
    a: "Settings > Export backup. It saves a folder in Downloads with your playlists, likes, names and photos. On a new phone, copy that folder over and use Settings > Restore backup.",
  },
  {
    q: "Does MPTree need the internet?",
    a: "No. It plays what is on your phone and works in flight mode. The only thing it ever looks up is whether a newer version is out, and you can turn that off in Settings.",
  },
  {
    q: "Can my music keep playing while I watch videos in another app?",
    a: "Yes. Settings > Audio > Play alongside other apps. With it on, another app making sound no longer pauses MPTree.",
  },
  {
    q: "Can I move the round logo button?",
    a: "Yes. When the header is folded away, hold the logo and drag it wherever you like. Drop it on the cross at the bottom, or near the top left, to put it back.",
  },
  {
    q: "Something is wrong, or I have an idea.",
    a: "Settings > Send feedback opens an email to the person who makes MPTree. It already says which version and phone you have, so you only need to say what happened.",
  },
];

export function FaqSheet({ onClose, T }: { onClose: () => void; T: T }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <InfoSheet title={t("Questions")} onClose={onClose} T={T}>
      {FAQ.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={i} style={{ borderBottom: i < FAQ.length - 1 ? `1px solid ${T.border}` : "none" }}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                background: "transparent", border: "none", padding: "15px 2px", cursor: "pointer",
                color: T.text, fontSize: 15, fontWeight: 600, fontFamily: "inherit",
              }}
            >
              <span style={{ flex: 1 }}>{t(f.q)}</span>
              <span style={{ display: "flex", color: T.muted, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                <IC.Chevron />
              </span>
            </button>
            {isOpen && (
              <p style={{ margin: "0 2px 16px", color: T.textSub, fontSize: 14, lineHeight: 1.6, animation: "mpFadeIn 0.18s ease both" }}>
                {t(f.a)}
              </p>
            )}
          </div>
        );
      })}
    </InfoSheet>
  );
}
