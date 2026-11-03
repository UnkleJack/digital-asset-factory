# **ASSET FOUNDRY (DAF)**

## **UX Functional Specification**

**Document purpose:** Implementation handoff for an AI coding/design model  
**Document type:** UX and functional behavior specification  
**Design responsibility:** This document defines screens, navigation, interactions, states, data requirements, and business rules. It does not prescribe a detailed visual design.

### **Specification conventions**

- **LOCKED:** Explicitly established in the project brief. Do not redesign.

- **PROPOSED:** A recommended implementation approach, not yet an approved requirement.

- **OPEN:** Requires a decision before the behavior can be finalized.

- **TBD:** A required value or rule has not been supplied. Do not invent a production value.

### **Product scope**

Asset Foundry is a GUI for a modular digital-asset production pipeline.

Initial production scope:

- Mandala packs.

- All asset types and production capabilities already incorporated into the existing project must remain supported.

- Existing production modules must not be discarded or hardwired to the mandala workflow.

Future modular extensions:

- 8-bit sprite production.

- 16-bit sprite production.

- Unity asset pipeline.

The application must accommodate swappable production modules without requiring the core navigation, character, world, task, QA, or progression systems to be redesigned.

The three selectable characters are:

1.  IDE

2.  AI Chatbot

3.  DAF

The application uses an old-school arcade cabinet interaction model. Its interface must remain dark, with CRT-style screens, pixel fonts, a cabinet bezel, and joystick/button interaction. Bright white backgrounds are prohibited.

# **A. SCREEN INVENTORY**

| **\#** | **Screen / State**        | **Purpose**                                                                                                                                           |
|--------|---------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1      | Insert Coin / Attract     | Entry state that invites the user into Asset Foundry.                                                                                                 |
| 2      | Start Gate                | Receives the Start action and checks whether sufficient credits are available.                                                                        |
| 3      | Title Screen              | Main title screen with a continuously sideways-scrolling high-score banner.                                                                           |
| 4      | Character Select          | Selects IDE, AI Chatbot, or DAF as the active character.                                                                                              |
| 5      | Worlds                    | Displays projects available to the selected character, ordered by proximity to the next milestone.                                                    |
| 6      | World Detail              | Displays a selected project's progress, next milestone, and applicable open tasks.                                                                    |
| 7      | Task Workspace            | Provides the working interface for a selected production task and its associated asset module.                                                        |
| 8      | QA Review                 | Reviews an asset and provides Approve, Reject, and Delete actions.                                                                                    |
| 9      | Pack / Pack Pool          | Displays pack contents and completion/finalization status.                                                                                            |
| 10     | Leaderboards              | Displays Finished, Rejected Well, and asset-type leaderboards, plus the last three shipped assets.                                                    |
| 11     | Codex / Quest Log         | Displays character progression, stats, XP, exploration quests, and recorded discoveries.                                                              |
| 12     | Bin                       | Holds assets sent to the bin rather than permanently deleted.                                                                                         |
| 13     | Global Interaction States | Shared states and overlays: loading, errors, low credits, zero-credit lock, deletion confirmation, review validation, and laziness-failsafe friction. |

The shared cabinet frame, credit meter, and navigation controls are persistent interface components rather than separate screens.

# **B. PER-SCREEN SPEC**

## **B0. Shared application frame**

**User goal:** Maintain a consistent arcade interface and provide access to essential status information and navigation.

### **Elements, top to bottom**

| **Element**          | **Type**                  | **Label / Content**                                       | **States**                     |
|----------------------|---------------------------|-----------------------------------------------------------|--------------------------------|
| Marquee              | Static header             | ASSET FOUNDRY / DAF                                       | Normal, loading                |
| Cabinet bezel        | Structural container      | Frames the active CRT-style screen                        | Normal                         |
| Screen title         | Text                      | Current screen name                                       | Normal                         |
| Credits meter        | Persistent status display | CREDITS: N                                                | Normal, low, zero, unavailable |
| Character indicator  | Status display            | Current character: IDE / AI CHATBOT / DAF                 | Selected, unselected           |
| Secondary navigation | Navigation control        | Required destinations: Worlds, Packs, Leaderboards, Codex | Active, inactive, unavailable  |
| Main content area    | Screen container          | Current screen content                                    | Normal, loading, empty, error  |
| Arcade controls      | Input affordance          | Joystick and action buttons                               | Enabled, disabled, focused     |

**Important navigation constraint:** The exact placement and presentation of the secondary navigation are not established. The application must provide access to the listed destinations, but whether this is implemented as tabs, a menu, or another arcade-style navigation mechanism remains an open question.

### **Shared actions**

- Selecting a navigation destination opens its corresponding screen.

- Selecting a world opens World Detail.

- Selecting a task opens Task Workspace.

- Selecting a reviewed asset opens QA Review.

- Returning to the previous screen must preserve the user's current context where practical.

### **Data sources**

- Credits meter: ProviderLimit records and the resolved credit calculation.

- Character indicator: Current Character selection.

- Navigation: Application screen state.

- Marquee: Static application configuration.

## **B1. Insert Coin / Attract**

**Single user goal:** Enter the application.

### **Elements, top to bottom**

| **Element**        | **Type**               | **Label / Content**     | **States**                     |
|--------------------|------------------------|-------------------------|--------------------------------|
| Cabinet marquee    | Header                 | ASSET FOUNDRY           | Normal                         |
| Main title         | Text                   | ASSET FOUNDRY           | Normal                         |
| Insert Coin prompt | Primary button / input | INSERT COIN             | Available, focused             |
| Credit indicator   | Status display         | CREDITS: N              | Normal, low, zero, unavailable |
| Start instruction  | Instruction text       | INSERT COIN TO CONTINUE | Normal                         |

### **Actions and destinations**

- **INSERT COIN:** Advances to Start Gate.

- No production task is started from this screen.

### **States**

**Normal:** Insert Coin prompt is available.

**Low credits:** Display the low-credit warning while retaining the entry interaction.

**Zero credits:** Entry may still proceed to Start Gate, but Start remains locked there.

**Loading:** Display a loading indicator while initializing application state.

**Error:** Display a recoverable initialization error if required application state cannot be loaded.

### **Data shown and sources**

- Credits: Current resolved N.

- Application title: Static application configuration.

**OPEN:** The meaning of Insert Coin is unclear. It could be a purely thematic interaction, consume an earned credit, or represent a real payment mechanism. The recommended interpretation is a thematic navigation action only. It must not change the provider-derived credit balance unless explicitly decided otherwise.

## **B2. Start Gate**

**Single user goal:** Start the application when usable credits are available.

### **Elements, top to bottom**

| **Element**      | **Type**         | **Label / Content**                | **States**          |
|------------------|------------------|------------------------------------|---------------------|
| Start prompt     | Primary button   | PRESS START                        | Enabled, locked     |
| Credit meter     | Status display   | CREDITS: N                         | Normal, low, zero   |
| Lock explanation | Status text      | START LOCKED: NO AVAILABLE CREDITS | Visible when locked |
| Return control   | Secondary button | BACK                               | Available           |

### **Actions and destinations**

- **PRESS START:** Opens Title Screen if N is greater than zero.

- **PRESS START when N = 0:** No transition. Start remains locked.

- **BACK:** Returns to Insert Coin / Attract.

### **States**

**Normal:** Start enabled.

**Low credits:** Start remains enabled, but the warning is visible.

**Zero credits:** Start disabled. Show the lock explanation.

**Provider status unavailable:** The application cannot establish whether usable credits exist. Display an unavailable status rather than silently displaying an invented balance.

### **Data sources**

- N: Live ProviderLimit calculation.

- Start eligibility: Resolved N.

- Provider status: Latest provider telemetry.

## **B3. Title Screen**

**Single user goal:** Enter the character-selection stage.

### **Elements, top to bottom**

| **Element**     | **Type**                  | **Label / Content**          | **States**                       |
|-----------------|---------------------------|------------------------------|----------------------------------|
| Title           | Text                      | ASSET FOUNDRY                | Normal                           |
| Hi-score banner | Horizontal scrolling text | Current high-score entries   | Scrolling, reduced-motion static |
| Main action     | Primary button            | START                        | Enabled, unavailable             |
| Credits meter   | Status display            | CREDITS: N                   | Normal, low, zero                |
| Navigation hint | Instruction text          | SELECT CHARACTER TO CONTINUE | Normal                           |

### **Actions and destinations**

- **START:** Opens Character Select.

- High-score banner is informational; selecting an entry does not change application state.

### **States**

**Normal:** Hi-score banner scrolls sideways.

**Reduced motion:** Banner remains readable without continuous scrolling.

**Empty leaderboard:** Show an empty/high-score placeholder rather than fabricated player entries.

**Zero credits:** Display the credit warning. The initial Start Gate restriction still applies. Behavior if credits reach zero after entering the application requires clarification.

### **Data sources**

- High-score banner: Leaderboard records.

- Credits: ProviderLimit calculation.

