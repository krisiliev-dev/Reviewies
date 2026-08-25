import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The picker shim, at the branch the web export never takes.
 *
 * `mobile/smoke.mjs` drives the react-native-web build, where expo-image-picker hands
 * back a real `File` — so the path a phone actually uses, the `{ uri, name, type }`
 * object React Native's FormData expects, is the one thing no browser run can reach.
 * Getting it wrong sends the string "[object Object]" as the image and the failure
 * arrives from the server, hours later, as a 400.
 */
const picker = {
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
};

vi.mock('expo-image-picker', () => picker);

const { pickCommentImage } = await import('./pickImage');

const granted = () => picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
const returns = (assets: unknown[]) =>
  picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets });

beforeEach(() => {
  vi.clearAllMocks();
  granted();
});

describe('picking a screenshot', () => {
  it('describes a device asset the way React Native FormData wants it', async () => {
    returns([
      { uri: 'file:///photos/IMG_1.jpg', fileName: 'IMG_1.jpg', mimeType: 'image/jpeg', fileSize: 2048 },
    ]);

    const result = await pickCommentImage();

    expect(result).toEqual({
      ok: true,
      uri: 'file:///photos/IMG_1.jpg',
      image: {
        part: { uri: 'file:///photos/IMG_1.jpg', name: 'IMG_1.jpg', type: 'image/jpeg' },
        type: 'image/jpeg',
        size: 2048,
      },
    });
  });

  it('prefers the File the web export hands back', async () => {
    // A browser FormData would serialise the uri object as "[object Object]".
    const file = { name: 'shot.png', size: 10, type: 'image/png' };
    returns([{ uri: 'blob:x', fileName: 'shot.png', mimeType: 'image/png', fileSize: 10, file }]);

    const result = await pickCommentImage();

    expect(result.ok && result.image.part).toBe(file);
  });

  it('works out the type when the picker does not report one', async () => {
    // Some Android providers return no mimeType at all, and an empty type would be
    // refused by the allow-list check for the wrong reason.
    returns([{ uri: 'content://media/42/IMG.PNG', fileName: 'IMG.PNG', fileSize: 99 }]);

    const result = await pickCommentImage();

    expect(result.ok && result.image.type).toBe('image/png');
  });

  it('refuses a type the bucket does not allow', async () => {
    // An iPhone screenshot is PNG, but a photo is HEIC, and the bucket takes neither
    // HEIC nor anything else outside the four.
    returns([{ uri: 'file:///x.heic', fileName: 'x.heic', mimeType: 'image/heic', fileSize: 99 }]);

    expect(await pickCommentImage()).toEqual({
      ok: false,
      reason: 'Images only — JPEG, PNG, WebP or GIF.',
    });
  });

  it('refuses one over the size the server will take', async () => {
    returns([
      { uri: 'file:///big.png', fileName: 'big.png', mimeType: 'image/png', fileSize: 6_000_000 },
    ]);

    expect(await pickCommentImage()).toEqual({ ok: false, reason: 'That image is over 5 MB.' });
  });

  it('says nothing when the picker is cancelled', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] });

    // No reason: a cancelled picker is not an error and must not put a message on screen.
    expect(await pickCommentImage()).toEqual({ ok: false });
  });

  it('explains a refused permission rather than doing nothing', async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });

    expect(await pickCommentImage()).toEqual({
      ok: false,
      reason: 'Reviewies needs permission to reach your photos.',
    });
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });
});
