# Android Auto queue and connection regression

The Oppo crash trace reports `IllegalArgumentException: Duplicate MediaItemData
UID in playlist` from `JsProxyPlayer.getState`. A song can legitimately occur
more than once, for example when it is manually queued while also present in
the playing album. The timeline previously used the song ID as its unique UID.

`JsProxyPlayer` now assigns a typed `(mediaId, occurrence)` UID to each queue
entry while keeping the original `MediaItem.mediaId`. Occurrences are counted
over the entire queue when it is supplied, before selecting the bounded car
window. Moving that window therefore preserves identities. This does not add
persistent queue-entry IDs or deduplicate songs.

Separately, the native bridge previously discarded playback updates until the
car service existed. `CarPlaybackMirror` retains the latest queue, index,
metadata, transport state and favorite state in memory. Service attachment and
all bridge updates run on the main thread; a new proxy receives that state
before its session is constructed. Destruction detaches the proxy while
retaining the latest state for reconnection. A new app process still relies on
the existing JS queue restoration, not a second persistent store. The real
expo-audio service continues to own the foreground media notification.

## Automated checks

With the Android SDK and JDK 17 available, from `android/`:

```sh
./gradlew :car-auto:testDebugUnitTest
```

The Robolectric tests execute the real Media3 player, exported Expo bridge
function implementations and browser-service lifecycle. They cover repeated
songs, suffix-like IDs, a moving queue window, both service/start orders,
reconnection, explicit clearing/stopping and bridge calls from another thread.
The original queue tests fail with the recorded duplicate-UID exception; the
original connection tests show a missing queue after service creation.

Also run `pnpm typecheck`, `pnpm lint` and `pnpm test`. The HTTP artwork tests
need permission to reach their loopback test server.

## Physical reproduction to validate

1. Install the local test update over the existing Resonus Local app.
2. Connect Android Auto and repeat the reported sequence: play “Comfort Zone
   song” by Chuckey Ellis from “BORN AGAIN CHRISTIAN” and manually queue
   “Ordinary final” in the same way as before. Keep any album occurrence too.
3. Let the song run through its final 20 seconds and the next transition.
   Check that the app stays open and the car controls still work.
4. Test phone-started playback while already connected, then test starting on
   the phone before connecting the car. Both should show the current playback
   and allow pause, next and previous from the car.
5. Disconnect/reconnect and reopen the app. Verify there is no crash/relaunch
   loop, stale song revival or second media notification.

Automated success is not a completed physical head-unit test. The saved crash
trace identifies the failing boundary but does not establish the exact queue
or the event that triggered the update near the end of the reported song.

The fixes are separate local commits, so either can be reverted independently.
Do not uninstall or clear app data as part of the test.

## Reported device result

The test build was checked on an Oppo CPH2791 with a real Android Auto head
unit: start “Comfort Zone song” on the phone, add “Ordinary final” using
**Add Next**, then connect Android Auto. The user confirmed that the car
immediately showed the existing playback, accepted media control and reached
“Ordinary final” without a crash.

An ADB check on 29 October 2026 found no new app exception or ANR in the
retained exit history since installation of the test build. The detailed
connection/transition messages had already rotated out of the small log
buffers, so the exact playback sequence is user-observed rather than a
complete log reconstruction. Other head units and the remaining manual
scenarios above have not all been physically verified.