## **B4. Character Select**

**Single user goal:** Choose the character whose open work the user intends to explore.

### **Elements, top to bottom**

| **Element**        | **Type**               | **Label / Content**         | **States**              |
|--------------------|------------------------|-----------------------------|-------------------------|
| Screen heading     | Text                   | CHOOSE CHARACTER            | Normal                  |
| Character option 1 | Selectable card/button | IDE                         | Available, selected     |
| Character option 2 | Selectable card/button | AI CHATBOT                  | Available, selected     |
| Character option 3 | Selectable card/button | DAF                         | Available, selected     |
| Character stats    | Status panel           | EYE, CRAFT, TASTE, PATIENCE | Populated, loading      |
| Continue action    | Primary button         | ENTER WORLDS                | Enabled after selection |
| Back action        | Secondary button       | BACK                        | Available               |

### **Actions and destinations**

- Selecting IDE establishes IDE as the active character.

- Selecting AI Chatbot establishes AI Chatbot as the active character.

- Selecting DAF establishes DAF as the active character.

- **ENTER WORLDS:** Opens Worlds for the selected character.

- **BACK:** Returns to Title Screen.

### **States**

**Normal:** All three character choices are selectable.

**No open tasks:** A character can still be selected, but Worlds displays the appropriate empty state.

**Loading:** Character progression and stats are loaded.

**Error:** Display a recoverable error if character data cannot be retrieved.

### **Data shown and sources**

- Character identities: Character records.

- Stats: Character progression data.

- XP/level, if displayed: Character and XPEvent records.

**LOCKED RULE:** Character selection determines which worlds are visible. A character must never see or enter a world unless it has actual open tasks associated with that world.

## **B5. Worlds**

**Single user goal:** Select the project closest to its next milestone that has open work for the active character.

### **Elements, top to bottom**

| **Element**          | **Type**              | **Label / Content**        | **States**                |
|----------------------|-----------------------|----------------------------|---------------------------|
| Heading              | Text                  | WORLDS                     | Normal                    |
| Active character     | Status display        | Current character name     | Selected                  |
| World list           | Repeating world cards | Available worlds/projects  | Populated, empty, loading |
| World name           | Text                  | Project name               | Normal                    |
| Progress bar         | Progress indicator    | Project/milestone progress | Zero, partial, complete   |
| Tasks-left indicator | Numeric status        | TASKS LEFT: N              | Numeric                   |
| Next milestone       | Text                  | NEXT: \[Milestone Name\]   | Named, unavailable        |
| World entry action   | Button                | ENTER WORLD                | Enabled                   |

### **Actions and destinations**

- Selecting a world opens World Detail.

- Switching characters returns to Character Select and reloads the eligible world list.

- Back returns to Character Select.

### **Ordering rules**

**LOCKED:**

- Only worlds with actual open tasks for the active character are displayed.

- Worlds are sorted by least remaining work to the next milestone.

- The closest milestone appears first.

- Each world displays a progress bar, tasks remaining, and its next milestone.

### **States**

**Normal:** Display eligible worlds in ascending remaining-work order.

**Empty:** Display a clear message that the selected character has no open worlds/tasks.

**Loading:** Display world-list loading state.

**Error:** Display an error if project/task relationships cannot be resolved.

**Low credits:** Show the persistent warning.

**Zero credits:** Display status, but do not invent additional world restrictions beyond the Start lock. Whether the user can continue working in an existing session is an open question.

### **Data shown and sources**

- World names and project identities: World records.

- Character eligibility: Character-to-open-Task relationships.

- Tasks left: Open Task records.

- Next milestone: Milestone records.

- Progress: Completed versus total milestone-related work.

- Sort order: Remaining effort calculation.

## **B6. World Detail**

**Single user goal:** Identify and open the next appropriate task in the selected project.

### **Elements, top to bottom**

| **Element**      | **Type**            | **Label / Content**                   | **States**              |
|------------------|---------------------|---------------------------------------|-------------------------|
| Breadcrumb       | Navigation text     | WORLDS / \[WORLD NAME\]               | Normal                  |
| World heading    | Text                | World/project name                    | Normal                  |
| World progress   | Progress bar        | Overall or next-milestone progress    | Zero, partial, complete |
| Next milestone   | Status panel        | NEXT MILESTONE: \[Name\]              | Open, complete          |
| Tasks-left count | Numeric status      | TASKS LEFT: N                         | Numeric                 |
| Open task list   | Repeating task rows | Tasks available to active character   | Populated, empty        |
| Task description | Text                | Task title and description            | Normal                  |
| Task difficulty  | Status indicator    | LOW / MEDIUM / HIGH, where applicable | Normal                  |
| Task action      | Button              | OPEN TASK                             | Available               |
| Back action      | Secondary button    | BACK TO WORLDS                        | Available               |

### **Actions and destinations**

- **OPEN TASK:** Opens Task Workspace.

- **BACK TO WORLDS:** Returns to Worlds.

- Completing a task updates its world and milestone status.

### **States**

**Normal:** List eligible open tasks.

**Empty:** No open tasks remain for this character in the selected world. The world should no longer be accessible from the active character's Worlds list once the eligibility condition is no longer met.

**Loading:** Load tasks and milestones.

**Error:** Report unresolved task or milestone data.

### **Data shown and sources**

- World identity: World.

- Task rows: Task records belonging to the world and available to the active character.

- Milestone: Milestone.

- Difficulty: Task.

- Progress: Milestone and Task completion states.

## **B7. Task Workspace**

**Single user goal:** Work on the selected task and produce or advance its associated digital asset.

### **Elements, top to bottom**

| **Element**      | **Type**                  | **Label / Content**                | **States**                         |
|------------------|---------------------------|------------------------------------|------------------------------------|
| Breadcrumb       | Navigation text           | WORLDS / \[WORLD\] / \[TASK\]      | Normal                             |
| Task heading     | Text                      | Task name                          | Normal                             |
| Task description | Text                      | Task requirements                  | Normal                             |
| Difficulty       | Status indicator          | LOW / MEDIUM / HIGH                | Normal                             |
| Asset type       | Status indicator          | Current asset type/module          | Normal                             |
| Work surface     | Module-provided interface | Task-specific production workspace | Active, loading, error             |
| Asset status     | Status display            | Current asset state                | Available, submitted for QA, etc.  |
| QA action        | Button                    | SUBMIT FOR QA / REVIEW             | Enabled when an asset is available |
| Back action      | Secondary button          | BACK TO WORLD                      | Available                          |

### **Actions and destinations**

- Task-specific controls are supplied by the currently active production module.

- **SUBMIT FOR QA / REVIEW:** Opens QA Review for the associated asset.

- **BACK TO WORLD:** Returns to World Detail.

- Task completion updates the associated project/milestone data when the applicable completion condition is met.

### **Module requirements**

The core Task Workspace must not be hardcoded exclusively for mandala production.

It must accommodate the existing incorporated asset modules and allow future modules to provide their own task-specific working surfaces.

Future planned modules:

- 8-bit sprites.

- 16-bit sprites.

- Unity asset pipeline.

These are future extensions, not requirements to implement all production interfaces in the first playable release.

### **States**

**Normal:** Display current task and module-provided work surface.

**No asset yet:** Display the task's working state without offering QA submission.

**Loading:** Load task data and its associated module.

**Module error:** Display a module-specific recoverable error without losing the task context.

**Low credits:** Display persistent warning.

**Zero credits:** Exact behavior during an active task is unresolved.

### **Data shown and sources**

- Task requirements: Task.

- Asset type/module: Task and associated asset.

- Asset preview/status: Asset.

- Progress: Task and Milestone.

- Module interface: Active production module.

**OPEN:** The precise task-generation controls, input fields, preview tools, and task submission mechanics depend on existing production modules and are not defined in this brief. Do not invent a universal generation workflow.

## **B8. QA Review**

**Single user goal:** Make a deliberate decision about the quality and disposition of an asset.

### **Elements, top to bottom**

| **Element**            | **Type**              | **Label / Content**                  | **States**                                     |
|------------------------|-----------------------|--------------------------------------|------------------------------------------------|
| Breadcrumb             | Navigation text       | WORLD / TASK / QA                    | Normal                                         |
| Asset heading          | Text                  | Asset name/type                      | Normal                                         |
| Asset preview          | Media/display area    | Current asset                        | Available, loading, failed                     |
| Asset context          | Information panel     | Task requirements and asset metadata | Populated                                      |
| QA checklist           | Checklist             | QA criteria                          | Complete, incomplete                           |
| Optional approval note | Text field            | WHAT I LIKED                         | Empty, populated                               |
| Rejection reason       | Multi-line text field | WHY REJECTED                         | Hidden until needed, empty, populated, invalid |
| Approve action         | Primary button        | APPROVE                              | Available, held, disabled                      |
| Reject action          | Secondary button      | REJECT                               | Available, validation failed                   |
| Delete action          | Destructive button    | DELETE                               | Available, confirmation required               |
| Back action            | Secondary button      | BACK                                 | Available                                      |

