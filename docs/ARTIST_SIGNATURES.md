# Artist signature validation

Signature providers are opt-in and user-configured. An asset must pass the
existing source, origin and public-domain-signature/CC0 checks, then be a PNG
or SVG candidate. A licence claim does not establish whose autograph it is.

Before hiding the normal artist name, Expo Image decodes the candidate at a
bounded size and computes a ThumbHash from those pixels. Opaque, empty,
uniform-alpha and animated images are rejected. The exact validated ImageRef
is then displayed, avoiding a second URL fetch. Rejected references are
released. Remaining candidates are considered, up to five unique URLs.

This is a coarse display-suitability check, not semantic identity recognition.
In the reported Leona Lewis case the provider returned opaque JPEG scans of
19th-century sheet music. The public PR's stricter rights policy already
rejects that response; format and decoded-mask validation additionally protect
against opaque PNG/SVG records that otherwise satisfy that policy.

Cache schema 4 revalidates schema 3 entries, including offline recovery.
Positive metadata lasts seven days, misses five minutes. Network/decode errors
do not replace a previously usable result with a miss. Offline mode only
loads existing local image files. Names remain visible on rejection or error;
plain-name headers do not expose a source action. No Apple request or default
provider is introduced by this feature.

Regression tests exercise actual response parsing and the production cache
path with device/network I/O stubbed. The transparency check has also been
checked against the unchanged Expo Image 57.0.3 Android encoder with opaque
PNG, empty/uniform masks, visible strokes and a transparent title logo. These
checks do not constitute visual testing of this extracted PR on a device.
