# Planner

A private planner that lives entirely on your phone. No account, no server, no tracking:
everything is stored in the browser's IndexedDB on your own device.

## Put it on your phone (iPhone)

1. Publish this folder with GitHub Pages (Settings → Pages → deploy from your main branch, root folder).
   GitHub only serves the code; your planner data never goes to GitHub.
2. Open the Pages address in **Safari** on your iPhone.
3. Tap **Share → Add to Home Screen**. Open it from the new icon. It works offline from then on.

Use the Home Screen icon, not a Safari tab: installed apps keep their storage and are not
cleared after a week of not opening them.

## Bring your old planner's data over

If you publish this at the same address as the old planner, opening it on your laptop will
offer to import the old data automatically. Then:

1. On the laptop: **Privacy & backup → Export** (add a passphrase if you like).
2. Send the file to your phone (AirDrop, Files, email to yourself).
3. On the phone: **Privacy & backup → Import** and choose the file.

If the new app lives at a different address, run this once in the old planner's browser console
to download its data, then use **Import from my old planner**:

```js
(function(){var o={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k.indexOf('lp_')===0)o[k]=localStorage.getItem(k);}var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(o)],{type:'application/json'}));a.download='planner-old-data.json';a.click();})()
```

## What to know about privacy

- The PIN lock keeps people from casually opening the app. It does not encrypt the data in the phone's
  storage. A forgotten PIN can't be recovered; erase and restore from a backup.
- Backups are files you keep. An optional passphrase encrypts them (AES-GCM, 250,000-round PBKDF2).
  A forgotten passphrase can't be recovered either.
- Deleting the app or clearing Safari's website data erases the planner. **Export a backup regularly.**
- The app uses your phone's built-in fonts, so it makes no requests to any font or analytics service.

## Not in this version yet

Budget, weekly photos, weather icons, the print dashboard and event notifications. Budget, photos
and weather from the old planner are kept untouched inside backups (under `legacy`), so nothing is lost.

## Develop

No build step. `python3 -m http.server`, then open `index.html`. Logic tests: `node tests/core.test.mjs`.
When you change cached files, bump `VERSION` in `sw.js`.
