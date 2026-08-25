import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
  type AudioStreamBuffer,
} from 'expo-audio';
import { HOP_SIZE, SAMPLE_RATE, type Reference } from '@reviewies/core/fingerprint/fingerprint';
import { SpectrogramStream } from '@reviewies/core/fingerprint/stream';
import {
  ContinuousMatcher,
  framesForMs,
  positionNow,
  shouldCorrect,
  type ContinuousMatch,
} from '@reviewies/core/fingerprint/continuous';
import { ContributionRecorder } from '@reviewies/core/fingerprint/contribute';
import { contributeReference, fetchReference } from '@reviewies/core/fingerprint/references';

/**
 * The microphone, and the two things worth doing with it.
 *
 * **Listening** is the reason the pivot to a real app was worth making. On the web the
 * same feature could only ever be a button: a tab that loses focus loses its audio
 * graph, so the honest design was one six-second capture followed by forty minutes of
 * dead-reckoning. A phone can hold an audio session open in the background, so the
 * clock corrects itself every few seconds instead — which is what makes it survive a
 * pause, an ad break, or someone skipping the recap.
 *
 * **Mapping** is what makes listening possible at all. An episode nobody has mapped
 * cannot be listened to, so without a way to contribute from the phone the feature is
 * inert for everything except the handful of episodes someone mapped on a laptop. The
 * phone is also the better place to do it: it can record a whole episode rather than
 * thirty seconds, because the hashing happens as the audio arrives and almost nothing
 * is held.
 *
 * They share one hook because they share one microphone, and running both at once is
 * neither possible nor meaningful.
 *
 * The privacy shape is the same for both, and running for longer makes saying so more
 * important rather than less:
 *
 *  - audio is analysed in memory and thrown away frame by frame; nothing is recorded,
 *    written to disk, or uploaded;
 *  - what a contribution uploads is landmark hashes, which are one-way digests — there
 *    is no audio in them and none can be recovered from them;
 *  - it starts on an explicit tap and stops when the screen closes or the user says so,
 *    never on its own.
 */

export type ListenState =
  | 'unsupported'
  | 'idle'
  | 'no-reference'
  | 'denied'
  | 'listening'
  | 'mapping'
  | 'uploading'
  | 'failed';

export interface MappingProgress {
  seconds: number;
  landmarks: number;
}

export interface ListenSync {
  state: ListenState;
  /** Human-readable detail for whatever state it is in. */
  note?: string;
  /** The most recent accepted match, for showing how sure it is. */
  lastMatch?: ContinuousMatch;
  /** Attempts that have found nothing since the last success. */
  misses: number;
  /** How the recording is going, while mapping. */
  mapping?: MappingProgress;
  startListening: () => Promise<void>;
  startMapping: () => Promise<void>;
  stop: () => void;
}

export interface ListenSyncOptions {
  targetId: string;
  /** The clock's current reading — the position a match is compared against, and
   *  where a contribution says it begins. */
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
  const [mapping, setMapping] = useState<MappingProgress>();

  // Everything the buffer callback reads lives in a ref. It fires dozens of times a
  // second from native code and must never depend on a re-render having happened.
  const streamRef = useRef<SpectrogramStream | undefined>(undefined);
  const matcherRef = useRef<ContinuousMatcher | undefined>(undefined);
  const recorderRef = useRef<ContributionRecorder | undefined>(undefined);
  const positionRef = useRef(positionMs);
  const correctionRef = useRef(onCorrection);
  /** Whether a position has been applied since listening started. */
  const correctedRef = useRef(false);
  positionRef.current = positionMs;
  correctionRef.current = onCorrection;

  const onBuffer = useCallback((buffer: AudioStreamBuffer) => {
    const matcher = matcherRef.current;
    const recorder = recorderRef.current;
    if (!matcher && !recorder) return;

    // The hardware decides the rate, not us — asking for 22050 is a request, and
    // phones routinely answer 48000. Rebuild the pipeline if it ever changes rather
    // than analysing at a rate the reference was not built at, which would not fail
    // loudly, it would simply never match again.
    if (!streamRef.current || streamRef.current.sourceRate !== buffer.sampleRate) {
      streamRef.current = new SpectrogramStream({
        sourceRate: buffer.sampleRate,
        channels: buffer.channels,
      });
      // Frames already accumulated were analysed at the old rate, so their bins stand
      // for different frequencies. Keeping them would mix two incompatible
      // spectrograms — harmless-looking, and wrong.
      matcher?.reset();
      recorder?.reset();
    }

    const frames = streamRef.current.push(new Float32Array(buffer.data));
    if (frames.length === 0) return;

    if (recorder) {
      recorder.push(frames);
      return;
    }
    if (!matcher) return;

    const match = matcher.push(frames);
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

  /** Give the audio session back. Leaving `allowsRecording` on keeps iOS routing audio
   *  as though something were still listening, which is both wrong and rude. */
  const release = useCallback(() => {
    try {
      stream?.stop();
    } catch {
      // Already stopped, or the screen is unmounting. Nothing useful to do.
    }
    void setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false }).catch(
      () => {},
    );
  }, [stream]);

