# Android Auto album loading

Opening a visible album must not depend on its position in the prefetch queue.
The reported Most played album was candidate 42 while only the first 40 albums
were prefetched. The native cache had its tile but no track-list parent, so
`onGetChildren` returned an empty success. Disc headings on the phone are
presentation only and were not responsible.

## Decision

Keep the existing prefetch limits. When the driver opens a known album without
cached children, `ResonusCarBrowserService` returns a pending Media3 future.
`AlbumBrowseLoader` sends a request ID, album parent and profile through the
Expo bridge. `CarAutoSync` resolves only that album through `data.getAlbum`
and the existing React Query album key, then completes the request. This reuses
Resonus's `expo/fetch` background transport and local/offline data path.

Concurrent pages share a request. At most four album requests wait at once,
with a native 15-second deadline independent of JavaScript timers. Delivery
waits for the JS browse listener to be registered. There is no new foreground
service or second network/authentication client. If the JS runtime is absent
or the server is unavailable, the request fails and can be retried; it does
not become a successful empty album. A confirmed empty album is cached until
a list/mode refresh, so an empty offline result can be retried when online.

Only the response for a pending request, matching its account and exact album
parent, can merge. Account changes invalidate the native scope immediately;
late/timed-out responses cannot publish children. Background tree builders
also check their captured profile before publishing or updating track maps.

Successfully demand-loaded albums are retained across capped full rebuilds
and saved in the existing snapshot via atomic replacement. Retention is bounded
to the last 40 demand-loaded albums; older evicted albums can load again when
opened. This bound is separate from, and does not raise, the prefetch limit.
The JS track maps still reset on a full build. Tapping a persisted album track
rehydrates its queue from the shared album query if its map is missing.

This change applies to albums. Playlist and artist prefetch caps are unchanged.
Reverting this feature restores the old cached-only browse path. Snapshot
track nodes remain compatible with the old reader; the extra `demandedAlbums`
field is ignored by it.

## Verification

```sh
pnpm test
pnpm typecheck
pnpm lint
cd android
./gradlew :car-auto:testDebugUnitTest
```

The JS regression exercises the real browse builder with more than 40 album
candidates and a 38-song, two-disc fixture. It checks the single targeted
fetch, disc-2 queue position, full-rebuild/cold-map recovery, shared requests,
failure/empty distinction and account changes. Native Robolectric tests cover
the real Media3 callback, paging, pending futures, timeout/retry, listener
startup, cancellation, service teardown, strict response scopes, bounded
retention and snapshots. Existing duplicate-track and playback-mirror tests
must continue to pass.

Physical head-unit verification remains necessary: open “The Eminem Show
(Expanded Edition)” from Most played without first playing it on the phone,
check all 38 songs including disc 2, then repeat with the phone locked and
verify an album with downloaded tracks in offline mode. Test failure/retry
without clearing app data. Automated checks are not a completed head-unit test.

References: [Media3 asynchronous browse callback](https://developer.android.com/reference/androidx/media3/session/MediaLibraryService.MediaLibrarySession.Callback#onGetChildren(androidx.media3.session.MediaLibraryService.MediaLibrarySession,androidx.media3.session.MediaSession.ControllerInfo,java.lang.String,int,int,androidx.media3.session.MediaLibraryService.LibraryParams)),
[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).
