import { NextResponse } from 'next/server';

// Apple-App-Site-Association (AASA) — iOS Universal Links
//
// Apple's CDN fetches this during app install and on OS-scheduled refreshes.
// Requirements: no redirect, Content-Type: application/json, served over HTTPS.
//
// Format: v2 (iOS 13+, macOS 10.15+).
// appIDs: <TEAM_ID>.<BUNDLE_ID>
//   Live:    W22UFWBATJ.com.banza.consumer
//   Sandbox: W22UFWBATJ.com.banza.consumer.sandbox

const AASA = {
  applinks: {
    details: [
      {
        appIDs: [
          'W22UFWBATJ.com.banza.consumer',
          'W22UFWBATJ.com.banza.consumer.sandbox',
        ],
        components: [
          { '/': '/pay/*', comment: 'Payment links (canonical) — /pay/<slug>' },
          { '/': '/r/*',   comment: 'Consumer pay-request links — /r/<code>' },
          { '/': '/u/*',   comment: 'Handle-based pay links — /u/<handle>' },
        ],
      },
    ],
  },
};

export function GET() {
  return NextResponse.json(AASA, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