### **APPROVE behavior**

**LOCKED:**

- The user may approve an asset.

- An optional note records what the user liked.

- Approval includes a QA checklist.

Actions:

1.  User completes or reviews the checklist.

2.  User may enter a WHAT I LIKED note.

3.  User selects APPROVE.

4.  Asset receives an approved QA state.

5.  The asset becomes eligible for subsequent finalization/pack-pool processing according to the pack workflow.

Validation:

- The exact checklist completion requirement is unresolved.

- The optional note must never be required for normal approval.

- If the laziness failsafe is active, additional friction may be applied before approval.

### **REJECT behavior**

**LOCKED:**

- Rejection requires a specific reason.

- The reason must contain at least two sentences.

- Vague reasons fail validation.

- Five qualifying rejections earn one credit.

Actions:

1.  User selects REJECT.

2.  The rejection-reason field becomes active/required.

3.  The system validates the reason.

4.  A qualifying rejection is recorded.

5.  The asset receives a rejected state.

6.  The review is recorded for the Rejected Well leaderboard and credit-earning calculation, subject to the applicable qualification rules.

Validation:

- Fewer than two sentences: reject submission blocked.

- Empty reason: reject submission blocked.

- Vague reason: reject submission blocked.

- Valid reason: rejection can be committed.

The exact test for vagueness is an open question. Two-sentence validation alone is insufficient to establish specificity.

### **DELETE behavior**

**LOCKED:**

- Deletion requires no reason.

- Deletion earns no credits.

- Deletion does not count as a rejection.

- The user chooses between sending the asset to the bin or permanently deleting it.

Actions:

1.  User selects DELETE.

2.  System presents deletion destination options.

3.  User selects BIN or PERMANENT DELETE.

4.  The corresponding deletion action is executed.

5.  The QA Review screen updates or returns to its parent context.

Permanent deletion must have an explicit confirmation step.

A delete action must never create a qualifying rejection or an entry in the rejection credit count.

### **QA screen states**

**Normal:** Asset preview and review actions available.

**Checklist incomplete:** Display the incomplete checklist state. Exact approval-blocking behavior requires confirmation.

**Reject validation failure:** Keep the user on QA Review, preserve the reason text, and identify the failed requirement.

**Asset preview unavailable:** Display an error state while retaining review metadata.

**Low credits:** Show persistent warning.

**Active laziness friction:** Apply the appropriate interaction friction without changing the asset or its underlying correctness.

### **Data shown and sources**

- Asset preview: Asset storage/location.

- Task requirements: Task.

- Checklist: QA checklist configuration.

- Approval note: Review.

- Rejection reason: Review.

- Review time: Review timestamps.

- Failsafe signals: Review history and LazinessSignal records.

- Credit reward: CreditLedgerEntry.

## **B9. Pack / Pack Pool**

**Single user goal:** Inspect pack completion and finalize qualifying asset packs.

### **Elements, top to bottom**

| **Element**             | **Type**                  | **Label / Content** | **States**                       |
|-------------------------|---------------------------|---------------------|----------------------------------|
| Heading                 | Text                      | PACKS / PACK POOL   | Normal                           |
| Pack list               | Repeating pack rows/cards | Available packs     | Populated, empty                 |
| Pack name               | Text                      | Pack identity       | Normal                           |
| Asset count             | Numeric status            | ITEMS: N            | Numeric                          |
| Pack status             | Status display            | Current pack state  | In progress, eligible, finalized |
| Ready-to-sell indicator | Status display            | READY TO SELL       | Eligible, not eligible           |
| Pack contents           | Asset list                | Included assets     | Populated, empty                 |
| Finalize action         | Button                    | FINALIZE PACK       | Enabled when eligible            |
| Back action             | Secondary button          | BACK                | Available                        |

### **Actions and destinations**

- Selecting a pack opens its details.

- Finalizing an eligible pack commits its finalized status.

- A qualifying finished pack contributes to the pack-reward counter.

- The finalized pack enters the pool used by the Finished leaderboard.

### **Locked qualification rule**

A pack qualifies toward the special pack credit reward when:

- It contains at least 15 items.

- It is ready to sell.

- It is finalized/finished according to the resolved pack-completion workflow.

Every three qualifying packs trigger the configured pack-completion bonus.

The bonus quantity is TBD.

### **States**

**Normal:** Display packs and their completion status.

**Empty:** No packs exist or no packs are available to the current view.

**Not eligible:** Display why a pack is not yet ready to sell, where that information is available.

**Loading:** Pack contents and status are being retrieved.

**Error:** Display pack-data or finalization failure without falsely marking a pack finished.

**Low credits:** Persistent warning.

### **Data shown and sources**

- Pack names/status: Pack.

- Asset count: Pack membership.

- Ready-to-sell status: Pack completion rules.

- Asset QA state: Review and Asset.

- Finished status: Pack finalization.

- Reward counter: CreditLedgerEntry and qualifying Pack records.

**OPEN:** Pack assembly, eligibility, and finalization details are not fully defined. Do not invent packing, pricing, export, or marketplace capabilities.

## **B10. Leaderboards**

**Single user goal:** Review production accomplishments, high-quality rejections, and recent shipped work.

### **Elements, top to bottom**

| **Element**            | **Type**           | **Label / Content**            | **States**                  |
|------------------------|--------------------|--------------------------------|-----------------------------|
| Heading                | Text               | LEADERBOARDS                   | Normal                      |
| Finished board         | Score table        | FINISHED                       | Populated, empty            |
| Rejected Well board    | Score table        | REJECTED WELL                  | Populated, empty            |
| Asset-type selector    | Tabs/filter        | Per-asset-type boards          | Selected, unselected        |
| Asset-type board       | Score table        | Selected asset type            | Populated, empty            |
| Recent shipped heading | Text               | LAST 3 SHIPPED                 | Normal                      |
| Recent shipped entries | Three-item display | Latest three shipped assets    | Populated, fewer than three |
| Suggestion label       | Text               | MAKE SOMETHING DIFFERENT TODAY | Normal                      |
| Back action            | Secondary button   | BACK                           | Available                   |

### **Locked leaderboard definitions**

**Finished:  
**An asset or pack qualifies only when it is:

- QA'd.

- Finalized.

- In the pack pool.

Do not count assets that satisfy only some of these conditions.

**Rejected Well:  
**Displays high-quality rejection work. A qualifying rejection must have a specific reason of at least two sentences.

Exact ranking/scoring is unresolved.

**Per-asset-type:  
**Provides separate leaderboard views by asset type.

**Last 3 shipped:  
**Displays the latest three shipped assets as a hint intended to encourage variety.

The three most recent shipped items must be selected by actual shipment/finalization timestamps, not by a guessed or manually curated sequence.

### **Actions and destinations**

- Select asset type to display the corresponding leaderboard.

- Selecting a leaderboard entry may open its associated asset or review record if that navigation is supported.

- No leaderboard action may modify the underlying QA or pack status.

### **States**

- Empty leaderboard.

- Partially populated last-three-shipped area.

- Loading.

- Data retrieval error.

### **Data shown and sources**

- Finished entries: Asset, Review, Pack.

- Rejected Well entries: Review.

- Asset-type board: Asset.asset_type.

- Latest shipped three: Finalized/shipped Pack and Asset records.

## **B11. Codex / Quest Log**

**Single user goal:** Understand character progression and discover opportunities to develop app knowledge and review skills.

### **Elements, top to bottom**

| **Element**           | **Type**         | **Label / Content**                        | **States**                   |
|-----------------------|------------------|--------------------------------------------|------------------------------|
| Heading               | Text             | CODEX / QUEST LOG                          | Normal                       |
| Active character      | Status display   | Character name                             | Selected                     |
| XP total              | Numeric status   | CURRENT XP                                 | Numeric                      |
| Character progression | Progress display | Current progression state                  | Partial, complete            |
| EYE                   | Stat display     | EYE                                        | Numeric                      |
| CRAFT                 | Stat display     | CRAFT                                      | Numeric                      |
| TASTE                 | Stat display     | TASTE                                      | Numeric                      |
| PATIENCE              | Stat display     | PATIENCE                                   | Numeric                      |
| Exploration quests    | Quest list       | Available/completed exploration activities | Available, completed         |
| Difficulty            | Status indicator | LOW / MEDIUM / HIGH                        | Normal                       |
| Tab knowledge         | Progress display | Learning each tab                          | Unstarted, partial, complete |
| Cross-tab learning    | Progress display | Understanding how tabs affect each other   | Unstarted, partial, complete |
| Quest details         | Text             | Quest objective/status                     | Normal                       |
| Back action           | Secondary button | BACK                                       | Available                    |

### **Locked progression rules**

XP is earned through exploring the application.

Explicit XP-related activities include:

- Low-difficulty exploration tasks.

- Medium-difficulty exploration tasks.

- High-difficulty exploration tasks.

- Learning individual tabs.

