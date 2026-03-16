# Improve `/regel` Hybrid Search and Page Picking

## TL;DR

> **Summary**: Keep semantic Regelwiki search, add fast exact-title picking, and let users open a chosen rules page inside the Discord flow without losing related semantic results.
> **Deliverables**:
>
> - Autocomplete-backed exact page picking for `/regel suche`
> - Hybrid `/regel` execution that prioritizes exact title hits and preserves semantic matches
> - Interactive Discord response with selected-page preview, in-message chooser, and direct Regelwiki link
> - Automated tests for new search logic and `/regel` interaction behavior
>   **Effort**: Medium
>   **Parallel**: YES - 2 waves
>   **Critical Path**: Task 1 -> Task 3 -> Task 5 -> Task 6 -> Task 8

## Context

### Original Request

Improve rules search so embedding-based results still work, but users can also choose and open a concrete rule page like `Wuchtschlag` from the bot itself.

### Interview Summary

- User wants search quality improved without removing the existing embedding search path.
- User specifically wants exact page selection in Discord, not only passive search results.
- UX decision is confirmed: support both slash-command autocomplete for fast known-title selection and a post-search picker for browsing/disambiguation.
- Planner default locked in: selecting an exact page shows that page as the primary Discord preview and still preserves related semantic results in the response.

### Metis Review (gaps addressed)

- Autocomplete must never depend on a slow live query path because Discord requires a response within 3 seconds.
- Do not introduce database migrations, Redis, pagination, or database-level hybrid ranking for this scope.
- Keep the implementation inside the existing command/client architecture: cached titles for autocomplete, exact-first orchestration in `utils/rulesClient.js`, and local collector-driven UI in `commands/regel.js`.
- Treat mobile and Discord component limits as design constraints: at most 25 autocomplete/select options, short `custom_id` values, and smart content truncation.

## Work Objectives

### Core Objective

Ship a decision-complete `/regel` experience where users can either type a free-form semantic query or pick an exact rule title like `Wuchtschlag`, then inspect the selected page in Discord while still seeing related semantic hits.

### Deliverables

- Cached title dataset available to the Discord client for `/regel` autocomplete.
- New rules client helpers for title search and hybrid result orchestration.
- Updated `/regel` command definition with autocomplete on `suche`.
- Updated `/regel` reply format with selected-page preview, exact/semantic result summaries, a conditional page picker, and a link button to the Regelwiki source.
- Jest coverage for rules-client behavior and `/regel` command interaction behavior.

### Definition of Done (verifiable conditions with commands)

- `npm test -- --runInBand` passes with new rules search and command tests included.
- `npm run lint` passes with no new lint violations.
- `node -e "require('./commands/regel')"` exits successfully after the command refactor.
- `node deploy-commands.js guild` completes successfully when `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID` are present.

### Must Have

- Semantic search continues to use `rule_chunks` results via the existing embedding path.
- Exact title selection operates from `rule_pages` data, not chunk rows.
- Autocomplete supports the existing optional category filter.
- Post-search page selection stays inside the `/regel` interaction flow and is limited to the invoking user.
- Exact-title matches are surfaced before semantic matches, with duplicate pages removed.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)

- No scraper changes, importer changes, or schema migrations.
- No Redis, external cache service, or background worker.
- No database-level RRF/pg_trgm/FTS rollout in this task.
- No pagination/multi-page embed system for full article rendering.
- No new global interaction router for rule selection; keep the selection flow local to `/regel` unless a hard blocker appears during implementation.

## Verification Strategy

> ZERO HUMAN INTERVENTION - all verification is agent-executed.

- Test decision: tests-after with Jest plus command-level mocked interaction coverage.
- QA policy: every task includes automated happy-path and failure-path checks; Discord-facing tasks use mocked interaction objects or command execution scripts rather than human clicking.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy

### Parallel Execution Waves

> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: search/data foundation (`rulesClient`, cache bootstrapping, test scaffolding)
Wave 2: `/regel` UX and interaction flow (`commands/regel.js`, mocked command tests, command deployment smoke)

