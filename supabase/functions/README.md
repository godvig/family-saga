# Edge Functions

## `archive-search`

Looks up birth and marriage records in Riksarkivet's search API for the "Leta i arkiven" feature.

**Why it exists.** `https://data.riksarkivet.se/api/records` answers with status 200 but without an `Access-Control-Allow-Origin` header, so a browser is not allowed to read the reply. The function asks on the app's behalf and passes the answer on.

**What it is not.** It is not a proxy. The app sends a small query of its own:

```json
{ "source": "riksarkivet", "kind": "birth", "name": "Olof Ekelöv", "yearMin": 1880, "yearMax": 1890, "place": "Skåne län", "limit": 20, "offset": 0 }
```

`kind` is `birth` or `marriage`. `place`, `limit` (1–50, default 20) and `offset` (default 0) are optional. `offset + limit` may not exceed 200, so one query reaches at most 200 records (see "Truncated lists" below). Every field is validated (length, characters, years 1500 to this year, at most 100 years apart), any other field is refused, and the upstream address is built by the function from those fields only. A caller cannot make it fetch another address or pass extra parameters.

**Answer.** `200` with `{ source, kind, total, offset, more, candidates }`, where each candidate is `{ source, kind, id, url, date, parish, child?, father?, mother?, groom?, bride?, raw }`. Errors are `{ error, message }` with `error` one of:

| status | `error` | meaning |
|---|---|---|
| 400 / 413 | `invalid_query` | a field was refused; `field` names it (the value is never echoed) |
| 403 | `origin_not_allowed` | the request came from a page that is not the app |
| 405 | `method_not_allowed` | use `POST` |
| 502 | `upstream_error` | Riksarkivet failed or answered something unexpected |
| 504 | `timeout` | Riksarkivet did not answer within 8 seconds |

**Truncated lists.** `total` is the number of records Riksarkivet says match; `candidates` is only the page asked for. `more` is `true` when `total > offset + candidates.length`, that is, when the list is cut short, and `false` when everything that matches has been returned. The app must show that to the user instead of treating the page as the whole answer. To get the next page, ask again with `offset` raised by the number of candidates received; the function refuses `offset + limit` above 200 (`invalid_query`, `field: "offset"`).

**Why pages are not fetched automatically.** Each page is a call to Riksarkivet from this project's address, they log every call, and the function has no rate limit (see below). Fetching several pages on every search would multiply the load by the number of pages for the sake of the few searches that need them, and it would still cut the list off silently at some limit. So one call returns one page, says whether there is more, and the user decides whether to ask for the next one. The cap of 200 keeps that from turning into paging through thousands of records. Riksarkivet's `sort` parameter is not used: `sort=date` is refused by the API and the default order is not by date, so there is no ordering to rely on.

**What the app sends.** The function only answers the query it gets; choosing the queries is `archiveQueriesFor` in `src/core.js`. A recorded year is searched one year either side (three for "ca", "före" and the like), also for a full date, since the tree's year can be one off. The children search adds the other parent's given name when there is exactly one known partner who is not counted as living, because Riksarkivet requires every word somewhere in the record and the extra name cuts a common name's hits sharply. If that search finds nothing at all, `runArchiveQuery` searches once more without the partner's name and marks the answer `fallback: "partner_name_dropped"`; it never does so when the first search found anything. That is the one case where one search in the app becomes two calls.

**Privacy.** The function never sees the family tree. It logs source, kind and status code, never a name. Identical queries are answered from memory for 10 minutes so Riksarkivet is not hit twice. Riksarkivet logs every call it receives, which is why the app only searches for people who are not living.

**CORS.** Allowed origins are `https://xn--slktsagan-w2a.se` (släktsagan.se; browsers send an internationalised domain in punycode, so that is the form to list) and `http://localhost:<port>`. The old addresses saga.godvig.com and klansagan.godvig.com only redirect and are refused. Edit `ALLOWED_ORIGINS` in `archive-search/logic.mjs` if you host the app elsewhere. A request without an `Origin` header (curl) is answered but gets no CORS headers.

