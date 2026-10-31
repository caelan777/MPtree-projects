import { AddTile, AppTile } from "./AppTile";
import type { TvApp } from "../launcher";

type Props = {
  apps: TvApp[];
  dock: string[];
  onOpenApp: (a: TvApp) => void;
  onTogglePin: (a: TvApp) => void;
  onGetApps: () => void;
};

/** Every app on the TV, A to Z. OK opens one; holding OK puts it on Home or takes it off. */
export function AppsView({ apps, dock, onOpenApp, onTogglePin, onGetApps }: Props) {
  const sorted = [...apps].sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  return (
    <div className="page">
      <div className="lab">{apps.length} apps · hold OK to put one on Home</div>
      <div className="agrid">
        {sorted.map((a, i) => (
          <AppTile
            key={a.packageName}
            app={a}
            pinned={dock.includes(a.packageName)}
            isDefault={i === 0}
            onOpen={() => onOpenApp(a)}
            onLong={() => onTogglePin(a)}
          />
        ))}
        <AddTile label="Get apps" onOpen={onGetApps} />
      </div>
    </div>
  );
}