### Dependency Matrix (full, all tasks)

| Task | Depends On | Enables            |
| ---- | ---------- | ------------------ |
| 1    | -          | 2, 3, 5            |
| 2    | 1          | 3, 5, 6            |
| 3    | 1, 2       | 5, 6, 8            |
| 4    | 1, 2, 3    | 8                  |
| 5    | 1, 2, 3    | 6, 8               |
| 6    | 3, 5       | 7, 8               |
| 7    | 5, 6       | 8                  |
| 8    | 4, 5, 6, 7 | Final Verification |

### Agent Dispatch Summary (wave -> task count -> categories)

- Wave 1 -> 4 tasks -> `quick`, `unspecified-low`
- Wave 2 -> 4 tasks -> `quick`, `unspecified-high`
- Final Verification -> 4 tasks -> `oracle` subagent, `unspecified-high`, `deep`

## TODOs

> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x]   1. Add a rule-page autocomplete dataset and cache lifecycle

    **What to do**: Add a read helper in `utils/rulesClient.js` that returns active rule-page title records needed for autocomplete (`doc_id`, `title`, `category`, `resolved_category`, `source_url`). Initialize `client.rulePageTitleCache` in the existing ready hook in `index.js`, store normalized lowercase fields for fast filtering, and refresh the cache every 15 minutes while preserving the previous snapshot on refresh failure. Log refresh failures without crashing bot startup.
    **Must NOT do**: Do not add Redis, new env vars, or a new background worker. Do not fetch chunk rows for autocomplete. Do not block `client.login()` on repeated retries.

    **Recommended Agent Profile**:
    - Category: `quick` - Reason: focused changes in two existing files with clear repo patterns.
    - Skills: `[]` - existing Node/Discord patterns in the repo are sufficient.
    - Omitted: [`playwright`] - no browser automation is needed for this task.

    **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2, 3, 5 | Blocked By: none

    **References** (executor has NO interview context - be exhaustive):
    - Pattern: `index.js:15` - shared client-scoped state already lives on `client` (`commands`, `activeCombats`, `pendingCombatActions`).
    - Pattern: `index.js:258` - existing `ClientReady` hook is the correct lifecycle point for cache hydration.
    - API/Type: `utils/rulesClient.js:121` - page-level reads already target `rule_pages` first and fall back to `rule_documents`.
    - API/Type: `RULES_VECTOR_DB.md:298` - exact lookup belongs on `rule_pages`, not `rule_chunks`.
    - Schema: `supabase/migrations/20260316_create_rule_pages_rule_chunks.sql:4` - `rule_pages` has the exact title/source metadata required for cache rows.
    - Test: `tests/ruleImportTransforms.test.js:53` - existing tests use direct object expectations and focused fixtures.

    **Acceptance Criteria** (agent-executable only):
    - [ ] `utils/rulesClient.js` exports a helper that returns autocomplete-ready page rows from `rule_pages` with legacy fallback support.
    - [ ] `index.js` hydrates `client.rulePageTitleCache` during `ClientReady` and schedules periodic refresh without replacing a healthy cache on failed refresh.
    - [ ] A Jest test proves cache refresh keeps the old snapshot when the refresh helper rejects.

    **QA Scenarios** (MANDATORY - task incomplete without these):

    ```text
    Scenario: Cache initializes and refresh metadata is stored
      Tool: Bash
      Steps: Run `npm test -- --runInBand tests/rulesClient.test.js -t "hydrates rule page title cache"`
      Expected: Jest passes and the assertion confirms cache rows include normalized title/category data.
      Evidence: .sisyphus/evidence/task-1-rule-page-cache.txt

    Scenario: Refresh failure preserves prior cache snapshot
      Tool: Bash
      Steps: Run `npm test -- --runInBand tests/rulesClient.test.js -t "preserves existing cache on refresh failure"`
      Expected: Jest passes and the cached snapshot remains unchanged after a simulated loader failure.
      Evidence: .sisyphus/evidence/task-1-rule-page-cache-error.txt
    ```

    **Commit**: YES | Message: `feat(rules): add cached autocomplete title dataset` | Files: `utils/rulesClient.js`, `index.js`, `tests/rulesClient.test.js`

