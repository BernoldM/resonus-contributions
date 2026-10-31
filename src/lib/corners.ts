/**
 * The two corner sliders of Settings › Appearance, as numbers from 0 to 100.
 *
 * Kept free of React Native so the rules can be tested.
 */

export interface RadiusScale {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  /** A sheet rising from the bottom, and anything else that owns the screen. */
  xxl: number;
  pill: number;
}

export const CORNERS_FULL = 100;
export const COVER_CORNERS_DEFAULT = 50;

const ROUND = { sm: 6, md: 10, lg: 16, xl: 24, xxl: 32 };
const FLAT = { sm: 4, md: 8, lg: 12, xl: 12, xxl: 12 };
/** Where the slider draws `FLAT`, the old Pointier. Saved Pointier moves here. */
const FLAT_AT = 80;

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** Sharp at 0, flatter up to 80, then up to the full ladder at 100. `pill` never moves. */
export function radiusAt(percent: number): RadiusScale {
  const step = (key: keyof typeof ROUND) =>
    Math.round(
      percent <= FLAT_AT
        ? lerp(0, FLAT[key], percent / FLAT_AT)
        : lerp(FLAT[key], ROUND[key], (percent - FLAT_AT) / (CORNERS_FULL - FLAT_AT)),
    );
  return { sm: step('sm'), md: step('md'), lg: step('lg'), xl: step('xl'), xxl: step('xxl'), pill: 999 };
}

/**
 * The corner of a cover of this size. 50 is the old Rounded and 100 the old
 * More rounded, on numbers of their own so that a sharp app can keep round
 * covers.
 */
export function coverRadiusAt(percent: number, size: number): number {
  const rounded = size <= 56 ? ROUND.sm : ROUND.md;
  const full = size <= 56 ? ROUND.md : size >= 240 ? ROUND.xl : ROUND.lg;
  return Math.round(percent <= 50 ? lerp(0, rounded, percent / 50) : lerp(rounded, full, (percent - 50) / 50));
}

const isPercent = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= CORNERS_FULL;

/** A saved value, or what the old `borderStyle` choice comes to. */
export function savedBorderRadius(saved: unknown, oldStyle: unknown): number {
  if (isPercent(saved)) return saved;
  return oldStyle === 'pointier' ? FLAT_AT : CORNERS_FULL;
}

/** A saved value, or what the old choice drew, which also followed `borderStyle`. */
export function savedCoverCorners(saved: unknown, oldStyle: unknown): number {
  if (isPercent(saved)) return saved;
  const flat = oldStyle === 'pointier';
  if (saved === 'square') return 0;
  if (saved === 'round') return flat ? 75 : CORNERS_FULL;
  return flat ? 40 : COVER_CORNERS_DEFAULT;
}
