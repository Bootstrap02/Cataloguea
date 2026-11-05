# BetKing sync: backend setup (about 10 minutes)

This EDITS your existing BetKing API. It does not add a new one. `index.js` already mounts `/betking`, so it is not touched.

1. Replace these three files in your backend project with the ones here (same names, same folders):
   - `Models/catalogueaModel.js`
   - `Controllers/catalogueaBKCtrl.js`
   - `Routes/catalogueaBKRoute.js`
   (optional) add `test/betkingSync.test.js` and run it with `node --test test/betkingSync.test.js`.
2. Make a long secret (for example run `openssl rand -hex 24`). Put it in the backend `.env` as `LALIGA_SYNC_KEY=...`
   and ALSO in Vercel: Project, Settings, Environment Variables, `LALIGA_SYNC_KEY`.
3. Push to GitHub so Vercel redeploys.
4. Check: open `https://<your-backend>/betking` in a browser. It must say "Wrong or missing sync key". That proves it is
   protected: nobody can read or change anything without the key.
5. On the automation computer: `npm run laliga:sync-setup` and give it the backend address and the same key.

## What the BetKing API does now
- `GET /betking` the newest strategy state (every deficit, the winners' bases, the bank). `{ exists: false }` if nothing is saved.
- `PUT /betking` saves a new state. It must build on the version the device last saw; otherwise 409 (another device saved first),
  unless `force`. The replaced state is kept in the history (the latest 100).
- `GET /betking/history`, `GET /betking/history/:version` the older states, so a wrong save can be undone.
- `DELETE /betking?confirm=yes` removes the saved state and its history. Add `&legacy=yes` to also remove the old Arsenal-era record.
- Every call needs the header `x-sync-key`.

## Things to know
- The old record (the Arsenal-era fields: oneXDeficit, htOneTwoTarget, ...) is no longer used and is ignored. It stays in the
  database until you delete it with `DELETE /betking?confirm=yes&legacy=yes` (with the key).
- The React page that read and wrote those old fields (`src/Catalogued.js` and friends) will no longer be able to save, because
  `/betking` now needs the key and holds the new state. Tell me if you want that page updated to show the La Liga state.
