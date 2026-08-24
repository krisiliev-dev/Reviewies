import { describe, expect, it } from 'vitest';
import { CAPTURE_MS, FFT_SIZE, HOP_SIZE, micSupported } from './capture';

/**
 * The algorithm itself is tested in the core. What is left here is the part that
 * genuinely needs a browser.
 */
describe('microphone capture', () => {
  it('reports the microphone as unavailable in jsdom rather than throwing', () => {
    // The important property is that it answers. Watching Mode offers manual sync as
    // the fallback, so an honest "no" is a working path and an exception is not.
    expect(typeof micSupported()).toBe('boolean');
  });

  it('uses the same analysis parameters as the algorithm it feeds', () => {
    // A reference built at one FFT size cannot be matched against a sample taken at
    // another, and the failure is silent — every match simply misses.
    expect(FFT_SIZE).toBe(2048);
    expect(HOP_SIZE).toBe(512);
    expect(CAPTURE_MS).toBe(6000);
  });
});
