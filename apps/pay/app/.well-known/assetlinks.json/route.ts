import { NextResponse } from 'next/server';

// Digital Asset Links — Android App Links (autoVerify)
//
// Google Play Services fetches this during app install to verify the association.
// Requirements: no redirect, Content-Type: application/json, served over HTTPS.
//
// SHA256 fingerprints:
//   RELEASE: obtain from release keystore —
//     keytool -list -v -keystore banzami-release.jks -alias banzami
//   DEBUG (dev/CI):
//     E1:1D:4D:04:F6:49:1D:E9:89:0F:7A:CA:54:F4:BB:6B:DE:D9:FE:DA:F5:30:5E:F7:B8:F7:D1:9D:84:D6:03:CC

const ASSET_LINKS = [
  {
    relation:  ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace:              'android_app',
      package_name:           'com.banza.consumer',
      sha256_cert_fingerprints: [
        // TODO(ops): replace with release keystore SHA256 before GA
        'E1:1D:4D:04:F6:49:1D:E9:89:0F:7A:CA:54:F4:BB:6B:DE:D9:FE:DA:F5:30:5E:F7:B8:F7:D1:9D:84:D6:03:CC',
      ],
    },
  },
];

export function GET() {
  return NextResponse.json(ASSET_LINKS, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