- [x]   2. Add ranked page-title lookup for exact, prefix, and contains matches

    **What to do**: Add a dedicated page-title lookup helper in `utils/rulesClient.js` that searches only rule pages, ranks matches as exact title > prefix title > contains title, applies optional category filtering, and returns up to 3 deduped page records with a `match_type` annotation. Normalize comparisons case-insensitively and keep the return shape page-oriented so it can drive post-search page picking.
    **Must NOT do**: Do not add database migrations, pg_trgm indexes, or SQL functions. Do not use chunk rows or embedding similarity for this helper.

    **Recommended Agent Profile**:
    - Category: `quick` - Reason: contained data-layer enhancement in one utility module.
    - Skills: `[]` - no specialized framework skill is needed.
    - Omitted: [`git-master`] - not a history task.

    **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 3, 5, 6 | Blocked By: 1

    **References** (executor has NO interview context - be exhaustive):
    - Pattern: `utils/rulesClient.js:29` - `normalizePageResult()` shows the page result shape expected elsewhere.
    - Pattern: `utils/rulesClient.js:153` - existing title lookup already uses page-level fields and fallback logic.
    - API/Type: `RULES_VECTOR_DB.md:300` - exact lookups should use page identifiers/title/source URL, never chunk rows.
    - Schema: `supabase/migrations/20260316_create_rule_pages_rule_chunks.sql:11` - `title` is the canonical field to rank.
    - External: `https://supabase.com/docs/guides/ai/hybrid-search` - use exact-first merge behavior, but keep implementation client-side for this task.

    **Acceptance Criteria** (agent-executable only):
    - [ ] A new helper returns ranked page matches with deterministic ordering: exact first, then prefix, then contains.
    - [ ] Category filtering limits ranked title matches to the requested category.
    - [ ] Duplicate pages are removed by `doc_id` or page identifier before returning results.

    **QA Scenarios** (MANDATORY - task incomplete without these):

    ```text
    Scenario: Exact and prefix matches are ranked ahead of contains matches
      Tool: Bash
      Steps: Run `npm test -- --runInBand tests/rulesClient.test.js -t "ranks exact prefix and contains title matches"`
      Expected: Jest passes and the helper returns exact > prefix > contains ordering for the fixture set.
      Evidence: .sisyphus/evidence/task-2-title-ranking.txt

    Scenario: Category filtering drops otherwise valid matches
      Tool: Bash
      Steps: Run `npm test -- --runInBand tests/rulesClient.test.js -t "filters ranked title matches by category"`
      Expected: Jest passes and out-of-category titles are excluded while same-category titles remain.
      Evidence: .sisyphus/evidence/task-2-title-ranking-error.txt
    ```

    **Commit**: YES | Message: `feat(rules): add ranked page title lookup` | Files: `utils/rulesClient.js`, `tests/rulesClient.test.js`

