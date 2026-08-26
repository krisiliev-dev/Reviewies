/**
 * Deciding whether two contributions describe the same audio.
 *
 * A reference is promoted once enough people agree, and what "agree" means is the whole
 * of the trust model. The first version compared frame counts within two percent and
 * never looked at the audio at all, which the code said out loud and which was
 * defensible while contributions were thirty-second fragments hashed in a browser. It
 * is not defensible now. Two episodes of the same show are usually the same length, so
 * a person who maps the wrong episode gets agreement from everyone who maps the right
 * one, and the reference that wins is whichever was uploaded first.
 *
 * That is not an attack. It is one honest mistake permanently breaking an episode for
 * everyone, and the wrong answer it produces looks exactly like a right one: reactions
 * appear, confidently, at the wrong moments.
 *
 * Since contributions now carry episode-absolute frames, there is a much stronger test
 * available for the same code that already does matching. Locate one contribution
 * inside the other. Audio from the same episode shares landmarks and lands at an offset
 * near zero; audio from anywhere else shares nothing and produces no confident match at
 * all.
 *
 * This lives in the core, and runs on the server, because RLS deliberately stops any
 * client from reading someone else's raw contribution — an unvalidated timeline is
 * exactly what a malicious client would want in order to forge agreement.
 */

import {
  buildReference,
  deserialiseReference,
  matchSample,
  unpackHashes,
  type Hash,
} from './fingerprint.ts';

export interface Contribution {
  /** Whatever identifies it to the caller — a row id, a user id. Never interpreted. */
  id: string;
  /** Packed (hash, frame) pairs, frames in episode time. */
  hashes: Uint32Array;
  /** Where the contribution ends in the episode, in frames. */
  frameCount: number;
  hopSize: number;
  sampleRate: number;
}

export type DisagreementReason =
  | 'different-analysis'
  | 'no-overlap'
  | 'too-short'
  | 'weak-match'
  | 'mistimed'
  | 'empty';

export interface Agreement {
  agrees: boolean;
  reason?: DisagreementReason;
  /** How far the other sits from the candidate. Near zero when both are well synced. */
  offsetFrames?: number;
  confidence?: number;
  score?: number;
}

export interface AgreementOptions {
  /**
   * How far apart two well-meaning contributors' clocks may be, in milliseconds.
   *
   * Both hand-synced by pressing a button when the episode started, so a second or two
   * of disagreement is ordinary. Five is generous. Beyond that the two are not
   * describing the same timeline even if they are describing the same audio — and
   * crucially there is no way to tell from here *which* of them is wrong, so the
   * honest answer is to refuse rather than to average or to prefer one.
   */
  toleranceMs?: number;
  /** How sure the match must be. Above the matcher's own floor. */
  minConfidence?: number;
  /** How many landmarks must agree, so a tiny overlap cannot carry a vote. */
  minScore?: number;
  /**
   * How much of the episode two contributions must both cover to be comparable.
   *
   * A few seconds in common is not corroboration, it is a coincidence with a small
   * sample size — and two people who each mapped a different half of an episode have
   * not checked each other's work at all.
   */
  minOverlapMs?: number;
}

const DEFAULTS = {
  toleranceMs: 5_000,
  minConfidence: 0.3,
  minScore: 40,
  minOverlapMs: 15_000,
} as const;

/** The stretch of the episode a contribution covers, read from its own frame stamps. */
function span(hashes: Uint32Array): { start: number; end: number } {
  let start = Infinity;
  let end = -Infinity;
  for (let i = 1; i < hashes.length; i += 2) {
    if (hashes[i] < start) start = hashes[i];
    if (hashes[i] > end) end = hashes[i];
  }
  return { start, end };
}

/** The hashes falling inside a window, as a sample. */
function within(hashes: Uint32Array, from: number, to: number): Hash[] {
  const kept: Hash[] = [];
  for (let i = 0; i + 1 < hashes.length; i += 2) {
    const frame = hashes[i + 1];
    if (frame >= from && frame <= to) kept.push({ hash: hashes[i], frame });
  }
  return kept;
}

/**
 * Does `other` describe the same audio, at the same times, as `candidate`?
 *
 * Deliberately not symmetric in cost — `candidate` is turned into a reference and
 * `other` is looked up in it — but the verdict is symmetric in practice, because the
 * landmarks shared between two recordings do not depend on which way round they are
 * compared.
 */
