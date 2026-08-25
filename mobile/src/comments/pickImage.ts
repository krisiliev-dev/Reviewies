import * as ImagePicker from 'expo-image-picker';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, type ImageUpload } from '@reviewies/core/social/comments';

/**
 * Pick a screenshot to attach to a comment.
 *
 * The phone could render other people's screenshots and had no way to post one, which
 * is a strange half of a feature — and it is the half the research cares about, since
 * screenshots were core to TV Time's comment culture and `filterByEffort` deliberately
 * exempts a post that carries one from the one-liner filter.
 *
 * The library rather than the camera: this is for a still off the television, and
 * asking for camera permission to attach a screenshot would be a worse trade than the
 * feature is worth.
 */
export type PickResult =
  | { ok: true; image: ImageUpload; uri: string }
  | { ok: false; reason?: string };

/** Fallback when the picker does not report a type, which happens on some Android providers. */
const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

function typeOf(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const name = asset.fileName ?? asset.uri;
  const extension = name.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return TYPE_BY_EXTENSION[extension] ?? '';
}

export async function pickCommentImage(): Promise<PickResult> {
  // Permission is requested rather than assumed: on iOS the limited-library picker
  // needs it, and a silent failure here would look like the button doing nothing.
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { ok: false, reason: 'Reviewies needs permission to reach your photos.' };
  }

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // No editor: cropping a screenshot is not what anyone attaching one wants, and the
    // editor's output loses the type the picker reported.
    allowsEditing: false,
    quality: 1,
  });
  if (picked.canceled || picked.assets.length === 0) return { ok: false };

  const asset = picked.assets[0];
  const type = typeOf(asset);
  if (!IMAGE_TYPES.includes(type)) {
    return { ok: false, reason: 'Images only — JPEG, PNG, WebP or GIF.' };
  }

  const size = asset.fileSize ?? 0;
  if (size > MAX_IMAGE_BYTES) return { ok: false, reason: 'That image is over 5 MB.' };

  return {
    ok: true,
    uri: asset.uri,
    image: {
      // On the web export the picker hands back a real File, which a browser FormData
      // knows how to serialise; an `{ uri, name, type }` object there would be sent as
      // the string "[object Object]". On a device there is no File and that object is
      // exactly what React Native's FormData expects.
      part: asset.file ?? { uri: asset.uri, name: asset.fileName ?? `image.${type.split('/')[1]}`, type },
      type,
      // A picker that reports no size is not a reason to refuse the upload; the edge
      // function checks the real bytes and is the control that matters.
      size: size || 1,
    },
  };
}