- [x]   3. Add exact-first hybrid search orchestration with semantic deduplication

    **What to do**: Add a new orchestrator in `utils/rulesClient.js` that runs ranked page-title lookup and existing semantic `searchRules()` in parallel, removes semantic duplicates by page/doc identifier, annotates results with `match_type`, and returns a single response object containing `selectedPage`, `exactMatches`, and `semanticMatches`. Cap `exactMatches` at 3 entries, keep `semanticMatches` capped by the existing `/regel anzahl` value (1-5), and when no exact match exists set `selectedPage` to the first semantic result. Exact matches must always be placed ahead of semantic matches, but semantic results must still be returned even when the query is an exact title.
    **Must NOT do**: Do not change the public behavior or signature of the existing `searchRules()` helper. Do not mix title matches into chunk text summaries without first normalizing them into page records.

    **Recommended Agent Profile**:
    - Category: `unspecified-low` - Reason: logic is still localized but needs careful data-shape handling.
    - Skills: `[]` - repository context is sufficient.
    - Omitted: [`playwright`] - not applicable to utility logic.

    **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 5, 6, 8 | Blocked By: 1, 2

    **References** (executor has NO interview context - be exhaustive):
    - Pattern: `utils/rulesClient.js:64` - keep semantic search path unchanged and wrap it instead of replacing it.
    - API/Type: `RULES_VECTOR_DB.md:246` - semantic search belongs on `rule_chunks`.
    - API/Type: `RULES_VECTOR_DB.md:296` - semantic results should be deduplicated per page so one page does not dominate.
    - API/Type: `RULES_VECTOR_DB.md:353` - exact lookups target `rule_pages` while semantic search targets `rule_chunks`.
    - External: `https://supabase.com/docs/guides/ai/hybrid-search` - exact-first hybrid composition is appropriate, but keep it out of SQL for this scope.

    **Acceptance Criteria** (agent-executable only):
    - [ ] A new hybrid helper returns exact and semantic groups plus a selected primary page.
    - [ ] Exact-title hits remain visible even when semantic results also exist for the same query.
    - [ ] Semantic matches are deduplicated to one entry per page before limiting the returned set.

    **QA Scenarios** (MANDATORY - task incomplete without these):

    ```text
    Scenario: Exact page remains primary while semantic results are preserved
      Tool: Bash
      Steps: Run `npm test -- --runInBand tests/rulesClient.test.js -t "keeps exact page first while preserving semantic matches"`
      Expected: Jest passes and the hybrid response keeps the exact page as `selectedPage` while semantic matches remain populated.
      Evidence: .sisyphus/evidence/task-3-hybrid-search.txt

    Scenario: Duplicate chunk hits collapse to one semantic page result
      Tool: Bash
      Steps: Run `npm test -- --runInBand tests/rulesClient.test.js -t "deduplicates semantic matches by page"`
      Expected: Jest passes and repeated chunk rows for the same page collapse into a single semantic entry.
      Evidence: .sisyphus/evidence/task-3-hybrid-search-error.txt
    ```

    **Commit**: YES | Message: `feat(rules): add exact-first hybrid rule search` | Files: `utils/rulesClient.js`, `tests/rulesClient.test.js`

- [x]   4. Add Jest coverage for cache loading and hybrid search helpers

    **What to do**: Create or extend `tests/rulesClient.test.js` with mocked `openai` and mocked Supabase client behavior covering cache loading, ranked title search, hybrid orchestration, deduplication, category filtering, and failure handling. Keep fixtures small and deterministic, following the repo's current direct-object assertion style.
    **Must NOT do**: Do not call live OpenAI or Supabase services. Do not hide broken behavior behind broad snapshot tests.

    **Recommended Agent Profile**:
    - Category: `quick` - Reason: focused test-file work with existing Jest conventions.
    - Skills: `[]` - standard Jest mocking is enough.
    - Omitted: [`playwright`] - unit-test coverage only.

    **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 8 | Blocked By: 1, 2, 3

    **References** (executor has NO interview context - be exhaustive):
    - Pattern: `tests/ruleImportTransforms.test.js:49` - small, explicit fixture-driven tests.
    - Pattern: `tests/combatComponents.test.js:10` - validate Discord objects through explicit property assertions.
    - API/Type: `package.json:17` - Jest is the project-standard test runner.
    - API/Type: `utils/rulesClient.js:44` - mock embedding creation rather than calling OpenAI.

    **Acceptance Criteria** (agent-executable only):
    - [ ] `tests/rulesClient.test.js` covers success and failure paths for all new helpers.
    - [ ] Tests prove no live network access is required by mocking OpenAI and Supabase dependencies.
    - [ ] The new test file runs cleanly under the repo's existing Jest command.

    **QA Scenarios** (MANDATORY - task incomplete without these):

    ```text
    Scenario: Full rulesClient test suite passes locally
      Tool: Bash
      Steps: Run `npm test -- --runInBand tests/rulesClient.test.js`
      Expected: Jest passes with no live service calls and covers cache/title/hybrid helpers.
      Evidence: .sisyphus/evidence/task-4-rulesclient-tests.txt

    Scenario: Missing-key or Supabase-error branches are exercised
      Tool: Bash
      Steps: Run `npm test -- --runInBand tests/rulesClient.test.js -t "returns safe fallbacks on service errors"`
      Expected: Jest passes and asserts that helpers return safe empty/fallback values instead of throwing uncaught errors.
      Evidence: .sisyphus/evidence/task-4-rulesclient-tests-error.txt
    ```

    **Commit**: YES | Message: `test(rules): cover hybrid and cache helpers` | Files: `tests/rulesClient.test.js`, `utils/rulesClient.js`