export function agreesWith(
  candidate: Contribution,
  other: Contribution,
  options: AgreementOptions = {},
): Agreement {
  const toleranceMs = options.toleranceMs ?? DEFAULTS.toleranceMs;
  const minConfidence = options.minConfidence ?? DEFAULTS.minConfidence;
  const minScore = options.minScore ?? DEFAULTS.minScore;
  const minOverlapMs = options.minOverlapMs ?? DEFAULTS.minOverlapMs;

  if (candidate.hashes.length === 0 || other.hashes.length === 0) {
    return { agrees: false, reason: 'empty' };
  }

  // Analysis parameters are part of the fingerprint, not metadata about it. Two
  // contributions taken at different rates share no landmarks whatsoever, and treating
  // that as disagreement about content would be a misdiagnosis.
  if (candidate.hopSize !== other.hopSize || candidate.sampleRate !== other.sampleRate) {
    return { agrees: false, reason: 'different-analysis' };
  }

  const framesPerSecond = candidate.sampleRate / candidate.hopSize;
  const toleranceFrames = Math.max(1, Math.round((toleranceMs / 1000) * framesPerSecond));

  // First pass over everything, to find where the two sit relative to each other. The
  // confidence bar is deliberately not applied here: this pass answers "where", and the
  // answer to "how convincingly" cannot be trusted until the comparison is fair.
  const placement = matchSample(
    unpackHashes(other.hashes),
    deserialiseReference(candidate.hashes),
    { minScore, minConfidence: 0 },
  );

  // Nothing shared at all: a different episode, a different dub, or a recording of a
  // room with the television off.
  if (!placement) return { agrees: false, reason: 'no-overlap' };

  if (Math.abs(placement.offsetFrames) > toleranceFrames) {
    // Same audio, different idea of where it starts. Refusing is the point: one of
    // these two mis-synced their clock, and nothing here can say which.
    return {
      agrees: false,
      reason: 'mistimed',
      offsetFrames: placement.offsetFrames,
      confidence: placement.confidence,
      score: placement.score,
    };
  }

  // Second pass over only the stretch both actually cover, in both directions.
  //
  // Restricting to the shared window is what stops two people who mapped different
  // halves of an episode from corroborating each other: they may both be right, but
  // neither has checked the other's work.
  //
  // Running it both ways is what makes the verdict symmetric, and agreement had better
  // be a symmetric relation — `chooseReference` compares every pair and would otherwise
  // return different winners depending on iteration order. Confidence is the share of
  // *matched* landmarks agreeing on one offset, so it falls when the reference side is
  // the noisier recording: its spurious landmarks give the other's hashes somewhere
  // meaningless to land, inflating the denominator without touching the numerator. Two
  // recordings of the same audio measure 0.46 one way and 0.17 the other for no reason
  // except which microphone was worse. The score is identical in both directions —
  // 2081 either way — because the landmarks two recordings share do not depend on which
  // is asked about first, and that is the quantity worth reporting.
  const candidateSpan = span(candidate.hashes);
  const otherSpan = span(other.hashes);
  const from = Math.max(candidateSpan.start, otherSpan.start);
  const to = Math.min(candidateSpan.end, otherSpan.end);

  if (to - from < (minOverlapMs / 1000) * framesPerSecond) {
    return { agrees: false, reason: 'too-short', offsetFrames: placement.offsetFrames };
  }

  const candidateWindow = within(candidate.hashes, from, to);
  const otherWindow = within(other.hashes, from, to);
  const bar = { minScore, minConfidence };

  const forward = matchSample(otherWindow, buildReference(candidateWindow), bar);
  const reverse = matchSample(candidateWindow, buildReference(otherWindow), bar);
  const best = (forward?.confidence ?? 0) >= (reverse?.confidence ?? 0) ? forward : reverse;

  if (!best) {
    return {
      agrees: false,
      reason: 'weak-match',
      offsetFrames: placement.offsetFrames,
      confidence: placement.confidence,
      score: placement.score,
    };
  }

  return {
    agrees: true,
    // Reported from the candidate's point of view whichever direction won, so a caller
    // reading "the other is 3 frames ahead" always means ahead of the candidate.
    offsetFrames: best === forward ? best.offsetFrames : -best.offsetFrames,
    confidence: best.confidence,
    score: best.score,
  };
}

export interface Promotion {
  chosen: Contribution;
  /** Contributions that agreed, including the candidate itself. */
  agreement: number;
  /** Ids of the contributions that agreed with the chosen one. */
  supporters: string[];
}

/**
 * Pick the contribution the most others agree with.
 *
 * Most-agreed rather than earliest. Taking the earliest and counting votes for it means
 * a single early mistake owns the episode forever, and every later correct contribution
 * either fails to help or, worse, votes for the wrong one. Scoring every contribution
 * by how many others corroborate it makes the majority win instead, which is what
 * "enough people agree" was always supposed to mean.
 *
 * O(n²) matches, which is fine: an episode has a handful of contributions, not
 * thousands, and this runs once when one arrives rather than on every playback.
 */
export function chooseReference(
  contributions: Contribution[],
  options: AgreementOptions & { required?: number } = {},
): Promotion | undefined {
  const required = options.required ?? 2;
  if (contributions.length < required) return undefined;

  let best: Promotion | undefined;

  for (const candidate of contributions) {
    const supporters: string[] = [];
    for (const other of contributions) {
      if (other.id === candidate.id) continue;
      if (agreesWith(candidate, other, options).agrees) supporters.push(other.id);
    }

    // The candidate counts for itself; `required` is a number of people, not seconds.
    const agreement = supporters.length + 1;
    if (agreement < required) continue;

    // Ties go to the longer contribution: given equal support, the one that covers more
    // of the episode is more useful, and a fragment agreeing with a fragment is the
    // weakest evidence available.
    if (
      !best ||
      agreement > best.agreement ||
      (agreement === best.agreement && candidate.frameCount > best.chosen.frameCount)
    ) {
      best = { chosen: candidate, agreement, supporters };
    }
  }

  return best;
}
