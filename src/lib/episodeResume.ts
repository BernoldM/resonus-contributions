/** Closer to either end than this, an episode starts over. */
const START_SEC = 5;
const END_SEC = 30;

/** The second to pick an episode up at, given where it was left. */
export function episodeResumeAt(positionSec: number, durationSec: number): number {
  if (positionSec < START_SEC) return 0;
  if (durationSec > 0 && positionSec >= durationSec - END_SEC) return 0;
  return positionSec;
}