- [x]   5. Enable `/regel` autocomplete with cached title filtering and category awareness

    **What to do**: Update `commands/regel.js` so the existing `suche` option uses `.setAutocomplete(true)` and add an `autocomplete(interaction)` handler. Filter `interaction.client.rulePageTitleCache` in memory, prefer exact/prefix ordering over contains ordering, respect the currently selected `kategorie` option, and return up to 25 `{ name, value }` pairs where `value` is the chosen page title string submitted back to `/regel` execution.
    **Must NOT do**: Do not query Supabase or OpenAI from the autocomplete handler. Do not return IDs that make the slash option unreadable to users. Do not exceed 25 results.

    **Recommended Agent Profile**:
    - Category: `quick` - Reason: single-command enhancement built on existing repo autocomplete patterns.
    - Skills: `[]` - no additional skill is required.
    - Omitted: [`playwright`] - mocked interactions are enough here.

    **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 6, 7, 8 | Blocked By: 1, 2, 3

    **References** (executor has NO interview context - be exhaustive):
    - Pattern: `commands/regel.js:85` - `/regel` command definition and execution already live in one file.
    - Pattern: `index.js:111` - autocomplete calls are already routed to `command.autocomplete(interaction)`.
    - Pattern: `commands/view-mob.js:20` - simplest existing autocomplete handler in the repo.
    - API/Type: `commands/regel.js:96` - preserve the current category option names/values when applying autocomplete filtering.
    - External: `https://discord.js.org/docs/packages/discord.js/14.25.1/AutocompleteInteraction%3AClass` - response shape for `interaction.respond()`.

    **Acceptance Criteria** (agent-executable only):
    - [ ] `/regel` exports an `autocomplete()` handler and the `suche` option is marked as autocomplete-enabled.
    - [ ] Autocomplete uses only `interaction.client.rulePageTitleCache` plus current option values.
    - [ ] Category-filtered autocomplete returns at most 25 results in deterministic order.

    **QA Scenarios** (MANDATORY - task incomplete without these):

    ```text
    Scenario: Autocomplete returns prefix-biased, category-aware results
      Tool: Bash
      Steps: Run `npm test -- --runInBand tests/regel.test.js -t "autocomplete returns cached category-aware title choices"`
      Expected: Jest passes and the mocked interaction receives up to 25 results ranked with exact/prefix matches first.
      Evidence: .sisyphus/evidence/task-5-regel-autocomplete.txt

    Scenario: Cache miss or unsupported category returns safe empty suggestions
      Tool: Bash
      Steps: Run `npm test -- --runInBand tests/regel.test.js -t "autocomplete returns an empty array on cache miss"`
      Expected: Jest passes and the handler responds with `[]` instead of throwing.
      Evidence: .sisyphus/evidence/task-5-regel-autocomplete-error.txt
    ```

    **Commit**: YES | Message: `feat(regel): add cached title autocomplete` | Files: `commands/regel.js`, `tests/regel.test.js`

