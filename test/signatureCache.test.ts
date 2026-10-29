import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { beforeEach, describe, it } from 'node:test';

const api = 'https://signatures.example';
const key = `${api}/\nLeona Lewis`;
const png = 'https://upload.wikimedia.org/signature.png';
const svg = 'https://upload.wikimedia.org/second.svg';
const leona = JSON.parse(readFileSync(new URL('./fixtures/signatures/leona-provider.json', import.meta.url), 'utf8'));
const response = (...urls: string[]) => ({ signatures: urls.map(asset => ({ asset,
  source: { url: 'https://commons.wikimedia.org/wiki/File:Signature.svg' },
  license: { status: 'known', name: 'PD-signature' } })) });
const mask = (alpha: boolean) => {
  const bytes = new Uint8Array(25); bytes[2] = alpha ? 128 : 0; bytes[5] = 0x53;
  return Buffer.from(bytes).toString('base64');
};
const state = {
  offline: false, saved: undefined as Record<string, unknown> | undefined,
  response: leona as unknown, status: 200, failFetch: false, failHash: false, animated: false,
  masks: new Map<string, string>(), files: new Map<string, string>(), loaded: [] as string[],
  refs: [] as { uri: string; released: boolean }[], written: undefined as Record<string, unknown> | undefined, fetches: 0,
};
Object.assign(globalThis, { __signatureCacheTest: state });
const stub = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const hooks = registerHooks({ resolve(specifier, context, next) {
  const prelude = 'const s = globalThis.__signatureCacheTest;';
  if (specifier === 'expo/fetch') return { shortCircuit: true, url: stub(prelude + `
    export async function fetch() {
      s.fetches++; if(s.failFetch) throw Error('offline');
      return {ok:s.status===200,status:s.status,text:async()=>JSON.stringify(s.response)};
    }`) };
  if (specifier === 'expo-file-system/legacy') return { shortCircuit: true, url: stub(prelude + `
    export const documentDirectory='file:///app/';
    export async function readAsStringAsync(){if(!s.saved) throw Error('missing');return JSON.stringify(s.saved)}
    export async function writeAsStringAsync(_,v){s.written=JSON.parse(v)}
    export async function makeDirectoryAsync(){}
  `) };
  if (specifier === 'expo-image') return { shortCircuit: true, url: stub(prelude + `
    export const Image={
      getCachePathAsync:async uri=>s.files.get(uri)??null,
      loadAsync:async uri=>{
        s.loaded.push(uri); if(!s.masks.has(uri)) throw Error('image decode failed');
        const ref={uri,isAnimated:s.animated,released:false,release(){this.released=true}};
        s.refs.push(ref);return ref;
      },
      generateThumbhashAsync:async ref=>{if(s.failHash)throw Error('hash failed');return s.masks.get(ref.uri)},
    };
  `) };
  if (specifier === '@/api/netGate') return { shortCircuit: true, url: stub(prelude+'export const isManualOffline=()=>s.offline;') };
  if (specifier === './localLibrary' && context.parentURL?.endsWith('/signatureCache.ts')) return { shortCircuit: true, url: stub('export const hashKey=()=>"hash";') };
  return next(specifier, context);
} });
const { getArtistSignature } = await import('@/lib/signatureCache');
hooks.deregister();
const lookup = () => getArtistSignature('Leona Lewis', api);

beforeEach(() => {
  Object.assign(state, { offline: false, saved: undefined, response: leona, status: 200,
    failFetch: false, failHash: false, animated: false, masks: new Map(), files: new Map(),
    loaded: [], refs: [], written: undefined, fetches: 0 });
});

describe('signature pixel validation and cache', () => {
  it('does not contact any source without a configured provider', async () => {
    assert.equal(await getArtistSignature('Leona Lewis'), null);
    assert.equal(state.fetches, 0);
  });
  it('revalidates v3 Leona metadata and stores a short-lived v4 miss', async () => {
    state.saved = { version: 3, key, at: Date.now(), response: leona };
    assert.equal(await lookup(), null);
    assert.equal(state.fetches, 1);
    assert.deepEqual(state.loaded, []);
    assert.equal(state.written?.version, 4);
    assert.equal(state.written?.found, false);
  });
  it('rejects opaque pixels and returns the exact checked next image', async () => {
    state.response = response(svg, png);
    state.masks.set(svg, mask(false)); state.masks.set(png, mask(true));
    const result = await lookup();
    assert.equal(result?.imageUrl, png);
    assert.equal(result?.image, state.refs[1]);
    assert.equal(state.refs[0].released, true);
    assert.equal(state.refs[1].released, false);
  });
  it('keeps the name if every candidate is opaque', async () => {
    state.response = response(png); state.masks.set(png, mask(false));
    assert.equal(await lookup(), null);
    assert.equal(state.written?.found, false);
  });
  it('rejects animated masks and releases their native reference', async () => {
    state.response = response(png); state.masks.set(png, mask(true)); state.animated = true;
    assert.equal(await lookup(), null);
    assert.equal(state.refs[0].released, true);
  });
  it('does not cache a failed decode as a provider miss', async () => {
    state.response = response(svg);
    assert.equal(await lookup(), null);
    assert.equal(state.written, undefined);
  });
  it('releases the image if generating its mask fails', async () => {
    state.response = response(png); state.masks.set(png, mask(true)); state.failHash = true;
    assert.equal(await lookup(), null);
    assert.equal(state.refs[0].released, true);
    assert.equal(state.written, undefined);
  });
  it('revalidates old usable images offline with only a local file', async () => {
    state.offline = true;
    state.saved = { version: 3, key, at: Date.now(), response: response(svg) };
    state.files.set(svg, '/cache/signature'); state.masks.set('file:///cache/signature', mask(true));
    assert.equal((await lookup())?.imageUrl, svg);
    assert.deepEqual(state.loaded, ['file:///cache/signature']);
    assert.equal(state.fetches, 0);
  });
  it('never decodes an old Leona JPEG or fetches a source offline', async () => {
    state.offline = true; state.saved = { version: 3, key, at: Date.now(), response: leona };
    assert.equal(await lookup(), null);
    assert.equal(state.fetches + state.loaded.length, 0);
  });
  it('preserves a valid old image during a provider outage', async () => {
    state.failFetch = true; state.saved = { version: 3, key, at: Date.now(), response: response(svg) };
    state.masks.set(svg, mask(true));
    assert.equal((await lookup())?.imageUrl, svg);
    assert.equal(state.written, undefined);
  });
  it('revalidates a positive v4 hit and retries if the image is now opaque', async () => {
    state.saved = { version: 4, key, at: Date.now(), found: true, response: response(svg) };
    state.masks.set(svg, mask(false)); state.masks.set(png, mask(true)); state.response = response(png);
    assert.equal((await lookup())?.imageUrl, png);
    assert.equal(state.fetches, 1);
  });
  it('rejects cache key collisions', async () => {
    state.offline = true; state.saved = { version: 4, key: key+'other', at: Date.now(), response: response(svg) };
    assert.equal(await lookup(), null);
    assert.deepEqual(state.loaded, []);
  });
  it('keeps a fresh negative hit for five minutes', async () => {
    state.saved = { version: 4, key, at: Date.now(), found: false, response: { signatures: [] } };
    assert.equal(await lookup(), null);
    assert.equal(state.fetches, 0);
  });
  it('treats an HTTP 404 with no JSON body as a provider miss', async () => {
    state.status = 404;
    assert.equal(await lookup(), null);
    assert.equal(state.written?.found, false);
  });
});