  /** Permission, then the audio session. Shared by both jobs; returns false if refused. */
  const claimMicrophone = useCallback(async (): Promise<boolean> => {
    const existing = await getRecordingPermissionsAsync();
    const granted = existing.granted ? existing : await requestRecordingPermissionsAsync();
    if (!granted.granted) {
      setState('denied');
      setNote('This needs the microphone. You can turn it on in Settings.');
      return false;
    }

    await setAudioModeAsync({
      allowsRecording: true,
      // The session survives the app going to the background, so a recording is not
      // cut short by putting the phone face down for two hours.
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      // Never take audio focus. Whatever is playing the episode — the television, or
      // this phone — must not be ducked or paused by something that is only listening.
      interruptionMode: 'mixWithOthers',
    });
    return true;
  }, []);

  const startListening = useCallback(async () => {
    if (!stream) {
      setState('unsupported');
      return;
    }

    setNote(undefined);
    setMisses(0);
    setMapping(undefined);
    correctedRef.current = false;

    let reference: Reference;
    try {
      const found = await fetchReference(targetId);
      // The phone already had a 'failed' state for a thrown fetch; what it could not
      // see was a request that came back empty *because* it failed. Two different
      // things to say, and the wrong one sends somebody off to spend an episode
      // recording a timeline that may already exist.
      if (found.failed) {
        setState('failed');
        setNote(`Could not check for a timeline (${found.failed}). Sync by hand for now.`);
        return;
      }
      if (!found.reference) {
        setState('no-reference');
        setNote('Nobody has mapped this episode yet — you could be the first.');
        return;
      }
      reference = found.reference.reference;
    } catch {
      setState('failed');
      setNote('Could not fetch this episode’s timeline.');
      return;
    }

    if (!(await claimMicrophone())) return;

    try {
      recorderRef.current = undefined;
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
  }, [claimMicrophone, stream, targetId]);

  const startMapping = useCallback(async () => {
    if (!stream) {
      setState('unsupported');
      return;
    }

    setNote(undefined);
    setLastMatch(undefined);
    if (!(await claimMicrophone())) return;

    try {
      matcherRef.current = undefined;
      recorderRef.current = new ContributionRecorder({
        // Where the clock has reached is where this recording sits in the episode. A
        // contribution stamped from zero would not describe a fragment — it would
        // assert the episode begins here, and misplace everyone who used it.
        startFrame: framesForMs(positionRef.current, HOP_SIZE, SAMPLE_RATE),
      });
      streamRef.current = undefined;
      setMapping({ seconds: 0, landmarks: 0 });
      await stream.start();
      setState('mapping');
    } catch (err) {
      recorderRef.current = undefined;
      setState('failed');
      setNote(err instanceof Error ? err.message : 'Could not start recording.');
    }
  }, [claimMicrophone, stream]);

  /** Finish a recording and send it. Separated so `stop` reads as one decision. */
  const submit = useCallback(
    async (recorder: ContributionRecorder) => {
      const { hashes, frames } = recorder.finish();
      if (recorder.frameCount < framesForMs(20_000, HOP_SIZE, SAMPLE_RATE)) {
        setState('idle');
        setNote('That was too short to be useful. Twenty seconds is about the minimum.');
        return;
      }

      setState('uploading');
      try {
        const result = await contributeReference({
          targetId,
          hashes,
          frameCount: frames,
          hopSize: HOP_SIZE,
          sampleRate: SAMPLE_RATE,
        });
        setState('idle');
        setNote(
          result.ok
            ? 'Thank you. It becomes usable once someone else agrees with it.'
            : result.reason,
        );
      } catch (err) {
        setState('idle');
        setNote(err instanceof Error ? err.message : 'Could not send that.');
      }
    },
    [targetId],
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    matcherRef.current = undefined;
    recorderRef.current = undefined;
    streamRef.current = undefined;
    release();

    if (recorder) {
      void submit(recorder);
      return;
    }
    setState((current) => (current === 'listening' ? 'idle' : current));
  }, [release, submit]);

  // Progress while mapping. Polled rather than pushed: buffers arrive dozens of times
  // a second and re-rendering the screen at that rate to move a counter would cost
  // more than the analysis does.
  useEffect(() => {
    if (state !== 'mapping') return;
    const timer = setInterval(() => {
      const recorder = recorderRef.current;
      if (!recorder) return;
      setMapping({
        seconds: Math.round((recorder.frameCount * HOP_SIZE) / SAMPLE_RATE),
        landmarks: recorder.hashCount,
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state]);

  // Never outlive the screen. A microphone left running after navigating away is the
  // single worst thing this feature could do — so this releases the hardware
  // unconditionally, without trying to salvage a recording in progress.
  useEffect(() => release, [release]);

  return {
    state: stream ? state : 'unsupported',
    note,
    lastMatch,
    misses,
    mapping,
    startListening,
    startMapping,
    stop,
  };
}
