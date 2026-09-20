#!/usr/bin/env node
/**
 * Harden the Flutter Web service worker (BUSINESS-WEB-ICON defect, part 2).
 *
 * Flutter's modern build ships a "self-unregistering" service worker stub, and
 * flutter_bootstrap.js only ever touches the SW when one is ALREADY registered
 * (a fresh visitor gets no SW at all). That already heals the common case. But
 * the stub only calls `registration.unregister()` — it leaves the OLD service
 * worker's Cache Storage behind. A browser that installed a PREVIOUS deploy's
 * real (offline-first) Flutter SW keeps those stale entries — including an old
 * tree-shaken MaterialIcons subset that is missing glyphs (bar_chart,
 * notifications) — and can serve them for one more load before the unregister
 * settles, so two icons on /business render blank on exactly the browsers that
 * visited before (never in a fresh/private session). See ICON §32 and
 * content-address-fonts.mjs for the font-URL half of the fix.
 *
 * The durable fix: on `activate`, DELETE every Cache Storage bucket before
 * unregistering, then reload open clients. After this runs once on a stuck
 * browser there is no stale SW and no stale cache left to serve — "de uma vez
 * por todas". Fresh visitors are unaffected (no SW is ever registered for them).
 *
 * Deterministic overwrite rather than a parse-and-patch: Flutter's web SW is
 * deprecated and this stub is stable, so writing our own known-good stub is
 * clearer and idempotent (the bytes are identical on re-run).
 *
 *   node scripts/harden-service-worker.mjs [webDir]   (default: ../web)
 */
import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = process.argv[2] || join(here, '..', 'web');
const swPath = join(WEB, 'flutter_service_worker.js');
if (!existsSync(swPath)) {
  console.error(`harden-service-worker: flutter_service_worker.js not found at ${swPath}`);
  process.exit(1);
}

const HARDENED = `'use strict';
// App Banzami — self-unregistering + cache-purging service worker.
// Overwrites Flutter's deprecated SW stub so a browser stuck on a PREVIOUS
// deploy's offline cache (e.g. an old MaterialIcons subset missing the
// bar_chart / notifications glyphs) is wiped clean the next time this activates.
// A fresh visitor never registers a SW at all (see flutter_bootstrap.js), so
// this only ever runs to tear a legacy registration down.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 1) Purge every Cache Storage bucket this origin holds (the stale assets).
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {
        console.warn('Failed to clear caches:', e);
      }

      // 2) Remove this service worker so future loads go straight to the network.
      try {
        await self.registration.unregister();
      } catch (e) {
        console.warn('Failed to unregister the service worker:', e);
      }

      // 3) Reload open clients so they drop the old worker and re-fetch fresh.
      try {
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((client) => {
          if (client.url && 'navigate' in client) {
            client.navigate(client.url);
          }
        });
      } catch (e) {
        console.warn('Failed to navigate some service worker clients:', e);
      }
    })(),
  );
});
`;

writeFileSync(swPath, HARDENED);
console.log('harden-service-worker: wrote cache-purging self-unregistering SW stub');
