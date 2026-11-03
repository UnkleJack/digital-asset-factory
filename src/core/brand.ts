// The suite's name, set by the owner on 2026-11-03 (see CONSTITUTION.md). Every user-facing
// mention of the app's name reads from here; do not type the name anywhere else.
//
// Asset Foundry is the suite. The factory (Digital Asset Factory, DAF) is its production engine.
// Internal identifiers keep the old "digital-asset-factory" spelling on purpose: the package name,
// the macOS Keychain service that holds API keys, the data folder and applied migrations. Renaming
// those would lose saved keys or stop the app from starting.

export const SUITE_NAME = 'Asset Foundry';
export const SUITE_SHORT_NAME = 'Foundry';
export const ENGINE_NAME = 'Digital Asset Factory';
export const ENGINE_SHORT_NAME = 'DAF';
/** Shown under the arcade marquee. */
export const SUITE_TAGLINE = `A ${ENGINE_NAME.toUpperCase()} PRODUCTION`;
