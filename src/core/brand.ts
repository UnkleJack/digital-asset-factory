// The suite's name, set by the owner on 2026-11-03 (see CONSTITUTION.md). Every user-facing
// mention of the app's name reads from here; do not type the name anywhere else.
//
// Asset Foundry is the suite. HAPPY DAFFY is its arcade game. The factory (Digital Asset Factory, DAF) is its production engine.
// Internal identifiers keep the old "digital-asset-factory" spelling on purpose: the package name,
// the macOS Keychain service that holds API keys, the data folder and applied migrations. Renaming
// those would lose saved keys or stop the app from starting.

export const SUITE_NAME = 'Asset Foundry';
export const SUITE_SHORT_NAME = 'Foundry';
export const ENGINE_NAME = 'Digital Asset Factory';
export const ENGINE_SHORT_NAME = 'DAF';
/** The arcade game inside the suite (the /arcade cabinet). Always written in capitals. Named 2026-11-03. */
export const ARCADE_GAME_NAME = 'HAPPY DAFFY';
/** Shown under the arcade marquee. */
export const ARCADE_TAGLINE = `AN ${SUITE_NAME.toUpperCase()} PRODUCTION`;
