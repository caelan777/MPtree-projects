
import type { LayoutId } from "../settings";
import { homeOf } from "../home";
import type { HaExtras } from "../ha";
import { Classic } from "./layouts/Classic";
import { Editorial } from "./layouts/Editorial";
import { Cinema } from "./layouts/Cinema";
import { Sky } from "./layouts/Sky";
import { DayLine } from "./layouts/DayLine";
import type { LayoutProps } from "./layouts/parts";

type Props = Omit<LayoutProps, "home"> & {
  layout: LayoutId; toast: (m: string) => void; extras: HaExtras; haUrl: string;
  /** Home Assistant switched off in Settings. */
  haOff: boolean;
  /** When MPTree is on this TV, Shuffle music starts it, shuffling all songs. */
  mptreeShuffle: (() => void) | null;
};

/** Home, in whichever of the five layouts is chosen. They all show the same
 *  things and use the same buttons (src/home.ts); only the arrangement differs. */
export function HomeView({ layout, toast, extras, haUrl, haOff, mptreeShuffle, ...rest }: Props) {
  const home = homeOf(rest.ha, extras, rest.now, toast, haUrl, haOff);
  if (mptreeShuffle) {
    home.shuffleName = "MPTree";
    home.shuffleWhere = "MPTree, on this TV";
    home.shuffleMusic = async () => mptreeShuffle();
  }
  const p: LayoutProps = { ...rest, home };
  switch (layout) {
    case "editorial": return <Editorial {...p} />;
    case "cinema": return <Cinema {...p} />;
    case "sky": return <Sky {...p} />;
    case "dayline": return <DayLine {...p} />;
    default: return <Classic {...p} />;
  }
}