- [x]   6. Rebuild `/regel` responses around a selected page preview plus exact and semantic result sections

    **What to do**: Refactor `/regel` execution to call the new hybrid helper and render a primary embed for the selected page. Use the embed description for a preview truncated to 1500 characters at a word boundary from `normalized_content`/`chunk_text`, add at most one `Exakte Treffer` field (up to 3 linked titles) and one `Semantische Treffer` field (up to the requested `anzahl` linked titles with relevance labels), and add a `ButtonStyle.Link` button for the selected page's `source_url`. Keep the current `visible` behavior and preserve the no-results and missing-API-key branches.
    **Must NOT do**: Do not dump full page text into multiple embeds. Do not remove semantic context when an exact page exists. Do not regress the current ephemeral/public visibility option.

    **Recommended Agent Profile**:
    - Category: `unspecified-high` - Reason: command UX, embed shaping, and edge-case handling need careful coordination.
    - Skills: `[]` - existing Discord.js repo patterns are enough.
    - Omitted: [`frontend-design`] - this is interaction design, not frontend styling work.

    **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 7, 8 | Blocked By: 3, 5

    **References** (executor has NO interview context - be exhaustive):
    - Pattern: `commands/regel.js:65` - existing result-field formatting logic is the starting point for result summaries.
    - Pattern: `commands/regel.js:147` - preserve the current no-result messaging branch.
    - Pattern: `commands/regel.js:178` - preserve the missing-API-key user-facing error branch.
    - Pattern: `tests/combatComponents.test.js:111` - validate Discord component JSON with explicit property assertions.
    - External: `https://docs.discord.com/developers/resources/message#embed-object-embed-limits` - stay within embed limits.
    - External: `https://docs.discord.com/developers/components/reference.md#button` - use a link button for the selected Regelwiki page.

    **Acceptance Criteria** (agent-executable only):
    - [ ] `/regel execute()` uses the hybrid helper and renders one primary selected-page embed.
    - [ ] The selected-page embed includes a truncated preview plus exact/semantic summary fields when those groups exist.
    - [ ] The reply includes a valid link button to the selected page's `source_url` and preserves `visible` semantics.

    **QA Scenarios** (MANDATORY - task incomplete without these):

    ```text
    Scenario: Execute renders selected-page preview with grouped result summaries
      Tool: Bash
      Steps: Run `npm test -- --runInBand tests/regel.test.js -t "execute renders a selected page preview with exact and semantic sections"`
      Expected: Jest passes and the mocked `editReply` payload contains one embed, grouped summaries, and a link button.
      Evidence: .sisyphus/evidence/task-6-regel-preview.txt

    Scenario: No-results and unavailable-service branches still return safe responses
      Tool: Bash
      Steps: Run `npm test -- --runInBand tests/regel.test.js -t "execute preserves no-result and unavailable branches"`
      Expected: Jest passes and the command still returns the expected user-safe reply objects for empty and unavailable states.
      Evidence: .sisyphus/evidence/task-6-regel-preview-error.txt
    ```

    **Commit**: YES | Message: `feat(regel): show selected rule preview and grouped results` | Files: `commands/regel.js`, `tests/regel.test.js`