- Learning how tabs affect each other.

The four character stats are:

- EYE

- CRAFT

- TASTE

- PATIENCE

A codex/quest log must record exploration and progression activity.

### **Actions and destinations**

- Opening a quest displays its details.

- Completing an eligible exploration activity records an XPEvent.

- Progression updates the active character's XP and applicable stats according to the finalized progression rules.

### **States**

- New character/no XP.

- In-progress progression.

- Completed quest.

- No available quests.

- Loading.

- Error.

### **Data shown and sources**

- XP total: XPEvent aggregation.

- Character statistics: Character.

- Quest status: Exploration activity records.

- Tab learning: Recorded exploration XPEvents.

- Cross-tab learning: Recorded exploration XPEvents.

**OPEN:** XP awards, stat-growth formulas, levels, and quest-completion criteria are not supplied.

## **B12. Bin**

**Single user goal:** Review assets previously deleted using the bin option.

### **Elements, top to bottom**

| **Element**        | **Type**         | **Label / Content**             | **States**       |
|--------------------|------------------|---------------------------------|------------------|
| Heading            | Text             | BIN                             | Normal           |
| Deleted asset list | Repeating rows   | Binned assets                   | Populated, empty |
| Asset identity     | Text             | Name/type                       | Normal           |
| Deletion metadata  | Status display   | Deletion date/reasonless status | Available        |
| Back action        | Secondary button | BACK                            | Available        |

### **Actions and destinations**

- Display assets sent to the bin from QA Review.

- Any restore or permanent-delete operation is unresolved and must not be invented as a shipped requirement.

### **States**

- Empty bin.

- Populated bin.

- Loading.

- Retrieval error.

### **Data shown and sources**

- Deleted assets: Asset records with bin disposition.

- Deletion metadata: Review/disposition record.

## **B13. Global Interaction States**

These states can appear over or within the screens above.

| **State**                     | **Required behavior**                                                                                    |
|-------------------------------|----------------------------------------------------------------------------------------------------------|
| Low credits                   | Visible warning. Exact warning threshold is TBD.                                                         |
| Zero credits                  | Start Gate locks Start.                                                                                  |
| Provider unavailable          | Display unavailable/unknown status instead of inventing N.                                               |
| Loading                       | Show the relevant loading indicator and preserve the current screen context.                             |
| Error                         | Explain the failed operation and provide a safe path back or retry where supported.                      |
| Rejection invalid             | Prevent submission, retain text, identify the validation failure.                                        |
| Permanent delete confirmation | Require explicit confirmation before permanent deletion.                                                 |
| Laziness friction             | Increase interaction friction without scolding or altering asset correctness.                            |
| Reduced motion                | Suppress unnecessary CRT and interface movement while retaining the applicable interaction requirements. |

# **C. DATA MODEL**

The following definitions describe the minimum logical data needed by the UX. Field types are conceptual and can be mapped to the chosen database.

## **C1. Character**

| **Field**      | **Type**       | **Description**                       |
|----------------|----------------|---------------------------------------|
| character_id   | ID             | Unique character identifier           |
| character_type | Enum           | IDE, AI_CHATBOT, DAF                  |
| display_name   | String         | Character display name                |
| xp_total       | Integer        | Accumulated XP                        |
| level          | Integer or TBD | Progression level, if levels are used |
| eye            | Numeric        | EYE stat                              |
| craft          | Numeric        | CRAFT stat                            |
| taste          | Numeric        | TASTE stat                            |
| patience       | Numeric        | PATIENCE stat                         |
| created_at     | Timestamp      | Record creation                       |
| updated_at     | Timestamp      | Last update                           |

**Relationships:**

- Character has many assigned/associated Tasks.

- Character has many XPEvents.

- Character has many LazinessSignals.

- Character is associated with its own progression state.

The scope of character progression (per character or shared across the user account) requires clarification.

## **C2. World**

A World represents a project.

| **Field**         | **Type**  | **Description**        |
|-------------------|-----------|------------------------|
| world_id          | ID        | Unique identifier      |
| name              | String    | Project name           |
| description       | Text      | Project description    |
| status            | Enum      | Project state          |
| next_milestone_id | ID        | Current next milestone |
| created_at        | Timestamp | Creation               |
| updated_at        | Timestamp | Last update            |

**Relationships:**

- World has many Milestones.

- World has many Tasks.

- World is visible to a Character only when that Character has an actual open Task in it.

The character/world eligibility rule must be based on real Task records, not a static visibility preference.

## **C3. Milestone**

| **Field**    | **Type**  | **Description**                              |
|--------------|-----------|----------------------------------------------|
| milestone_id | ID        | Unique identifier                            |
| world_id     | ID        | Parent World                                 |
| name         | String    | Milestone name                               |
| sequence     | Integer   | Milestone ordering                           |
| status       | Enum      | Open, completed, or other finalized statuses |
| completed_at | Timestamp | Completion timestamp                         |
| created_at   | Timestamp | Creation timestamp                           |

**Relationships:**

- Milestone belongs to one World.

- Milestone has many Tasks.

## **C4. Task**

| **Field**        | **Type**    | **Description**                                               |
|------------------|-------------|---------------------------------------------------------------|
| task_id          | ID          | Unique identifier                                             |
| world_id         | ID          | Parent World                                                  |
| milestone_id     | ID          | Associated Milestone                                          |
| character_id     | ID          | Character responsible for or associated with the Task         |
| title            | String      | Task title                                                    |
| description      | Text        | Task requirements                                             |
| asset_type       | String/Enum | Asset type                                                    |
| module_id        | ID/String   | Associated production module                                  |
| difficulty       | Enum        | LOW, MEDIUM, HIGH                                             |
| status           | Enum        | OPEN, IN_PROGRESS, COMPLETE, BLOCKED, or finalized equivalent |
| estimated_effort | Numeric     | Work estimate used for milestone ordering                     |
| remaining_effort | Numeric     | Current remaining work estimate                               |
| created_at       | Timestamp   | Creation                                                      |
| completed_at     | Timestamp   | Completion                                                    |

**Relationships:**

- Task belongs to one World.

- Task belongs to one Milestone.

- Task is associated with a Character.

- Task may produce one or more Assets.

**OPEN:** The exact task ownership/association model requires confirmation. A direct character_id association is recommended because it makes world eligibility explicit and testable.

## **C5. Asset**

| **Field**         | **Type**    | **Description**                                                                                |
|-------------------|-------------|------------------------------------------------------------------------------------------------|
| asset_id          | ID          | Unique identifier                                                                              |
| task_id           | ID          | Source Task                                                                                    |
| asset_type        | String/Enum | Mandala, or another incorporated/future asset type                                             |
| module_id         | ID/String   | Production module                                                                              |
| name              | String      | Asset name                                                                                     |
| storage_reference | String/URI  | Asset file location                                                                            |
| preview_reference | String/URI  | Preview location                                                                               |
| status            | Enum        | Draft, pending QA, approved, rejected, binned, permanently deleted, or finalized as applicable |
| created_at        | Timestamp   | Creation                                                                                       |
| updated_at        | Timestamp   | Last change                                                                                    |
| finalized_at      | Timestamp   | Finalization timestamp, when applicable                                                        |

**Relationships:**

- Asset belongs to a Task.

- Asset has Review records.

- Asset may belong to one or more Packs, subject to pack-membership rules.

## **C6. Pack**

| **Field**     | **Type**    | **Description**                                               |
|---------------|-------------|---------------------------------------------------------------|
| pack_id       | ID          | Unique identifier                                             |
| name          | String      | Pack name                                                     |
| asset_type    | String/Enum | Pack asset type                                               |
| status        | Enum        | In progress, eligible, finalized, or other finalized statuses |
| item_count    | Integer     | Number of included items                                      |
| ready_to_sell | Boolean     | Whether the pack meets its sale-readiness condition           |
| finalized     | Boolean     | Whether the pack has been finalized                           |
| in_pack_pool  | Boolean     | Whether included in the finished pool                         |
| created_at    | Timestamp   | Creation                                                      |
| finalized_at  | Timestamp   | Finalization time                                             |

**Relationships:**

- Pack contains Assets.

- Pack contributes to qualifying pack-credit calculations.

- Pack contributes to the Finished leaderboard if all required conditions are met.

The exact relationship between Pack and Asset should support the existing production pipeline.

## **C7. Review**

| **Field**               | **Type**        | **Description**                                     |
|-------------------------|-----------------|-----------------------------------------------------|
| review_id               | ID              | Unique identifier                                   |
| asset_id                | ID              | Reviewed Asset                                      |
| character_id            | ID              | Character associated with the review, if applicable |
| outcome                 | Enum            | APPROVE, REJECT, DELETE                             |
| liked_note              | Text            | Optional approval feedback                          |
| rejection_reason        | Text            | Required for rejection                              |
| sentence_count          | Integer         | Rejection sentence count                            |
| specificity_valid       | Boolean or TBD  | Whether the reason satisfies specificity validation |
| checklist_results       | Structured data | QA checklist responses                              |
| deletion_destination    | Enum            | BIN, PERMANENT, or null                             |
| review_duration_seconds | Numeric         | Time spent reviewing                                |
| created_at              | Timestamp       | Review timestamp                                    |

