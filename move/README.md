# Moving from klansagan.godvig.com to saga.godvig.com

Browsers keep saved data per address, so an archive saved at the old address can't be seen at the new one. The move is done in the browser, without a server:

- `old-address/` is published at **klansagan.godvig.com** (from its own small repository, since a GitHub Pages site has one custom domain). Visitors with nothing saved there are redirected at once, with the rest of the URL kept, so shared links (`#dela-…`, `#visa-…`) keep working. Visitors with an archive are offered to move it.
- [`../flytt.html`](../flytt.html) on **saga.godvig.com** receives it. The old page opens it and hands over the archive, photos, voice memories and the keys to shared trees with `postMessage`. Each side only accepts messages from the other's origin and window.
- Nothing is deleted at the old address. An archive already present at the new address is never replaced without asking.
- `old-address/sw.js` replaces the old app's service worker so returning visitors get the move page instead of a cached copy of the app.

Tested in [`e2e/move.e2e.mjs`](../e2e/move.e2e.mjs), with both addresses served from this checkout.
