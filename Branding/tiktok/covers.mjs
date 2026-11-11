/* Record sleeves for the demo library, one per invented album.
 *
 * The screenshots give three songs a photo and leave the rest on the grey
 * note. A still can carry that. A video scrolls past forty grey squares, and
 * a library where nothing has a cover reads as "this app cannot find my
 * artwork". So in the recordings every album has its sleeve, the way files
 * ripped with their art look.
 *
 * The first three are the sleeves MPTree-App/scripts/shot-props/make-covers.mjs
 * draws, so the same songs look the same everywhere. The other five are new, in
 * the same manner: geometric, restrained, readable at 48px in a row.
 *
 * All invented. None of them depicts a real record. They stay clear of violet,
 * sky and rose, which in this app mean shuffle, repeat and liked.
 */
export const SLEEVES = {
  // Kite Season, "Paper Weather"
  "Paper Weather": `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
     <rect width="512" height="512" fill="#e8e2d6"/>
     <path d="M256 78 L400 300 L256 434 L112 300 Z" fill="none" stroke="#1b1b1b" stroke-width="14"/>
     <line x1="256" y1="78" x2="256" y2="434" stroke="#1b1b1b" stroke-width="14"/>
     <rect x="0" y="452" width="512" height="60" fill="#1b1b1b"/>
   </svg>`,
  // The Halogens, "Slow Signal"
  "Slow Signal": `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
     <rect width="512" height="512" fill="#101826"/>
     <g fill="#f2b544">
       <rect x="64" y="150" width="384" height="18"/>
       <rect x="64" y="212" width="300" height="18"/>
       <rect x="64" y="274" width="216" height="18"/>
       <rect x="64" y="336" width="132" height="18"/>
     </g>
     <circle cx="404" cy="380" r="46" fill="none" stroke="#f2b544" stroke-width="16"/>
   </svg>`,
  // Marrow, "Static Bloom"
  "Static Bloom": `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
     <rect width="512" height="512" fill="#0d0d0d"/>
     <circle cx="256" cy="248" r="150" fill="#f5f3ee"/>
     <circle cx="316" cy="212" r="150" fill="#0d0d0d"/>
     <rect x="96" y="430" width="320" height="10" fill="#f5f3ee"/>
   </svg>`,
  // Nine Lanterns, "Ghost Frequency": nine lamps, one of them lit
  "Ghost Frequency": `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
     <rect width="512" height="512" fill="#12302b"/>
     <g fill="none" stroke="#cfe3d9" stroke-width="10">
       <circle cx="136" cy="136" r="40"/><circle cx="256" cy="136" r="40"/><circle cx="376" cy="136" r="40"/>
       <circle cx="136" cy="256" r="40"/><circle cx="376" cy="256" r="40"/>
       <circle cx="136" cy="376" r="40"/><circle cx="256" cy="376" r="40"/><circle cx="376" cy="376" r="40"/>
     </g>
     <circle cx="256" cy="256" r="45" fill="#f4c542"/>
   </svg>`,
  // Ada Vane, "Low Tide": the lines the water leaves on a wall
  "Low Tide": `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
     <rect width="512" height="512" fill="#c9d3d6"/>
     <rect x="0" y="300" width="512" height="212" fill="#2c3e46"/>
     <g fill="#2c3e46">
       <rect x="0" y="222" width="512" height="12"/>
       <rect x="0" y="176" width="512" height="6"/>
       <rect x="0" y="142" width="512" height="3"/>
     </g>
     <circle cx="120" cy="84" r="30" fill="#2c3e46"/>
   </svg>`,
  // Post Meridiem, "Sunday Machine": the afternoon going down
  "Sunday Machine": `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
     <rect width="512" height="512" fill="#efe6d4"/>
     <path d="M96 330 A160 160 0 0 1 416 330 Z" fill="#d9572b"/>
     <rect x="56" y="330" width="400" height="22" fill="#1b1b1b"/>
     <rect x="56" y="378" width="400" height="8" fill="#1b1b1b"/>
     <rect x="56" y="410" width="400" height="4" fill="#1b1b1b"/>
   </svg>`,
  // Fenwick Drive, "Nightjar": a wing, and one star
  "Nightjar": `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
     <rect width="512" height="512" fill="#0b1633"/>
     <path d="M86 300 L256 196 L426 300" fill="none" stroke="#e9e4d8" stroke-width="22" stroke-linejoin="miter"/>
     <path d="M146 360 L256 292 L366 360" fill="none" stroke="#e9e4d8" stroke-width="10"/>
     <circle cx="392" cy="112" r="10" fill="#e9e4d8"/>
   </svg>`,
  // Salt House, "Tidewater": one wave and a buoy
  "Tidewater": `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
     <rect width="512" height="512" fill="#f3f1ec"/>
     <path d="M0 282 C 86 222, 170 222, 256 282 S 426 342, 512 282 L512 512 L0 512 Z" fill="#17365d"/>
     <rect x="360" y="136" width="44" height="44" fill="#c8372d"/>
   </svg>`,
};