**Relationships:**

- Review belongs to an Asset.

- Review produces applicable LazinessSignals.

- Qualifying Review records may contribute to credit earning and the Rejected Well leaderboard.

DELETE must never be treated as REJECT.

## **C8. CreditLedgerEntry**

| **Field**       | **Type**        | **Description**                                                  |
|-----------------|-----------------|------------------------------------------------------------------|
| ledger_entry_id | ID              | Unique identifier                                                |
| entry_type      | Enum            | PACK_BONUS, REJECTION_REWARD, adjustment, or other approved type |
| amount          | Numeric/Integer | Credit amount                                                    |
| source_type     | String          | Source entity type                                               |
| source_id       | ID              | Source entity                                                    |
| description     | Text            | Explanation                                                      |
| created_at      | Timestamp       | Entry creation                                                   |

**Relationships:**

- Pack bonuses reference qualifying Packs.

- Rejection rewards reference qualifying Review events.

- Ledger entries create an auditable history of earned rewards.

**IMPORTANT:** The relationship between earned ledger credits and live provider headroom must be resolved before implementation. They are not automatically interchangeable.

## **C9. ProviderLimit**

| **Field**              | **Type**  | **Description**                                  |
|------------------------|-----------|--------------------------------------------------|
| provider_limit_id      | ID        | Unique identifier                                |
| provider_id            | String    | Inference provider identifier                    |
| provider_name          | String    | Display name                                     |
| daily_limit            | Numeric   | Daily allowance                                  |
| daily_remaining        | Numeric   | Remaining daily allowance                        |
| rate_limit             | Numeric   | Applicable rate limit                            |
| rate_remaining         | Numeric   | Remaining rate capacity                          |
| token_window_limit     | Numeric   | Token-window limit                               |
| token_window_remaining | Numeric   | Remaining token-window capacity                  |
| guardrail_hit_count    | Integer   | Observed guardrail hits                          |
| headroom_value         | Numeric   | Normalized headroom, subject to approved formula |
| is_available           | Boolean   | Provider availability                            |
| last_synced_at         | Timestamp | Last successful telemetry update                 |
| reset_at               | Timestamp | Relevant reset time                              |

**Relationships:**

- ProviderLimit records feed the global Credits meter.

- Multiple providers contribute to the bottleneck calculation.

- The provider with the least usable normalized headroom is the bottleneck provider.

## **C10. LazinessSignal**

| **Field**       | **Type**     | **Description**                                                               |
|-----------------|--------------|-------------------------------------------------------------------------------|
| signal_id       | ID           | Unique identifier                                                             |
| character_id    | ID           | Associated Character                                                          |
| review_id       | ID           | Relevant Review, if applicable                                                |
| signal_type     | Enum         | LONG_APPROVAL_STREAK, FAST_REVIEW, EMPTY_CHECKLIST, EMPTY_NOTE, COPIED_REASON |
| observed_value  | Numeric/Text | Actual observation                                                            |
| threshold_value | Numeric/Text | Trigger threshold                                                             |
| weight          | Numeric      | Signal weight                                                                 |
| score_delta     | Numeric      | Contribution to laziness score                                                |
| active          | Boolean      | Whether signal remains relevant                                               |
| created_at      | Timestamp    | Detection timestamp                                                           |
| cooled_at       | Timestamp    | Cooldown timestamp, when applicable                                           |

**Relationships:**

- LazinessSignal records contribute to the failsafe score.

- Signals influence friction level.

- Friction is an interface behavior, not an asset-quality mutation.

## **C11. Leaderboard**

| **Field**       | **Type**    | **Description**                            |
|-----------------|-------------|--------------------------------------------|
| leaderboard_id  | ID          | Unique identifier                          |
| board_type      | Enum        | FINISHED, REJECTED_WELL, ASSET_TYPE        |
| asset_type      | String/Enum | Relevant asset type, if applicable         |
| entry_reference | ID          | Asset, Pack, or Review reference           |
| rank            | Integer     | Current rank                               |
| score           | Numeric     | Ranking value, subject to approved formula |
| recorded_at     | Timestamp   | Entry timestamp                            |

**Relationships:**

- Finished board references qualifying Packs/Assets.

- Rejected Well references qualifying Reviews.

- Asset-type boards use Asset.asset_type.

The latest-three-shipped display should be calculated from actual shipment/finalization records.

## **C12. XPEvent**

| **Field**    | **Type**    | **Description**                                                |
|--------------|-------------|----------------------------------------------------------------|
| xp_event_id  | ID          | Unique identifier                                              |
| character_id | ID          | Character receiving XP                                         |
| event_type   | Enum/String | Exploration, difficulty task, tab learning, cross-tab learning |
| source_id    | ID/String   | Source task, tab, or learning activity                         |
| difficulty   | Enum        | LOW, MEDIUM, HIGH, or null                                     |
| xp_awarded   | Integer     | Awarded XP                                                     |
| created_at   | Timestamp   | Event timestamp                                                |

**Relationships:**

- XPEvent belongs to Character.

- XPEvent contributes to Character.xp_total.

- XPEvents support quest completion and progression reporting.

# **D. RULES TABLE**

Values explicitly supplied by the project brief are marked LOCKED. Unspecified values remain TBD.

| **Rule**                       | **Formula / Threshold**                                                              | **Status**                    | **Editable?**                            |
|--------------------------------|--------------------------------------------------------------------------------------|-------------------------------|------------------------------------------|
| Character world visibility     | World is visible only if Character has at least one actual open Task in it           | LOCKED                        | No                                       |
| World ordering                 | Ascending remaining work to next milestone                                           | LOCKED                        | Formula implementation TBD               |
| Tasks left                     | Count of applicable open Tasks                                                       | LOCKED                        | No                                       |
| Bottleneck provider            | Provider with least usable normalized headroom                                       | LOCKED                        | Calculation method TBD                   |
| Credits N                      | Derived from live inference-provider headroom                                        | LOCKED                        | Formula TBD                              |
| Provider constraints           | Daily limits, rate limits, token windows, guardrail hits                             | LOCKED                        | Provider-specific                        |
| Low-credit warning             | N below configured warning threshold                                                 | LOCKED concept; threshold TBD | Yes                                      |
| Zero-credit Start              | N = 0 means Start is locked                                                          | LOCKED                        | No                                       |
| Qualifying pack size           | At least 15 items                                                                    | LOCKED                        | Recommended configurable                 |
| Pack reward frequency          | Every 3 qualifying packs                                                             | LOCKED                        | Recommended configurable                 |
| Pack reward quantity           | TBD credits per qualifying group of 3                                                | TBD                           | Yes                                      |
| Rejection qualification        | Specific reason with at least 2 sentences                                            | LOCKED                        | No                                       |
| Rejection reward frequency     | Every 5 qualifying rejections                                                        | LOCKED                        | Recommended configurable                 |
| Rejection reward amount        | +1 credit                                                                            | LOCKED                        | Yes, if desired                          |
| Delete credit reward           | 0                                                                                    | LOCKED                        | No                                       |
| Delete rejection count         | 0                                                                                    | LOCKED                        | No                                       |
| Approval note                  | Optional                                                                             | LOCKED                        | No                                       |
| QA checklist                   | Included with approval                                                               | LOCKED                        | Checklist definition TBD                 |
| Vague rejection                | Must fail validation                                                                 | LOCKED                        | Detection thresholds TBD                 |
| Laziness: approval streak      | Long streak is a signal                                                              | LOCKED concept                | Threshold TBD                            |
| Laziness: review speed         | Too-fast reviews are a signal                                                        | LOCKED concept                | Threshold TBD                            |
| Laziness: empty checklist/note | Empty review effort indicators are signals                                           | LOCKED concept                | Threshold TBD                            |
| Laziness: copied reasons       | Repeated/copy-pasted reasons are a signal                                            | LOCKED concept                | Similarity threshold TBD                 |
| Laziness score                 | Aggregate active signals                                                             | LOCKED concept                | Formula TBD                              |
| Friction escalation            | More laziness signals/score increase friction                                        | LOCKED concept                | Levels and thresholds TBD                |
| Friction mechanisms            | Shuffled order, moving buttons, forced "name one thing wrong", 5-second approve hold | LOCKED                        | Mapping TBD                              |
| Approve hold                   | 5 seconds                                                                            | LOCKED                        | Yes, but default should remain 5 seconds |
| Failsafe cooldown              | Cools down through genuine effort                                                    | LOCKED concept                | Formula TBD                              |
| Asset correctness              | Failsafe does not alter correctness/output                                           | LOCKED                        | No                                       |
| XP difficulty categories       | LOW / MEDIUM / HIGH                                                                  | LOCKED                        | No                                       |
| XP for exploration             | Award XP for exploring application, learning tabs, and learning tab relationships    | LOCKED                        | Award values TBD                         |
| Character stats                | EYE, CRAFT, TASTE, PATIENCE                                                          | LOCKED                        | No                                       |
| XP per low-difficulty task     | TBD                                                                                  | TBD                           | Yes                                      |
| XP per medium-difficulty task  | TBD                                                                                  | TBD                           | Yes                                      |
| XP per high-difficulty task    | TBD                                                                                  | TBD                           | Yes                                      |
| XP for tab learning            | TBD                                                                                  | TBD                           | Yes                                      |
| XP for cross-tab learning      | TBD                                                                                  | TBD                           | Yes                                      |
| Stat advancement               | TBD                                                                                  | TBD                           | Yes                                      |
| Finished leaderboard           | QA'd + finalized + in pack pool                                                      | LOCKED                        | No                                       |
| Rejected Well                  | Qualifying, specific 2+ sentence rejections                                          | LOCKED concept                | Ranking formula TBD                      |
| Asset-type leaderboards        | Separate by asset type                                                               | LOCKED                        | No                                       |
| Last shipped display           | Three most recent shipped assets                                                     | LOCKED                        | No                                       |

