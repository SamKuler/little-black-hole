// A finished round stops simulation, not the final interval of already
// authoritative motion. Let bodies and apertures reach that endpoint together
// before completed props are hidden. Paused/lobby views remain fixed.
export function snapshotFraction(phase, age, interval) {
  if (phase !== 'playing' && phase !== 'finished') return 1;
  return Math.max(0, Math.min(1, age / interval));
}
