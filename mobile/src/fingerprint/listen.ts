import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
  type AudioStreamBuffer,
} from 'expo-audio';
import { SAMPLE_RATE, type Reference } from '@reviewies/core/fingerprint/fingerprint';
import { SpectrogramStream } from '@reviewies/core/fingerprint/stream';
import {
  ContinuousMatcher,
  positionNow,
  shouldCorrect,
  type ContinuousMatch,
} from '@reviewies/core/fingerprint/continuous';
import { fetchReference } from '@reviewies/core/fingerprint/references';

/**
 * Listening for as long as an episode runs.
 *
 * This is the reason the pivot to a real app was worth making. On the web the same
 * feature could only ever be a button: a tab that loses focus loses its audio graph,
 * so the honest design was one six-second capture followed by forty minutes of
 * dead-reckoning. A phone can hold an audio session open in the background, so the
 * clock can be corrected every few seconds instead — which is what makes it survive a
 * pause, an ad break, or someone skipping the recap.
 *
 * The privacy shape is unchanged and non-negotiable, and running for longer makes
 * saying so more important rather than less:
 *
 *  - audio is analysed in memory and thrown away frame by frame; nothing is recorded,
 *    written to disk, or uploaded;
 *  - only the position it derives is used, and only inside this screen;
 *  - it starts on an explicit tap and stops when the screen closes, when playback is
 *    paused, or when the user says so — never on its own.
 */

export type ListenState =
  | 'unsupported'
  | 'idle'
  | 'no-reference'
  | 'denied'
  | 'listening'
  | 'failed';

export interface ListenSync {
  state: ListenState;
  /** Human-readable detail for whatever state it is in. */
  note?: string;
  /** The most recent accepted match, for showing how sure it is. */
  lastMatch?: ContinuousMatch;
  /** How many attempts have found nothing since the last success. */
  misses: number;
  start: () => Promise<void>;
  stop: () => void;
}

export interface ListenSyncOptions {
  targetId: string;
  /** The clock's current reading, so a match that already agrees costs nothing. */
  positionMs: number;
  /** Called only when a correction is actually worth applying. */
  onCorrection: (positionMs: number, confidence: number) => void;
}