## **D1. Credit calculation**

**Required conceptual formula:**

N = bottleneck provider's usable headroom.

The system must evaluate usable headroom across applicable constraints:

- Daily limits.

- Rate limits.

- Token windows.

- Guardrail hits.

The provider with the least usable headroom determines the bottleneck.

**Implementation dependency:** These constraint measurements may use different units. They must be normalized before a meaningful numeric comparison can be made.

The exact normalization method is TBD.

The distinction between provider-derived capacity and earned reward credits is also unresolved. Do not allow internal reward credits to falsely represent increased external provider capacity.

## **D2. World ordering**

**Required ordering:**

1.  Calculate the remaining work to the next milestone for each eligible World.

2.  Sort ascending.

3.  Display the World requiring the least remaining work first.

**Recommended calculation:** Sum estimated remaining effort for applicable incomplete Tasks associated with the next milestone.

This requires a consistent task-effort unit and a defined fallback for Tasks without estimates.

Raw task count may be displayed separately but should not silently substitute for estimated effort.

## **D3. Pack reward calculation**

A qualifying pack satisfies:

- Item count \>= 15.

- Ready to sell = true.

- Finalized/finished = true.

After every three qualifying packs, award the configured bonus.

The bonus quantity and counter reset behavior are TBD.

## **D4. Rejection reward calculation**

A qualifying rejection satisfies:

- Review outcome = REJECT.

- Rejection reason is present.

- Rejection reason contains at least two sentences.

- Rejection reason passes specificity validation.

Every five qualifying rejections award +1 credit.

DELETE reviews never enter this calculation.

Whether the counter is lifetime, rolling, or resets after each payout is TBD.

## **D5. Laziness failsafe**

**Known signals:**

1.  Long approval streak.

2.  Review completed too quickly.

3.  Empty checklist/note indicators.

4.  Copy-pasted rejection reasons.

**Known behavior:**

- Accumulate evidence of low-effort reviewing.

- Increase interaction friction as evidence increases.

- Do not modify generated assets or their correctness.

- Reduce friction through genuine effort.

- Never scold or insult the user.

**Recommended configurable model:**

Maintain an aggregate score from weighted signals, with thresholds that determine friction stages.

All weights, trigger thresholds, score decay, and friction-stage boundaries remain TBD.

The specific mapping of the four friction mechanisms to stages is also TBD.

## **D6. XP and character progression**

XP values for LOW, MEDIUM, and HIGH exploration activities are TBD.

XP for learning individual tabs and learning relationships between tabs is also TBD.

Character level thresholds and stat progression formulas are TBD.

Do not invent XP values or assign stat benefits until the progression model is approved.

# **E. NAVIGATION MAP**

## **E1. Primary entry flow**

INSERT COIN  
↓  
START GATE  
↓ (N \> 0)  
TITLE SCREEN  
↓  
CHARACTER SELECT  
↓  
WORLDS  
↓  
WORLD DETAIL  
↓  
TASK WORKSPACE  
↓  
QA REVIEW

## **E2. QA outcomes**

QA REVIEW  
├── APPROVE  
│ └── Asset approved  
│ └── Eligible for subsequent pack/finalization workflow  
│  
├── REJECT  
│ ├── Invalid reason → Remain on QA REVIEW  
│ └── Valid reason → Record rejection → Update qualifying rejection count  
│  
└── DELETE  
├── BIN → BIN  
└── PERMANENT DELETE → Confirmation → Permanent deletion

## **E3. Pack flow**

Approved assets  
↓  
Pack / Pack Pool  
↓  
Pack qualification check  
↓  
Ready-to-sell and finalized  
↓  
Finished Pack Pool  
↓  
Finished leaderboard eligibility  
↓  
Qualifying three-pack reward counter

## **E4. Secondary navigation**

Post-entry screens must provide navigation to:

- Worlds

- Packs / Pack Pool

- Leaderboards

- Codex / Quest Log

The exact navigation component is TBD.

## **E5. Character switching**

Any active character context  
↓  
Character Select  
↓  
Select IDE / AI Chatbot / DAF  
↓  
Worlds reload  
↓  
Display only eligible worlds for the newly selected character

## **E6. Progression flow**

Application exploration  
↓  
Eligible learning activity  
↓  
XPEvent recorded  
↓  
Character XP updated  
↓  
Character progression/stats updated according to finalized rules  
↓  
Codex / Quest Log displays progress

## **E7. Credit gate**

Provider telemetry  
↓  
Normalize applicable provider constraints  
↓  
Identify bottleneck provider  
↓  
Calculate N  
├── N = 0 → Start locked  
├── N below low threshold → Low-credit warning  
└── N above warning threshold → Normal credit state

# **F. COMPONENT LIST**

Reusable components should be implemented consistently across screens.

| **Component**              | **Purpose**                          | **Required variants/states**                          |
|----------------------------|--------------------------------------|-------------------------------------------------------|
| Arcade Cabinet Shell       | Main application frame               | Normal, loading                                       |
| Bezel                      | Frames the CRT-style content area    | Standard                                              |
| Marquee                    | Displays Asset Foundry branding      | Static                                                |
| CRT Screen Container       | Holds active screen content          | Normal, reduced-motion                                |
| Credit Meter               | Displays N                           | Normal, low, zero, unavailable                        |
| Character Indicator        | Identifies active character          | IDE, AI Chatbot, DAF                                  |
| Arcade Button              | Primary/secondary actions            | Normal, focused, pressed, disabled, held              |
| Joystick Control           | Navigation affordance                | Neutral, directional input                            |
| Secondary Navigation       | Screen switching                     | Active, inactive                                      |
| Progress Bar               | Displays progress                    | Zero, partial, complete                               |
| World Card                 | World/project summary                | Normal, focused                                       |
| Milestone Indicator        | Displays next milestone              | Open, completed                                       |
| Task Row                   | Displays task metadata and action    | Open, in progress, blocked, complete                  |
| Task Work Surface          | Module-provided production UI        | Loading, ready, error                                 |
| Asset Preview              | Displays current asset               | Available, loading, error                             |
| QA Checklist               | Displays review criteria             | Empty, partial, complete                              |
| Feedback Field             | Collects optional approval note      | Empty, populated                                      |
| Rejection Field            | Collects required rejection reason   | Empty, valid, invalid                                 |
| Validation Message         | Explains failed submission rules     | Sentence count, vague reason, checklist issue         |
| Deletion Confirmation      | Confirms permanent deletion          | Pending, confirmed, cancelled                         |
| Pack Card                  | Displays pack metadata and status    | In progress, eligible, finalized                      |
| Pack Item List             | Displays included assets             | Empty, populated                                      |
| Leaderboard Table          | Displays rankings                    | Populated, empty, loading                             |
| Recent Shipped Strip       | Displays last three shipped assets   | Zero to three entries                                 |
| Character Stats Panel      | Displays EYE, CRAFT, TASTE, PATIENCE | Normal, loading                                       |
| XP Progress Indicator      | Displays XP/progression              | Zero, partial, complete                               |
| Codex Quest List           | Displays exploration objectives      | Available, completed                                  |
| Bin List                   | Displays binned assets               | Empty, populated                                      |
| Low Credit Warning         | Displays low-credit status           | Visible, hidden                                       |
| Error Panel                | Explains recoverable errors          | Generic, provider, module, storage                    |
| Empty State Panel          | Explains missing data                | No worlds, no tasks, no packs, no leaderboard entries |
| Loading Indicator          | Indicates data retrieval             | Active, complete                                      |
| Failsafe Interaction Layer | Applies effort-based review friction | Inactive, escalating, cooldown                        |
| CRT Effects Layer          | Provides arcade screen effects       | Standard, reduced-motion                              |

### **Component behavior requirements**

1.  Components must support keyboard and controller focus.