### Files

```
archive-search/index.ts                    Deno entry point: createHandler() on Deno.serve()
archive-search/logic.mjs                   validation, CORS, timeout, cache; takes fetch as an argument
archive-search/adapters/riksarkivet.mjs    the source: buildRequest(query) and parse(response)
```

`logic.mjs` and the adapter are plain ES modules with no Deno APIs, so Vitest runs them in Node with a stand-in `fetch` (`tests/archive-function.test.mjs`). Nothing in the tests touches the real API. A new source is a new file in `adapters/` with the same two functions, registered in `ADAPTERS`.

### Deploy with the Supabase CLI

Use the same Supabase project as sharing. Its reference is the first part of `supabaseUrl` in `src/config.js`.

```bash
npm install -g supabase            # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <project-ref>
supabase functions deploy archive-search --no-verify-jwt
```

`--no-verify-jwt` is needed: the publishable key in `src/config.js` (`sb_publishable_…`) is not a JWT, so the platform's default JWT check would reject every call. The function is therefore open to anyone who knows its address; the validation above is what limits it. The `kl_*` database functions and the tree data are not affected.

### Known limits: read before a wide launch

- **The function is open and has no rate limit.** `--no-verify-jwt` is required, so anyone who finds the address can call it, from a script as well as from the app. CORS only stops other *websites* in a browser, not `curl`. Every call that is not answered from the 10-minute memory cache becomes one call to Riksarkivet from this project's address, so a script could get that address blocked.
- **What limits it today:** strict validation (no free URLs or parameters), at most 50 hits per call, an 8-second timeout and the small cache. The cache lives in each running instance, so it is not shared and it empties when an instance is replaced.
- **What is missing before a wide launch:**
  - a rate limit per caller (for example a counter in the database, or the platform's own limits), and a global ceiling on calls to Riksarkivet;
  - a decision on who may call it: either keep it open, or require a signed-in or shared secret that the app does not hold in public;
  - an agreement or at least a contact with Riksarkivet about the expected volume, since they log every call;
  - an alert on unusual traffic (the function logs only source, kind and status, so counts per status are all you will see);
  - a test of the deployed function under real Deno, which Vitest does not cover (`index.ts` is only four lines).

### Deploy from the web interface

1. Dashboard → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name it `archive-search`.
3. Create the three files above with the same names and paths (`index.ts`, `logic.mjs`, `adapters/riksarkivet.mjs`) and paste in their contents. Use the editor's **Add file** for the two `.mjs` files.
4. Deploy, then open the function's **Details** tab and switch **Verify JWT** off.

### Try it

```bash
curl -i -X POST 'https://<project-ref>.supabase.co/functions/v1/archive-search' \
  -H 'Content-Type: application/json' \
  -d '{"source":"riksarkivet","kind":"birth","name":"Anna Svensson","yearMin":1880,"yearMax":1890,"limit":3}'
```

Expect `200` and a JSON body with `candidates`. Check the refusals too; each should be `400` with `"error":"invalid_query"`:

```bash
curl -i -X POST 'https://<project-ref>.supabase.co/functions/v1/archive-search' \
  -H 'Content-Type: application/json' \
  -d '{"source":"riksarkivet","kind":"birth","name":"Anna","yearMin":1880,"yearMax":1890,"url":"https://example.com"}'
```

And that another website is turned away (`403`, no `Access-Control-Allow-Origin`):

```bash
curl -i -X POST 'https://<project-ref>.supabase.co/functions/v1/archive-search' \
  -H 'Origin: https://example.com' -H 'Content-Type: application/json' \
  -d '{"source":"riksarkivet","kind":"birth","name":"Anna Svensson","yearMin":1880,"yearMax":1890}'
```

### Run it locally

```bash
supabase functions serve archive-search --no-verify-jwt
# then POST to http://127.0.0.1:54321/functions/v1/archive-search
```

### Tests

```bash
npm test
```