export function useListenSync({
  targetId,
  positionMs,
  onCorrection,
}: ListenSyncOptions): ListenSync {
  const [state, setState] = useState<ListenState>('idle');
  const [note, setNote] = useState<string>();
  const [lastMatch, setLastMatch] = useState<ContinuousMatch>();
  const [misses, setMisses] = useState(0);

  // Everything the buffer callback reads lives in a ref. It fires dozens of times a
  // second from native code and must never depend on a re-render having happened.
  const streamRef = useRef<SpectrogramStream | undefined>(undefined);
  const matcherRef = useRef<ContinuousMatcher | undefined>(undefined);
  const positionRef = useRef(positionMs);
  /** Whether a position has been applied since listening started. */
  const correctedRef = useRef(false);
  const correctionRef = useRef(onCorrection);
  positionRef.current = positionMs;
  correctionRef.current = onCorrection;

  const onBuffer = useCallback((buffer: AudioStreamBuffer) => {
    const matcher = matcherRef.current;
    if (!matcher) return;

    // The hardware decides the rate, not us — asking for 22050 is a request, and
    // phones routinely answer 48000. Rebuild the pipeline if it ever changes rather
    // than analysing at a rate the reference was not built at, which would not fail
    // loudly, it would simply never match again.
    if (!streamRef.current || streamRef.current.sourceRate !== buffer.sampleRate) {
      streamRef.current = new SpectrogramStream({
        sourceRate: buffer.sampleRate,
        channels: buffer.channels,
      });
      // The frames already in the window were analysed at the old rate, which means
      // their bins stand for different frequencies. Keeping them would mix two
      // incompatible spectrograms into one match.
      matcher.reset();
    }
    const stream = streamRef.current;

    const match = matcher.push(stream.push(new Float32Array(buffer.data)));
    if (!match) return;

    // Age the match to the last frame in this buffer. An attempt fires part-way
    // through a buffer, and the frames after it in the same buffer are audio that has
    // already played — applying the raw position would set the clock slightly slow
    // every single time, which is a drift correction that introduces drift.
    const now = positionNow(match, matcher.frameCount - 1);

    // The first match after starting is not a correction, it is the sync — there is
    // nothing yet for it to agree or disagree with. Gating it on `shouldCorrect` would
    // mean that starting to listen forty minutes into an episode, which is exactly when
    // someone reaches for this, gets refused as too large a jump.
    if (!correctedRef.current) {
      correctedRef.current = true;
      correctionRef.current(now, match.confidence);
      return;
    }

    if (shouldCorrect(positionRef.current, now)) correctionRef.current(now, match.confidence);
  }, []);

  // Ask for the analysis rate and mono directly: when the hardware agrees, the
  // resampler and the downmix both become no-ops and the phone does less work.
  const { stream } = useAudioStream({
    sampleRate: SAMPLE_RATE,
    channels: 1,
    encoding: 'float32',
    onBuffer,
  });

  const available = !!stream;

  const stop = useCallback(() => {
    matcherRef.current = undefined;
    streamRef.current = undefined;
    try {
      stream?.stop();
    } catch {
      // Already stopped, or the screen is unmounting. Nothing useful to do.
    }
    // Hand the audio session back. Leaving `allowsRecording` on keeps iOS routing
    // audio as though something were still listening, which is both wrong and rude.
    void setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false }).catch(
      () => {},
    );
    setState((current) => (current === 'listening' ? 'idle' : current));
  }, [stream]);

  const start = useCallback(async () => {
    if (!stream) {
      setState('unsupported');
      setNote('Listening needs the app rather than the browser.');
      return;
    }

    setNote(undefined);
    setMisses(0);
    correctedRef.current = false;

    let reference: Reference;
    try {
      const stored = await fetchReference(targetId);
      if (!stored) {
        setState('no-reference');
        setNote('Nobody has mapped this episode yet. Sync by hand and you can contribute one.');
        return;
      }
      reference = stored.reference;
    } catch {
      setState('failed');
      setNote('Could not fetch this episode’s timeline.');
      return;
    }

    const existing = await getRecordingPermissionsAsync();
    const granted = existing.granted ? existing : await requestRecordingPermissionsAsync();
    if (!granted.granted) {
      setState('denied');
      setNote('Listening needs the microphone. You can turn it on in Settings.');
      return;
    }

    try {
      await setAudioModeAsync({
        allowsRecording: true,
        // The point of the whole task: the session survives the app going to the
        // background, so the clock keeps being corrected while the phone is face down.
        shouldPlayInBackground: true,
        playsInSilentMode: true,
        // Never take audio focus. Whatever is playing the episode — the television, or
        // this phone — must not be ducked or paused by something that is only listening.
        interruptionMode: 'mixWithOthers',
      });

      matcherRef.current = new ContinuousMatcher({
        reference,
        // Reporting only. Whether to act on a match is decided once the whole buffer
        // has been consumed, so that the position can be aged to the end of it.
        onMatch: (match) => {
          setMisses(0);
          setLastMatch(match);
        },
        onMiss: () => setMisses((n) => n + 1),
      });
      streamRef.current = undefined;
      await stream.start();
      setState('listening');
    } catch (err) {
      matcherRef.current = undefined;
      setState('failed');
      setNote(err instanceof Error ? err.message : 'Could not start listening.');
    }
  }, [stream, targetId]);

  // Never outlive the screen. A microphone left running after navigating away is the
  // single worst thing this feature could do.
  useEffect(() => stop, [stop]);

  return {
    state: available ? state : 'unsupported',
    note,
    lastMatch,
    misses,
    start,
    stop,
  };
}
