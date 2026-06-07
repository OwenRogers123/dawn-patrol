# Dawn Patrol — Self-Service Runbook

Everything here works without Claude. You only need Terminal.

Live site: **https://getdawnpatrol.vercel.app**
Project folder: `/Users/owenrogers/swellmate`

---

## Run it locally

```bash
cd ~/swellmate
python3 -m http.server 8778
# then open http://localhost:8778
```

## Run the tests

```bash
cd ~/swellmate
node tests/run-tests.mjs      # should say "ALL TESTS PASSED"
```

---

## Make a change and ship it (3 steps)

### 1. Edit the files
- `index.html` — page structure & text
- `css/styles.css` — styling
- `js/coach.js` — the scoring engine (run tests after editing this)
- `js/app.js` — UI behavior

### 2. Bump the cache version
The app caches itself so it works offline. After ANY change you MUST bump the
version number, or browsers keep serving the old files. Find the current number
(e.g. `v19`) and bump every copy to the next number:

```bash
cd ~/swellmate
# replace 19 -> 20 everywhere (do this each release, incrementing the numbers)
sed -i '' 's/?v=19/?v=20/g' index.html
sed -i '' 's/dawn-patrol-v19/dawn-patrol-v20/; s/?v=19/?v=20/g' sw.js
```

### 3. Deploy to the live link

```bash
cd ~/swellmate
vercel --prod --yes
```

Vercel prints a long URL like
`https://getdawnpatrol-XXXX-....vercel.app`. Point your clean link at it:

```bash
vercel alias set https://getdawnpatrol-XXXX-....vercel.app getdawnpatrol.vercel.app
```

(Copy the exact URL Vercel printed into that command.)

Done — refresh https://getdawnpatrol.vercel.app to see the change.

---

## If the live link ever shows a login wall again

```bash
vercel project protection disable getdawnpatrol --sso
```

## If you don't see your change after deploy
- Confirm you bumped the `?v=` version (step 2).
- Hard refresh the browser: **Cmd + Shift + R**.