- [x]   7. Add a post-search page picker that updates the selected preview in-place

    **What to do**: Add a conditional `StringSelectMenuBuilder` to the `/regel` reply when there is more than one selectable page across exact and semantic groups. Populate the menu with exact matches first and then semantic matches, using short deterministic option values (`doc_id`) and capping the menu at the combined exact+semantic set already returned by the hybrid helper. Scope the collector to the invoking user and original reply. When the user selects a page, rebuild the embed/button state in-place so the newly selected page becomes primary while the rest stay available. On timeout, remove the select menu row but keep the final embed and link button visible.
    **Must NOT do**: Do not add a central interaction router or global handler for this flow. Do not use full URLs in `custom_id` or menu values. Do not leave stale collectors running after timeout.

    **Recommended Agent Profile**:
    - Category: `unspecified-high` - Reason: collector lifecycle and payload rebuilding need careful edge-case handling.
    - Skills: `[]` - current repo collector patterns are sufficient.
    - Omitted: [`playwright`] - this flow is validated through mocked collectors/tests, not a browser.

    **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 8 | Blocked By: 5, 6

    **References** (executor has NO interview context - be exhaustive):
    - Pattern: `commands/choose-character.js:33` - baseline select menu construction.
    - Pattern: `commands/choose-character.js:47` - collector lifecycle with timeout on an interaction reply.
    - Pattern: `commands/delete-weapon.js` - local collector ownership and cleanup pattern for ephemeral selection flows.
    - API/Type: `commands/regel.js:130` - keep existing `visible`/ephemeral behavior aligned with the current command.
    - External: `https://docs.discord.com/developers/components/reference.md#string-select` - select option limits and payload shape.

    **Acceptance Criteria** (agent-executable only):
    - [ ] `/regel` adds a select menu only when there is more than one page the user can reasonably pick.
    - [ ] Selecting a new page updates the original reply so the chosen page becomes the primary preview and link target.
    - [ ] The collector only accepts the invoking user and cleans up components on timeout/end.

    **QA Scenarios** (MANDATORY - task incomplete without these):

    ```text
    Scenario: Page picker updates the selected preview in-place
      Tool: Bash
      Steps: Run `npm test -- --runInBand tests/regel.test.js -t "page picker updates the selected rule preview"`
      Expected: Jest passes and the mocked collector interaction triggers an `update`/`editReply` payload with the newly selected page as primary.
      Evidence: .sisyphus/evidence/task-7-regel-picker.txt

    Scenario: Unauthorized or timed-out selection is rejected safely
      Tool: Bash
      Steps: Run `npm test -- --runInBand tests/regel.test.js -t "page picker ignores other users and cleans up on timeout"`
      Expected: Jest passes and the collector prevents cross-user updates while removing or disabling components after timeout.
      Evidence: .sisyphus/evidence/task-7-regel-picker-error.txt
    ```

    **Commit**: YES | Message: `feat(regel): add in-message rule picker` | Files: `commands/regel.js`, `tests/regel.test.js`

- [x]   8. Add command-level verification, lint/test smoke, and guild-command deployment checks

    **What to do**: Create `tests/regel.test.js` (or extend an existing command test file if one already exists by implementation time) with mocked interaction coverage for autocomplete, execute payloads, and page-picker collector behavior. Finish by running the full local verification stack (`npm test -- --runInBand`, `npm run lint`, `node -e "require('./commands/regel')"`) and, when Discord env vars are present, `node deploy-commands.js guild` to confirm the updated slash-command schema registers cleanly.
    **Must NOT do**: Do not skip linting. Do not claim guild deployment success without running the command when credentials are present. Do not introduce brittle snapshot-only tests.

    **Recommended Agent Profile**:
    - Category: `unspecified-high` - Reason: this is the final integration-quality gate for the feature slice.
    - Skills: `[]` - existing tooling is sufficient.
    - Omitted: [`git-master`] - commit mechanics are not part of this task body.

    **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: Final Verification | Blocked By: 4, 5, 6, 7

    **References** (executor has NO interview context - be exhaustive):
    - Pattern: `tests/combatComponents.test.js:111` - assert component JSON directly instead of snapshots.
    - Pattern: `index.js:111` - autocomplete is command-driven and should be tested at the command module boundary.
    - API/Type: `package.json:13` - lint command.
    - API/Type: `package.json:17` - project-wide Jest command.
    - API/Type: `deploy-commands.js` - updated slash command definition must be registered for guild testing.

    **Acceptance Criteria** (agent-executable only):
    - [ ] `tests/regel.test.js` covers autocomplete, execute rendering, and collector update behavior.
    - [ ] `npm test -- --runInBand`, `npm run lint`, and `node -e "require('./commands/regel')"` all pass after implementation.
    - [ ] `node deploy-commands.js guild` is run and succeeds whenever the Discord deployment env vars are available; if env vars are missing, the task records that deployment verification was skipped for that reason.

    **QA Scenarios** (MANDATORY - task incomplete without these):

    ```text
    Scenario: Full local verification stack passes
      Tool: Bash
      Steps: Run `npm test -- --runInBand && npm run lint && node -e "require('./commands/regel')"`
      Expected: All commands exit 0 and cover the full `/regel` feature slice.
      Evidence: .sisyphus/evidence/task-8-verification.txt

    Scenario: Guild command deployment path is either verified or explicitly skipped for missing credentials
      Tool: Bash
      Steps: Run `if [ -n "$DISCORD_TOKEN" ] && [ -n "$CLIENT_ID" ] && [ -n "$GUILD_ID" ]; then node deploy-commands.js guild; else printf "SKIPPED: missing Discord deployment env vars\n"; fi`
      Expected: Either guild deployment exits 0 or the output explicitly states the credential-based skip reason.
      Evidence: .sisyphus/evidence/task-8-verification-error.txt
    ```

    **Commit**: YES | Message: `test(regel): verify hybrid rule selection flow` | Files: `tests/regel.test.js`, `commands/regel.js`

