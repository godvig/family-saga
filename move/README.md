# Moving to släktsagan.se

Släktsagan's address is **[släktsagan.se](https://släktsagan.se/)** (`xn--slktsagan-w2a.se` in DNS and in code). It has had two earlier addresses, **klansagan.godvig.com** and **saga.godvig.com**, and both now send visitors on.

Browsers keep saved data per address, so an archive saved at an old address can't be seen at the new one. The move is done in the browser, without a server:

- `old-address/` is published on **each old address**, from its own small repository (a GitHub Pages site has one custom domain): `godvig/klansagan-redirect` for klansagan.godvig.com and `godvig/saga-redirect` for saga.godvig.com. The files are the same for both and do not depend on which address serves them; each repository only adds its own `CNAME`. Visitors with nothing saved there are redirected at once, with the rest of the URL (path, query and hash) kept, so shared links (`#dela-…`, `#visa-…`) keep working. Visitors with an archive are offered to move it.
- [`../flytt.html`](../flytt.html) on **släktsagan.se** receives it. The old page opens it and hands over the archive, photos, voice memories and the keys to shared trees with `postMessage`. The new page accepts messages only from the two old addresses and from the window that opened it, and once a move has started only from that one address; the old page accepts replies only from the new address.
- A move only goes into an empty address. Before `flytt.html` writes anything, it copies everything already there (the archive store and localStorage) to one entry in the archive store, `klansagan-before-move-<time>-<old host>`. If the new address holds anything at all (people, shared trees, photos), nothing is moved: the page says so and explains the way through a JSON backup from "Läs in & spara" at the old address, read in at the new one. Earlier versions asked with `confirm()` only when both sides had people, and moved an old address without people (only shared trees, say) without asking, replacing the list of shared trees already there.
- Nothing is deleted at the old address. When the move is done, the old address remembers it (`klansagan-moved-to`) and from then on just sends you on. Someone who once moved klansagan.godvig.com → saga.godvig.com has their archive on saga, so klansagan sends them to saga (which offers the next move), not straight to släktsagan.se.
- `old-address/sw.js` replaces the old app's service worker so returning visitors get the move page instead of a cached copy of the app.
- `index.html` and `404.html` are the same page: `404.html` answers every deep link on GitHub Pages.

The new address is written in punycode (`https://xn--slktsagan-w2a.se`) wherever code compares or sends to it, because that is what browsers report as `location.origin` and `MessageEvent.origin`. Text for people says släktsagan.se.

To update a redirect repository, copy `old-address/*` into it and keep its own `CNAME`.

Tested in [`e2e/move.e2e.mjs`](../e2e/move.e2e.mjs), for both old addresses, with all three addresses served from this checkout: an empty new address, a new address with data (nothing moves, nothing changes, the copy is there), and an old address that only has shared trees. Set `MOVE_SCREENSHOT=/some/path.png` to save a picture of the refusal.

## Switching the address, in order

Each step keeps every address answering, or down for a few minutes at most.

1. DNS for `xn--slktsagan-w2a.se` answers with GitHub's four addresses (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153). Check with https://dns.google/query?name=xn--slktsagan-w2a.se&type=A. Do nothing below until it does.
2. Create `godvig/saga-redirect` on GitHub, push it, and turn on Pages **without** a custom domain.
3. Push `feat/slaktsagan-se` to `main`. GitHub reads `CNAME` and switches family-saga's domain; saga.godvig.com stops answering here.
4. At once, set the custom domain `saga.godvig.com` on saga-redirect. Turn on Enforce HTTPS on both when their certificates are issued.
5. Push klansagan-redirect.
6. Deploy archive-search from `feat/archive-search`.
7. Try klansagan.godvig.com and saga.godvig.com with `#visa-x`, and a move from each old address.
