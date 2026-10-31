import { homeOf } from "../home";
import type { LayoutId } from "../settings";
import { Classic } from "./layouts/Classic";
import { Editorial } from "./layouts/Editorial";
import { Cinema } from "./layouts/Cinema";
import { Sky } from "./layouts/Sky";
import { DayLine } from "./layouts/DayLine";
import type { LayoutProps } from "./layouts/parts";

type Props = Omit<LayoutProps, "home"> & { layout: LayoutId; toast: (m: string) => void };

/** Home, in whichever of the five layouts is chosen. They all show the same
 *  things and use the same buttons (src/home.ts); only the arrangement differs. */
export function HomeView({ layout, toast, ...rest }: Props) {
  const p: LayoutProps = { ...rest, home: homeOf(rest.ha, toast) };
  switch (layout) {
    case "editorial": return <Editorial {...p} />;
    case "cinema": return <Cinema {...p} />;
    case "sky": return <Sky {...p} />;
    case "dayline": return <DayLine {...p} />;
    default: return <Classic {...p} />;
  }
}
