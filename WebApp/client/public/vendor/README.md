# Vendored third-party browser code

Files here are copied verbatim from upstream and are **not** edited locally. They are
vendored so the page has no runtime dependency on an external CDN — the exhibit machines
may have no internet, and a stalled CDN request delays every page load.

## adapter.js

- Upstream: <https://webrtc.github.io/adapter/adapter-latest.js>
- Project: <https://github.com/webrtc/adapter> (`webrtc-adapter`)
- Retrieved: 2026-07-31
- SHA-256: `ec06d9139f52269b521ea282f5908afd86235957184e63f64141ac2f45fd866d`
- Size: 131147 bytes
- License: BSD 3-Clause (notice retained in the file header)

The upstream file is a rolling "latest" build with no embedded version string, hence the
checksum above. To update, re-download and replace the file, then update the date, size and
checksum here:

```bash
curl -L -o client/public/vendor/adapter.js https://webrtc.github.io/adapter/adapter-latest.js
sha256sum client/public/vendor/adapter.js
```

It is loaded as a classic script before `js/main.js` because it patches browser WebRTC APIs
globally and must run before any `RTCPeerConnection` is constructed.
