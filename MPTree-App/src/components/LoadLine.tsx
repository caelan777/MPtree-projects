import type { T } from "../themes";

/** A thin line that runs along the top of a full-screen page while it waits
 *  on the account or Google Play: signing in, taking a device off, Pro. It
 *  sits just under the status bar and takes no taps. */
export function LoadLine({ on, T }: { on: boolean; T: T }) {
  if (!on) return null;
  return (
    <div aria-hidden="true" style={{
      position: "absolute", left: 0, right: 0, top: "env(safe-area-inset-top, 0px)", height: 3,
      overflow: "hidden", pointerEvents: "none", zIndex: 2,
    }}>
      <style>{`
        @keyframes mpLoadLine { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
        @media (prefers-reduced-motion: reduce) { .mp-load-line { animation-duration: 3s !important; } }
      `}</style>
      <div className="mp-load-line" style={{
        width: "40%", height: "100%", background: T.text, borderRadius: 2,
        animation: "mpLoadLine 1.1s cubic-bezier(0.45, 0, 0.55, 1) infinite",
      }} />
    </div>
  );
}
