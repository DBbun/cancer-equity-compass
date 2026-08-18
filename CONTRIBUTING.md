# Contributing

The Auditor is an early research prototype. Contributions should preserve its
privacy-first, browser-only default and its distinction between a review signal
and a causal or clinical conclusion.

## Development

1. Install a current Node.js release.
2. Run `npm test`.
3. Serve the repository root with any static web server.
4. Exercise all five modules with at least one synthetic scenario.

No build step is required. Avoid adding third-party runtime dependencies unless
they materially improve reproducibility, accessibility, or interoperability.

## Pull requests

Describe the intended research use, tests performed, and any change to the data
contract. Changes to metrics must include a test and a plain-language definition.
Never commit participant-level or controlled-access data, credentials, access
tokens, or derived files that could enable re-identification.
