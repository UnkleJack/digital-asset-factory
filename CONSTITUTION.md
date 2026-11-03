# Constitution

Standing rules for this codebase, set by the owner. They outrank other docs and plans. Change them only when the owner says so.

## Article 1: Names

Adopted 2026-11-03.

1. **The suite is called Asset Foundry.** That is the canonical name of the whole program suite. Short form: **Foundry**.
2. **The engine is the factory.** The production engine inside the suite is the factory: **Digital Asset Factory**, short form **DAF**. That covers making, checking, packing and publishing assets.
3. **The name is hardcoded in one place,** `src/core/brand.ts` (`SUITE_NAME`, `SUITE_SHORT_NAME`, `ENGINE_NAME`, `ENGINE_SHORT_NAME`). Code that shows the app's name to a person imports it from there and never types it out. The only exceptions are files that cannot import code: `web/index.html`, the start scripts and the docs.
4. **Internal identifiers keep the old spelling.** Do not rename these: the npm package name `digital-asset-factory`, the macOS Keychain service `digital-asset-factory` that holds saved API keys, the data folder, and any migration that has already been applied. Renaming them would lose saved keys or stop the app from starting.