2.  Disabled controls must be visually and behaviorally distinguishable from active controls.

3.  Destructive actions must be distinguishable from normal actions.

4.  Review-validation errors must be associated with the relevant field or checklist.

5.  The credit meter must not show stale or invented provider values as current.

6.  All components must remain usable against dark backgrounds.

7.  The failsafe may alter interaction friction, but must not compromise the underlying production data or asset correctness.

# **G. ACCESSIBILITY + COMFORT**

## **G1. Visual comfort**

- Dark backgrounds only.

- No bright white screen backgrounds.

- Pixel fonts are appropriate for titles and arcade labels.

- Long-form instructions, rejection reasons, and task descriptions must remain readable.

- Do not use pixel typography at the expense of text legibility.

- Use distinguishable states for enabled, disabled, selected, warning, and error controls.

- Do not communicate credit status or validation status through color alone.

## **G2. CRT effects**

Provide a reduced-motion option.

It should reduce or disable:

- CRT flicker.

- Screen movement.

- Unnecessary scanline animation.

- Scrolling effects.

- Other nonessential animation.

The standard CRT aesthetic can remain available when reduced motion is disabled.

## **G3. Laziness-failsafe accessibility**

The failsafe cannot be allowed to make an action impossible for a user relying on keyboard navigation or reduced-motion settings.

Required behavior:

- Shuffled controls must retain clear focus indication.

- Moving buttons must not cause lost keyboard focus.

- Forced prompts must be keyboard accessible.

- The five-second approve hold must work with supported input methods.

- Reduced-motion mode must replace animated movement with a nonanimated friction equivalent where necessary.

- Failsafe messages must remain neutral and nonjudgmental.

The failsafe must not punish accessibility-tool use or infer laziness solely from interaction speed without considering user settings.

## **G4. Keyboard mapping**

**PROPOSED default mapping:**

| **Keyboard input** | **Action**                                                   |
|--------------------|--------------------------------------------------------------|
| Arrow keys         | Navigate menus and selectable items                          |
| W / A / S / D      | Alternative directional navigation                           |
| Enter              | Confirm/select                                               |
| Space              | Activate focused action; hold when a hold action is required |
| Escape             | Back/cancel where permitted                                  |
| Tab                | Move keyboard focus                                          |
| Shift + Tab        | Move focus backward                                          |

No action may require a mouse exclusively.

## **G5. Controller mapping**

**PROPOSED default mapping:**

| **Controller input**      | **Action**                                |
|---------------------------|-------------------------------------------|
| D-pad                     | Navigate menu/list                        |
| Left joystick             | Navigate menu/list                        |
| A / primary button        | Confirm/select                            |
| B / secondary button      | Back/cancel where permitted               |
| Start                     | Start action at Start Gate                |
| Select / auxiliary button | Insert Coin action at entry, if supported |

The exact hardware mapping is configurable and remains an implementation decision.

## **G6. Input consistency**

- Focus order must follow the visual reading order.

- Focus must remain visible during failsafe interactions.

- Destructive actions must require deliberate selection.

- Text input must work with keyboard and standard text-entry mechanisms.

- Rejection validation must identify the exact failed requirement.

- The five-second hold must have a clear indication of whether it is progressing or has been interrupted.

# **H. OPEN QUESTIONS**

These questions must be resolved before the corresponding behavior is treated as final. Recommendations are implementation guidance, not additional locked requirements.

## **H1. What exactly are Credits N and earned credits?**

**Problem:** N is defined as live inference-provider headroom, but the application also awards credits for pack completion and qualifying rejections. Internal rewards cannot automatically increase external API quotas.

Options:

1.  Earned credits are a separate score/reward balance; provider headroom remains independent.

2.  Earned credits form a separate internal resource that can influence application-level task capacity but never override external provider limits.

3.  Earned credits can be converted into provider capacity through an explicitly supported mechanism.

**Recommended:** Option 1 initially. Show provider headroom and earned credits as distinct values. Keep N as the actual bottleneck-provider headroom. This avoids reporting capacity that does not exist.

## **H2. What does Insert Coin actually do?**

Options:

1.  Purely thematic entry action.

2.  Consume one earned credit.

3.  Trigger a real payment/credit purchase.

**Recommended:** Option 1. There is no specified payment system, and provider headroom is calculated from external limits.

## **H3. How should different provider limits be normalized?**

Options:

1.  Convert each constraint into a common estimated-work unit.

2.  Compare percentage utilization across all provider constraints.

3.  Calculate provider-specific task capacity based on the most restrictive applicable constraint.

**Recommended:** Option 3, expressed in a common usable-capacity unit. This avoids treating unrelated token and request limits as directly comparable numbers.

## **H4. What happens when provider telemetry is unavailable or stale?**

Options:

1.  Show the last known balance with a stale warning.

2.  Show unavailable and lock new starts.

3.  Show unavailable but allow starts using the last confirmed balance.

**Recommended:** Option 1 for display, with a separately defined safe start policy. Do not silently report stale data as live. The lock policy must be decided before production use.

## **H5. What is the low-credit warning threshold?**

Options:

1.  Fixed number of credits.

2.  Percentage of total usable provider headroom.

3.  Estimated number of remaining production operations.

**Recommended:** Option 3, because it communicates practical working capacity. The numeric threshold remains a tunable TBD value.

## **H6. What is the pack bonus amount and counter scope?**

Options:

1.  +1 for every three qualifying packs.

2.  A configurable larger bonus for every qualifying group of three.

3.  Different bonus amounts based on pack size or type.

**Recommended:** Option 1 as the simplest initial default, pending approval.

Counter scope:

- Lifetime qualifying pack count.

- Rolling groups of three.

- Counter resets after each reward.

**Recommended:** Rolling groups of three, with each qualifying pack counted once.

## **H7. How is remaining work calculated?**

Options:

1.  Count remaining open tasks.

2.  Sum estimated remaining effort per task.

3.  Use both: estimated effort for ranking and task count for display.

**Recommended:** Option 3. It preserves the requested distinction between "remaining work" and "tasks left."

Effort units must be consistent, and a fallback for unestimated tasks must be specified.

## **H8. What makes a rejection reason specific rather than vague?**

Options:

1.  Two sentences plus a minimum-detail requirement.

2.  Two sentences plus required evidence/examples.

3.  Two sentences plus a configurable automated specificity check.

**Recommended:** Option 3, combined with a human-readable validation explanation. A sentence-count check alone cannot reliably distinguish useful feedback from vague wording.

Also clarify whether the user can revise an invalid reason indefinitely without creating a Review record.

## **H9. What are the QA checklist items, and must all items pass?**

Options:

1.  A fixed checklist shared across all asset types.

2.  A checklist specific to each asset type/module.

3.  A shared core checklist plus module-specific criteria.

**Recommended:** Option 3. It supports the future modular production pipeline without forcing unrelated asset types into identical QA criteria.

Checklist definitions and completion requirements remain TBD.

## **H10. What are the laziness-score thresholds and friction-stage order?**

Options:

1.  Four fixed stages, with one friction mechanism per stage.

2.  Weighted score with configurable trigger thresholds and cumulative friction.

3.  Independent triggers that apply friction immediately when any signal crosses its threshold.

**Recommended:** Option 2. It allows tuning and avoids treating one isolated signal as proof of low effort.

Suggested mechanisms to map across friction stages:

- Shuffled review order.

- Altered button positions.

- Forced "name one thing wrong" prompt.

- Five-second approval hold.

Clarify:

- What qualifies as a long approval streak?

- What is too fast?

- How are copied reasons detected?

- Does an empty optional approval note count as a signal when the user completes the QA checklist?

- Which signals apply to approval versus rejection?

- What qualifies as genuine effort for cooldown?

- How quickly does friction decrease?

## **H11. How should character progression work?**

Options:

1.  Each character has independent XP and stats.

2.  XP and stats are shared across all characters.

3.  XP is shared, but stats are character-specific.

**Recommended:** Option 1 because character selection is a meaningful progression choice.

Still required:

- XP per low/medium/high exploration activity.

- XP for individual tab learning.

- XP for cross-tab learning.

- Level thresholds, if levels are used.

- Stat advancement rules.

- Whether stats affect only progression displays or influence task/review behavior.

Do not give stats gameplay effects unless explicitly approved.

## **H12. What exactly constitutes a character's open task?**

Options:

1.  A Task explicitly assigned to that Character.

2.  A Task available to that Character based on module compatibility.

3.  A Task assigned to that Character or explicitly available through a configured relationship.

**Recommended:** Option 1 for the initial implementation because it is explicit and easy to validate. Module compatibility can be added without changing the world-visibility principle.

## **H13. What is the exact existing module inventory?**

Options:

1.  Use only the mandala module in the first release.

2.  Preserve and expose every already-integrated module.

3.  Preserve all modules, but enable selected modules through configuration.

**Recommended:** Option 3.

Before implementation, obtain the actual existing module list. This specification does not invent missing asset categories.

