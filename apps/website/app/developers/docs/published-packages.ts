/**
 * The packages that are genuinely published, and the evidence that says so.
 *
 * The docs tests used to hard-code "only @banzami/sdk is published, every other
 * install command is fake". That was true, and then a second package was
 * published and nine tests failed for describing yesterday.
 *
 * A package earns a place here only when a clean-room install from the public
 * registry — outside every Banzami repository, with no path or git dependency —
 * has been proven and recorded. The rule that never changes is the one below it:
 * anything NOT on this list must carry no install command anywhere.
 */
export const PUBLISHED_PACKAGES: {
  name: string;
  install: string;
  registry: string;
  evidence: string;
}[] = [
  {
    name: '@banzami/sdk',
    install: 'npm install @banzami/sdk',
    registry: 'npm',
    evidence: 'evidence/assurance/sdk/cap-sdk-001-public-install.json',
  },
  {
    name: 'banzami_client',
    install: 'dart pub add banzami_client',
    registry: 'pub.dev',
    evidence: 'evidence/assurance/sdk/cap-sdk-002-public-install.json',
  },
];

/**
 * Install commands that must never appear: they name a package no registry has,
 * so a developer following one gets an error that looks like their mistake.
 */
export const FAKE_INSTALL_COMMANDS = [
  'pip install banzami',
  'composer require banzami/sdk',
  'go get github.com/banzami',
  'pod "Banzami"',
  // The internal application framework is deliberately never published
  // (Banzami ADR-053); an install command for it would send a developer to a
  // package that is not theirs to use.
  'pub add banzami_flutter',
  'dart pub add banzami_flutter',
];