## Final Verification Wave (4 parallel agents, ALL must APPROVE)

- [ ] F1. Plan Compliance Audit - `oracle` subagent

    **What to verify**: Confirm the implemented work matches this plan's locked decisions: cached autocomplete, exact-first hybrid orchestration, selected-page preview, local collector picker, no new infrastructure, and preserved semantic search.
    **Tool**: `task(subagent_type="oracle")`
    **Steps**: Review changed files against `.sisyphus/plans/improve-rules-search-page-selection.md`, focusing on `index.js`, `utils/rulesClient.js`, `commands/regel.js`, and the new Jest coverage.
    **Expected**: Oracle explicitly approves that the implementation follows the planned architecture and did not introduce out-of-scope infrastructure or alternate UX.
    **Evidence**: `.sisyphus/evidence/f1-plan-compliance.txt`

- [ ] F2. Code Quality Review - unspecified-high

    **What to verify**: Confirm code quality, edge-case handling, cleanup behavior, and test adequacy for the feature slice.
    **Tool**: `task(category="unspecified-high")`
    **Steps**: Review the changed files plus test suite output, checking for brittle mocks, collector leaks, duplicate result handling, and unreadable command logic.
    **Expected**: Reviewer approves code quality with no blocking maintainability or correctness concerns.
    **Evidence**: `.sisyphus/evidence/f2-code-quality.txt`

- [ ] F3. Real Manual QA - unspecified-high (+ playwright if UI)

    **What to verify**: Confirm the end-user `/regel` flow works from autocomplete through post-search page selection using agent-executed validation only.
    **Tool**: `task(category="unspecified-high")` plus mocked command tests; use Playwright only if a Discord web session is already available.
    **Steps**: Review `tests/regel.test.js` coverage, rerun the full verification stack, and if authenticated Discord access already exists, exercise `/regel suche:wuch...` in a guild to confirm autocomplete and picker behavior against the deployed command.
    **Expected**: Reviewer approves that either the live Discord flow was validated or, if live Discord access was unavailable, the mocked interaction coverage and command registration smoke fully cover the user path without unresolved gaps.
    **Evidence**: `.sisyphus/evidence/f3-user-flow.txt`

- [ ] F4. Scope Fidelity Check - deep

    **What to verify**: Confirm the implementation stayed inside scope boundaries and that any skipped items were truly out of scope rather than silently dropped requirements.
    **Tool**: `task(category="deep")`
    **Steps**: Compare the delivered files and behavior to the original request, interview summary, Metis guardrails, and success criteria in this plan.
    **Expected**: Deep reviewer explicitly approves that the delivered feature solves the user request and that omissions are intentional scope boundaries, not misses.
    **Evidence**: `.sisyphus/evidence/f4-scope-fidelity.txt`

## Commit Strategy

- Commit after each logically complete slice: cache/data helpers, hybrid search orchestration, `/regel` UX changes, tests/verification.
- Use conventional commits with scope hints like `feat(regel): ...`, `feat(rules): ...`, `test(regel): ...`.
- Do not bundle command deployment output with unrelated logic changes.

## Success Criteria

- `/regel` supports exact-title discovery before command submission and result refinement after submission.
- A query like `Wuchtschlag` reliably puts the `Wuchtschlag` page in front of the user instead of only nearby semantic chunks.
- The selected page can be opened from the bot response and previewed in Discord without breaking semantic search.
- The implementation fits existing repo patterns and passes lint/tests without introducing new infrastructure.
