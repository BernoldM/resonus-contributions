import { Image, type ImageRef } from 'expo-image';

import { isUsableSignatureThumbhash, type ArtistSignature } from './artistSignatures';

export type LoadedArtistSignature = ArtistSignature & { image: ImageRef };

/** Validate actual decoded pixels, then display that same image without a refetch. */
export async function loadSignatureImage(signature: ArtistSignature, offline: boolean): Promise<LoadedArtistSignature | null> {
  const path = offline ? await Image.getCachePathAsync(signature.imageUrl) : null;
  if (offline && !path) return null;
  const uri = path ? `file://${path.replace(/^file:\/\//, '')}` : signature.imageUrl;
  const image = await Image.loadAsync(uri, { maxWidth: 1000, maxHeight: 400 });
  let accepted = false;
  try {
    accepted = !image.isAnimated && isUsableSignatureThumbhash(await Image.generateThumbhashAsync(image));
    return accepted ? { ...signature, image } : null;
  } finally {
    // Successful references belong to the query/view until garbage collection.
    if (!accepted) image.release();
  }
}
