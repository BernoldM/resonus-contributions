import { fetch } from 'expo/fetch';
import * as FileSystem from 'expo-file-system/legacy';

import { isManualOffline } from '@/api/netGate';
import { artistSignatureCandidates, SIGNATURE_API, type ArtistSignature } from './artistSignatures';
import { hashKey } from './localLibrary';
import { publicHttpsUrl } from './artworkSources';
import { loadSignatureImage, type LoadedArtistSignature } from './signatureImage';

const CACHE_DIR = `${FileSystem.documentDirectory}artist-signatures/`;
const CACHE_VERSION = 5;
const TTL = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL = 5 * 60 * 1000;

/** Public name only, never server credentials, artist IDs or Navidrome writes. */
export async function getArtistSignature(name: string, api = SIGNATURE_API, tintColor = '#ffffff'): Promise<LoadedArtistSignature | null> {
  const source = publicHttpsUrl(api);
  if (!source) return null;
  const normalized = name.trim().normalize('NFC');
  if (!normalized || normalized.length > 300) return null;
  const key = `${source}\n${normalized}`;
  const file = `${CACHE_DIR}${hashKey(key)}.json`;
  const offline = isManualOffline();
  let imageFailed = false;

  async function load(candidates: ArtistSignature[]): Promise<LoadedArtistSignature | null> {
    const seen = new Set<string>();
    // Bound optional provider work, including repeated asset URLs.
    for (const candidate of candidates.filter((item) => {
      if (seen.has(item.imageUrl)) return false;
      seen.add(item.imageUrl);
      return true;
    }).slice(0, 5)) {
      try {
        const signature = await loadSignatureImage(candidate, offline, tintColor);
        if (signature) return signature;
      } catch { imageFailed = true; }
    }
    return null;
  }

  let cached: { candidates: ArtistSignature[]; at: number; version: number; found: boolean } | undefined;
  async function loadCached(): Promise<LoadedArtistSignature | null> {
    if (!cached) return null;
    return load(cached.candidates);
  }
  try {
    const saved = JSON.parse(await FileSystem.readAsStringAsync(file));
    // Older schemas are eligible only for revalidation/offline recovery, never a
    // fresh seven-day hit. The exact name also guards against hash collisions.
    if ([3, 4, CACHE_VERSION].includes(saved.version) && saved.key === key && Number.isFinite(saved.at)) {
      cached = { candidates: artistSignatureCandidates(saved.response, source), at: saved.at, version: saved.version, found: saved.found === true };
    }
  } catch { /* A cache miss never prevents the normal artist header. */ }
  if (offline) return loadCached();
  if (cached?.version === CACHE_VERSION && Date.now() - cached.at < (cached.found ? TTL : MISS_TTL)) {
    const signature = await loadCached();
    if (signature || !cached.found) return signature;
  }
  try {
    const endpoint = new URL(source);
    if (!endpoint.pathname.replace(/\/$/, '').endsWith('/v1/signatures')) endpoint.pathname = endpoint.pathname.replace(/\/$/, '') + '/v1/signatures';
    endpoint.searchParams.set('artist', normalized);
    const primaryController = new AbortController();
    const primaryTimer = setTimeout(() => primaryController.abort(), 8000);
    let body: unknown;
    let primaryFailed = false;
    try {
      const response = await fetch(endpoint.href, { signal: primaryController.signal });
      if (!response.ok && response.status !== 404) throw new Error(`Signature HTTP ${response.status}`);
      body = { signatures: [] };
      if (response.status !== 404) {
        const text = await response.text();
        if (text.length > 512_000) throw new Error('Signature response too large');
        body = JSON.parse(text);
      }
    } catch { primaryFailed = true; }
    finally { clearTimeout(primaryTimer); }
    const signature = await load(artistSignatureCandidates(body, source));
    // Outages never replace previously usable artwork with a miss. Old
    // responses still go through format AND decoded-mask validation here.
    if (!signature) {
      const previous = await loadCached();
      if (previous) return previous;
      if (primaryFailed || imageFailed) return null;
    }
    try {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
      await FileSystem.writeAsStringAsync(file, JSON.stringify({ version: CACHE_VERSION, key, at: Date.now(), found: !!signature, response: body }));
    } catch { /* Optional cache; successful requests still display normally. */ }
    return signature;
  } catch {
    if (__DEV__) console.debug('[artist-signature] lookup unavailable; using the normal artist name');
    return loadCached();
  }
}