Future 8-bit sprites, 16-bit sprites, and Unity asset pipeline modules should be added without redesigning the core interface.

## **H14. What does Pack finalization mean operationally?**

Options:

1.  A completed, QA-approved item collection.

2.  A collection that has also passed a separate sale-readiness check.

3.  A collection that has been finalized and explicitly placed in the pack pool.

**Recommended:** Option 3, with the required readiness check represented as an eligibility condition.

Clarify whether finalization is reversible and whether assets can belong to multiple packs.

## **H15. What happens to binned assets?**

Options:

1.  Bin is an archive with no restore action.

2.  Bin allows restoration.

3.  Bin allows restoration or permanent deletion.

**Recommended:** Option 3, provided permanent deletion requires confirmation. Restore behavior needs to preserve the asset's historical review record.

## **H16. How are the leaderboards scored and ranked?**

Options:

1.  Count qualifying records.

2.  Use a configurable quality/achievement score.

3.  Display both totals and ranked scores.

**Recommended:** Option 3.

Also clarify:

- Whether leaderboards are personal or shared across users.

- Whether there are date ranges.

- Whether rejected reasons have quality scores.

- How ties are handled.

- Whether Finished ranks Packs or individual Assets.

- Whether the last three shipped refers to packs, individual assets, or both.

## **H17. What are the final navigation destinations and tab relationships?**

Options:

1.  Persistent tabs for Worlds, Packs, Leaderboards, and Codex.

2.  A menu accessible from all active screens.

3.  An arcade-style hub with the same destinations.

**Recommended:** Option 1 if the tab-learning progression is central. Otherwise, Option 2 is a simpler navigation structure.

The exact tab list and which tabs affect each other must be documented before assigning cross-tab XP.

## **H18. What happens if credits reach zero during an active session?**

Options:

1.  Allow current work to finish, lock new task starts.

2.  Immediately stop new inference operations but preserve current work.

3.  Lock the entire application.

**Recommended:** Option 2. Preserve work already performed while preventing operations that exceed available provider capacity.

This is different from the already-locked rule that N = 0 prevents starting the application.

# **I. BUILD ORDER**

Build in milestones. Each milestone should produce a testable result. Do not build every module or progression feature before proving the basic production loop.

## **Milestone 1: Arcade entry and navigation skeleton**

**Goal:** Establish the application shell and core entry flow.

Build:

- Insert Coin.

- Start Gate.

- Title Screen.

- Sideways-scrolling hi-score banner.

- Character Select.

- Shared cabinet frame.

- Credit meter using test data initially.

- Keyboard/controller navigation baseline.

Acceptance criteria:

- Insert Coin transitions to Start Gate.

- Start opens Title only when N \> 0.

- Zero credits visibly locks Start.

- Title transitions to Character Select.

- All three characters can be selected.

Do not claim test credit values are live provider data.

## **Milestone 2: Worlds and milestone ordering**

**Goal:** Prove character-specific project visibility and ordering.

Build:

- World data model.

- Milestone data model.

- Task/Character association.

- Worlds screen.

- Progress bars.

- Task counts.

- Next milestone display.

- Remaining-effort ordering.

- World Detail.

Acceptance criteria:

- A character only sees worlds with actual open tasks.

- A character cannot enter an ineligible world.

- Worlds sort with the least remaining work first.

- Counts and progress update when task states change.

## **Milestone 3: First production module and Task Workspace**

**Goal:** Complete the first real asset-production task.

Use the mandala production module as the initial module.

Build:

- Task Workspace.

- Module-provided working surface.

- Asset association and storage reference.

- Asset status.

- QA submission action.

Acceptance criteria:

- A user can open an eligible task.

- An asset can be produced or advanced through the existing mandala module.

- The produced asset remains associated with its Task and World.

- The asset can be submitted for QA.

## **Milestone 4: QA and review ledger**

**Goal:** Make asset disposition reliable and auditable.

Build:

- Asset preview.

- QA checklist.

- Optional approval note.

- Required rejection reason.

- Two-sentence validation.

- Specificity validation hook.

- Delete destination selection.

- Permanent-delete confirmation.

- Review records.

- Review-duration capture.

- Delete/reject separation.

Acceptance criteria:

- Approve records a review.

- Reject cannot submit with an empty or fewer-than-two-sentence reason.

- Vague reasons fail according to the approved specificity criteria.

- Delete records the selected disposition without creating a rejection or reward.

- Historical review data is preserved appropriately.

## **Milestone 5: Packs and finished pool**

**Goal:** Complete a qualifying asset pack.

Build:

- Pack data model.

- Pack membership.

- Pack item count.

- Ready-to-sell state.

- Finalization.

- Pack Pool.

- Finished qualification.

- Pack reward counting.

Acceptance criteria:

- A pack with fewer than 15 items does not qualify.

- A pack that is not ready to sell does not qualify.

- A pack that is not finalized does not qualify.

- Three qualifying packs trigger the configured bonus.

- Finished leaderboard eligibility is based on QA, finalization, and pack-pool membership.

## **Milestone 6: Provider credits**

**Goal:** Replace test credit data with live provider-derived headroom.

Build:

- ProviderLimit storage.

- Provider telemetry retrieval.

- Normalization.

- Bottleneck identification.

- Credits N calculation.

- Low-credit warning.

- Zero-credit Start lock.

- Stale/unavailable provider states.

Acceptance criteria:

- N reflects the actual bottleneck provider.

- The meter cannot exceed actual usable capacity.

- Provider constraint data is not silently mixed across incompatible units.

- Zero usable headroom locks Start.

- Unavailable telemetry is not reported as a trustworthy live value.

The exact provider list, APIs, and normalization method must be approved before this milestone.

## **Milestone 7: Character XP, stats, and Codex**

**Goal:** Establish the exploration/progression loop.

Build:

- XPEvent recording.

- LOW/MEDIUM/HIGH exploration categories.

- EYE, CRAFT, TASTE, PATIENCE.

- Codex.

- Quest Log.

- Individual tab learning.

- Cross-tab learning.

Acceptance criteria:

- Qualifying exploration activities create XPEvents.

- Character XP updates correctly.

- Codex reflects recorded activity.

- Character stats update according to approved formulas.

- Duplicate XP awards are prevented according to the approved event rules.

## **Milestone 8: Leaderboards**

**Goal:** Display trustworthy production and review records.

Build:

- Finished board.

- Rejected Well board.

- Asset-type boards.

- Last-three-shipped display.

- Ranking calculations.

Acceptance criteria:

- Finished entries satisfy all three required conditions.

- Rejected Well excludes DELETE actions.

- Asset types remain distinct.

- Last three shipped entries are chronologically correct.

- Empty and partially populated boards render correctly.

## **Milestone 9: Laziness failsafe**

**Goal:** Introduce passive review-quality friction without changing asset correctness.

Build:

- Signal detection.

- Review-effort measurements.

- Laziness score.

- Configurable trigger thresholds.

- Friction stages.

- Shuffled order.

- Button movement.

- Forced "name one thing wrong" prompt.

- Five-second approval hold.

- Genuine-effort cooldown.

- Reduced-motion equivalents.

Acceptance criteria:

- Long approval streaks, excessively fast reviews, empty effort indicators, and copied reasons can generate signals.

- Friction increases in the approved stages.

- Genuine effort reduces friction.

- The system never scolds the user.

- The system never changes asset correctness or production output.

- Keyboard/controller navigation remains reliable.

- Reduced-motion mode does not remove the failsafe's functional requirements.

## **Milestone 10: Modular expansion**

**Goal:** Add other production modules without modifying the core application flow.

Build future modules:

- 8-bit sprites.

- 16-bit sprites.

- Unity asset pipeline.

- Any other previously incorporated asset modules not already enabled.

Acceptance criteria:

- New asset types can use the existing Task Workspace framework.

- Asset records retain their module/type identity.

- QA can accommodate module-specific checklists.

- Worlds, milestones, XP, credits, reviews, packs, and leaderboards remain functional.

- Existing mandala production continues to work without regression.

## **SMALLEST PLAYABLE SLICE**

The first genuinely playable release should contain:

1.  Insert Coin → Start → Title.

2.  All three character choices.

3.  Character-specific Worlds filtering.

4.  World Detail with milestone progress and open tasks.

5.  One functional mandala production module.

6.  Task Workspace.

7.  QA Approve, Reject, and Delete.

8.  Rejection validation.

9.  A basic Pack/Pack Pool workflow.

10. The Finished eligibility rule.

11. A functional credit meter and zero-credit Start lock.

XP, leaderboards, advanced failsafe friction, and future asset modules can follow once this production loop works reliably.

**Primary release test:** A user selects a character, enters a legitimate world, completes a task, reviews the resulting asset, makes a valid QA decision, and advances an approved asset into a qualifying finalized pack. Every transition must produce consistent underlying records.

The central architecture rule is that the arcade interface is shared, while production capabilities are modular. New asset types must extend the pipeline, not create a separate application or a parallel navigation system.
