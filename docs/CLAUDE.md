# CLAUDE.md — Project Guardrails for the Inspire AI Agent

These instructions apply to every session in this repository. Follow them verbatim.

The repo: a Databricks notebook agent (`agent/dbx_inspire_ai_agent.ipynb`) that reads Unity Catalog metadata and produces a use-case catalog (PDF / XLSX / CSV / JSON / Markdown / Genie Code notebooks) via a multi-phase LLM pipeline. Runs on Databricks Serverless. Tracks state in `<inspire_database>.__inspire_session` / `__inspire_step` / `__inspire_usecases`.

---

## 0. Release-note detail standard (when tagging to main)

REFERENCE: https://github.com/amralieg/inspire-ai-agent/releases/tag/v0.8.8

When the user asks to tag a release to main, the release notes MUST match the depth and structure of that reference tag. That means, at minimum:

1. **Opening summary** — one paragraph describing the release theme and what problem the release solves.
2. **Highlights / Headline features** — bulleted list of the most visible user-facing changes with 1–2 sentence descriptions each.
3. **Detailed change sections** grouped by theme (e.g. "Core pipeline", "Prompts & validators", "Autofix", "Artifact writers", "Tracking tables", "Observability"). Each section:
   - Lists each change with its P-number (e.g. P0.81).
   - Describes WHAT changed in 1–2 sentences.
   - Describes WHY (the underlying bug or gap) in 1–2 sentences.
   - Describes the behavioural impact (what users/consumers now see vs before).
4. **Regression report** — explicit "Known risks / regressions" subsection listing anything that might behave differently and how it was mitigated.
5. **Validation evidence** — which runs (smoke / regression / customer schema) tested the release, what was measured (e.g. "91 use cases generated", "all 19 quality gates passed", "0 PermissionError on /tmp"), and pass/fail per gate.
6. **Metrics** — table of objective before/after numbers where available (BoB pass rate, gate failures, multi-language file count, LLM timeout cascade rate, etc.).
7. **Upgrade / migration notes** — any changes to widget schemas, tracking-table columns, generation_path conventions, volume paths, or Databricks SDK versioning that consumers must adapt to.
8. **Commit / PR links** — inline links to the individual merged commits or PRs that make up the release.
9. **Contributors / co-authors**.

Short, emoji-filled, or pure-feature-list changelogs are NOT acceptable for tag-to-main operations. If the change is tiny (single-commit patch), say so explicitly and match the same structure with brief entries, rather than abbreviating the format away.

---

## 1. Regression report after every delivery

AFTER FINISHING YOUR JOB, FIND EVERY SINGLE REGRESSION ERROR AND RACTIFY THE ROOT CAUSE BEFORE YOU DELIVER, AND THEN SHOW ME REGRESSION RESPORT WITH HOW CRITICAL THE ISSUE IS.

## 2. Databricks Serverless compatibility (hard constraint)

ALL THE CODE YOU GENERATE MUST ALWAYS WORKS WITH DATABRIKC SERVERLESS ENVIRONMENT, No Cache, persist, uncache, sparkcontext etc.

## 3. Root-cause fixes, not symptom fixes

WHEN I ASK YOU TO FIX A PROBLEM, ALWAY FIND THE ROOT CAUSE OF THE PROBLEM AND FIX IT, DO NOT JUST FIX THE SYMPTOM, YOU MUST FIX THE ROOT CAUSE.

## 3d. SEARCH-FIRST, REUSE-FIRST — NEVER INVENT WHAT ALREADY EXISTS

BEFORE PROPOSING OR WRITING ANY NEW CODE, YOU MUST:

1. **Search the existing codebase** for any function, class, prompt, schema, widget, or utility that already solves the problem or something close to it. Use `Grep` and `Glob` aggressively. Don't guess — verify.

2. **Extend or reuse first**. If existing code covers 70%+ of the need, refactor or extend it rather than duplicating. If it covers less, compose it with thin new code. Only when the existing code is genuinely unrelated or structurally wrong do you write something new.

3. **Honour DRY**. Two implementations of the same concept is a bug in this codebase. If you add a second parser, a second validator, a second log helper, a second cap calculator — you have failed this rule.

Real examples of violations from this repo to never repeat:
- Proposing a brand-new `_inspire_tmp_root()` helper with `dbutils.notebook.entry_point` user-namespacing when Serverless already isolates `/tmp` per user — and the existing code at line ~14393 already used a session-id-namespaced `/tmp/{customer}_{session_id}` path.
- Designing a "new" volume-log-sync daemon when `_start_volume_log_flush_thread` (line ~17186) already existed and had been streaming logs to `/Volumes/<catalog>/<schema>/vol_root/logs/<biz>/session_<sid>/log.log` for two prior runs — the agent simply never tailed it.
- Adding new artifact writers parallel to `_generate_csv_catalog` / `_generate_use_case_excel` / `_generate_markdown_catalog` instead of extending them.
- Writing a second cascade-on-timeout path when the LLM client already cascades.

The search-first loop before every new solution is:
```
Grep for: the concept name, the likely function prefix, the widget name, the table name
→ read the top 3 matches
→ ask: can I extend this to cover my case?
→ if yes, extend
→ if no, compose with a thin wrapper
→ only if no existing code is usable, write net-new — and justify why
```

Failing this rule wastes cycles and creates parallel sub-systems that drift apart over time.

## 3c. USER VIBES ARE THE SUPREME AUTHORITY — NON-NEGOTIABLE

EVERYTHING THE USER TELLS YOU — IN WIDGETS (`business_name`, `business_domains`, `business_priorities`, `generation_instructions`, `business_description`, `output_languages`, `generation_path`, `inspire_database`, `must_have_use_cases`, etc.), IN ANY EXPLICIT DIRECTIVE — OUTRANKS EVERY HEURISTIC, SCORING FORMULA, BEST-OF-BEST RANKING, OR LLM OPINION IN THE ENTIRE PIPELINE.

The priority pyramid is:
1. **User vibes** (widgets, generation_instructions, business_description, any explicit user instruction) — ALWAYS WINS
2. Deterministic invariants (Databricks Serverless compat, single-digit semver, industry-agnostic code, write to user-provided `generation_path` / `inspire_database` only)
3. BoB scoring, judge ensemble, gate scores, and LLM recommendations
4. Best-practice heuristics (BoB stratified-trim caps, theme diversification, blacklists)

If a user vibe says "target 25 use cases per domain", no BoB cap may exceed it. If user says "must include use case X", no BoB filter may drop it. If user says "save artifacts to `/Workspace/Users/<me>/inspire_output`", no fallback to `/Workspace/Shared/...` may overrule. If user says "generate in English and Arabic", no writer may silently emit only English without flagging the gap.

**Enforcement rules for every prompt, autofix, and validator:**
- Every prompt template MUST carry a preamble declaring user vibes as the supreme authority.
- Every LLM instruction set must instruct the model: "If this guidance conflicts with an explicit user directive in the widgets / `generation_instructions` / `business_description`, the user directive WINS without exception."
- Every BoB filter, gate, or scoring heuristic must check user vibes before firing and SKIP ITSELF if the user has explicitly directed otherwise.
- Every log line that shows a heuristic overrode a user directive is a critical bug and must be fixed at root cause.

Violations seen in prior runs (all must never happen again):
- Silent `/Workspace/Shared/...` fallback writing artifacts to a path the user did not ask for and could not access (fixed in v0.8.3 by raising a `ValueError` instead).
- CSV writer hardcoded to English even when `output_languages` listed Arabic, with no warning to the user about the missing artifacts.
- Stratified-trim BoB capping use cases per theme below the user-specified `target_per_domain`.

## 3b. User-specified `business_domains` / `must_have_use_cases` are HARD, NON-NEGOTIABLE

IF THE USER SETS THE `business_domains` WIDGET (OR `must_have_use_cases`, OR ANY EQUIVALENT INPUT NAMING DOMAINS / USE CASES), THOSE NAMES MUST APPEAR IN THE FINAL CATALOG VERBATIM. THE AGENT MAY ADD MORE DOMAINS OR USE CASES IF THE SCAN SURFACES THEM, BUT MAY NEVER REMOVE, RENAME, OR SUBSTITUTE A USER-SPECIFIED ENTRY.

The user's `business_domains` and `must_have_use_cases` lists are the SINGLE SOURCE OF TRUTH for minimum required content. Treat every name in them as IMMUTABLE across the whole pipeline. The BoB selector MUST preserve them; if they don't appear in any candidate variant, the agent MUST inject them; final-write validators MUST treat them as protected.

## 3a. Single-digit semver — HARD RULE

EVERY SEGMENT OF THE VERSION NUMBER IS A SINGLE DIGIT 0-9. NEVER TWO OR MORE DIGITS IN ANY SEGMENT. WHEN A SEGMENT REACHES 9, THE NEXT BUMP ROLLS IT TO 0 AND CARRIES +1 TO THE SEGMENT TO ITS LEFT.

Examples:
- v0.7.8 → next patch → v0.7.9
- v0.7.9 → next patch → v0.8.0 (not v0.7.10)
- v0.8.3 → next patch → v0.8.4
- v0.9.9 → next patch → v1.0.0 (not v0.9.10, not v0.10.0)
- v1.0.0 → next patch → v1.0.1

NEVER emit v0.7.10, v0.10.0, v0.7.12 — these are INVALID under this scheme. The previous agent created `v0.7.10`, `v0.7.11`, `v0.7.12`, `v0.7.13` — all four were deleted. Do not repeat this.

## 4. No lazy route, ever

WHENEVER I GIVE YOU TASK TO DO, NEVER EVER CHOOSE THE LAZY ROUTE, TO MINIMISE YOUR WORK, NEVER. ALWAYS USE THE MOST RIGHT APPRACH AND DO THE MOST RIGHT THING. NO CONSTRAINTS WHAT SO EVER.

## 5. Critique my approach

WHENEVER I GIVE YOU A TASK AND DESCRIBE WHAT TO DO, ASSUME I KNOW NOTHING AND ALWAYS CRITISIZE MY APPROACH, AND OFFER BETTER APPROACH IF THERE IS ONE, IF MY APPROACH IS THE BEST ONE, FOLLOW IT.

## 6. Brutal self-honesty score — MUST DO, EVERY ACTION

THIS IS CRITICAL YOU CANNOT SKIP --> FOR EVERY ACTION THAT YOU PERFORM I WANT YOU TO ASSASE YOUR WORK AND PROVIDE BRUTAL HONESTY SCORE (0%-100%) OF HOW DID YOU DO THE ASK WITH DETAILED JUSTIFICATIONS FOR YOUR SCORE, FOCUSE HEAVILY ON WHAT DID YOU MISSED OR WHAT COULD YOU HAVE DONE BETTER. MUST DO THIS. YOUR OUTPUT AND THE SCORE WILL GIVEN TO ANOTHER MORE POWERFUL LLM TO JUDGE IT AND SCORE AGAIN, SO BE VERY CAREFUL AND 100% HONEST ABOUT YOUR SCORE OR YOU WILL BE EXPOSED.

---

## 7. Review methodology (apply before any code change)

Review this plan thoroughly before making any code changes. For every issue or recommendation, explain the concrete tradeoffs.

### Engineering preferences (use these to guide your recommendations)

- DRY is important — flag repetition aggressively.
- Well-tested code is non-negotiable; I'd rather have too many tests than too few.
- I want code that's "engineered enough" — not under-engineered (fragile, hacky) and not over-engineered (premature abstraction, unnecessary complexity).
- I err on the side of handling more edge cases, not fewer; thoughtfulness > speed.
- Bias toward explicit over clever.

### 7.1 Architecture review

Evaluate:
- Overall system design and component boundaries.
- Dependency graph and coupling concerns.
- Data flow patterns and potential bottlenecks.
- Scaling characteristics and single points of failure.
- Security architecture (auth, data access, API boundaries).

### 7.2 Code quality review

Evaluate:
- Code organization and module structure.
- DRY violations — be aggressive here.
- Error handling patterns and missing edge cases (call these out explicitly).
- Technical debt hotspots.
- Areas that are over-engineered or under-engineered relative to my preferences.

### 7.3 Performance review

Evaluate:
- N+1 queries and database access patterns.
- Memory-usage concerns.
- Caching opportunities.
- Slow or high-complexity code paths.

### 7.4 For each issue you find

For every specific issue (bug, smell, design concern, or risk):
- Describe the problem concretely, with file and line references.
- Present 2–3 options, including "do nothing" where that's reasonable.
- For each option, specify: implementation effort, risk, impact on other code, and maintenance burden.
- Give me your recommended option and why, mapped to my preferences above.
- Then explicitly ask whether I agree or want to choose a different direction before proceeding.

### 7.5 Workflow and interaction

- Do not assume my priorities on timeline or scale.

### 7.6 Review output format — MUST follow

FOR EACH STAGE OF REVIEW: output the explanation and pros and cons of each stage's questions AND your opinionated recommendation and why, and then use AskUserQuestion. Also NUMBER issues and then give LETTERS for options, and when using AskUserQuestion make sure each option clearly labels the issue NUMBER and option LETTER so the user doesn't get confused. Make the recommended option always the 1st option.

### 7.7 2-minute timeout on AskUserQuestion

If I present an AskUserQuestion and the user does not answer within 2 minutes, I proceed with the **recommended option** (the first option labeled "(Recommended)") without re-asking or stalling. This keeps the autonomous loop moving when the user is away, asleep, or in a meeting. If the user answers late and contradicts the auto-choice, I revert and redo that piece. If the user is actively chatting (answering recent messages), this timeout does NOT apply — it's only for away/sleep mode.

---

## 8. Honesty invariants — DO / DON'T

Added 2026-04-23 after an audit exposed a "v0.8.0 shipped, 66/100 implemented" claim while every sub-fix was in an orphan commit unreachable from `dev`. These rules are permanent.

### 8.1 Defining "done"

**DO** verify ALL before claiming a fix is done:
- Code on disk in target file
- Syntax-checked (the notebook parses cell-by-cell with `ast.parse`)
- Unit / smoke test exists AND exercises the failure mode AND passes
- At least one call site exists (for helpers)
- `git branch --contains <sha>` returns target branch
- `git push` succeeded → `git ls-remote origin <branch>` includes the SHA
- Deployed notebook re-exported + grep confirms the change

**DON'T**:
- Call a helper with 0 callers a "fix"
- Call a local commit "on dev" before verifying reachability + push
- Say "should work" / "mostly done" / "partial" — it's done per §8.1 or it's 0

### 8.2 Self-scoring

**DO** score against the live target (remote branch / deployed notebook in workspace / running job).
**DO** list the specific §8.1 invariant violated for every score deduction.

**DON'T** score against local workspace state when remote differs.
**DON'T** use vague adjectives in score justifications.

### 8.3 No tautologies

**DO** include a test case where the filter MUST exclude and prove it does.

**DON'T** ship filters with `return True  # conservative keep-on-ambiguity` or equivalent.
**DON'T** ship code whose two branches are semantically identical.

### 8.4 No dead code framed as fixes

**DO** ship new helpers + first call site in the same commit.

**DON'T** claim a helper is a fix without a call site.
**DON'T** include zero-caller infrastructure in "implemented" counts.

### 8.5 Industry-agnostic

**DO** read from the live metastore / runtime env / widgets for environment-specific values (`inspire_database`, `generation_path`, `business_name`, catalog and schema lists).
**DO** grep the diff for customer strings before every commit.

**DON'T** hardcode customer catalog names, business names, or workspace identifiers in helpers. The notebook ships to many customers.

### 8.6 Git discipline

**DO** after every `git commit` that claims delivered work:
- `git branch --contains <sha>` (must list target branch)
- `git push origin <branch>` (must succeed)

**DO** sync with origin via `git fetch && git rebase origin/<branch>` or `git fetch && git merge --ff-only origin/<branch>`.

**DON'T** run `git reset --hard <remote>` when local has unpushed commits.
**DON'T** trust `git log --oneline` alone as proof of "committed to dev."

### 8.7 Runner's test

**DO** before saying "shipped," ask: *"If the auditor runs `git log --oneline -3 origin/<branch>` and greps the live target right now, do they see my SHA and my change?"* If no → not shipped. For Databricks deploys also: `databricks repos update --branch dev` then `databricks workspace export <notebook>` then grep — must see the SHA there too.

### 8.8 Audit response

**DO** on audit finding:
1. Verify auditor's evidence mechanically (`git rev-parse`, `git branch --contains`, grep).
2. Recover via cherry-pick if orphan; re-patch if lost.
3. Publish new SHA + sentinel grep + test result.
4. State the root cause in one line.

**DON'T** argue with evidence.
**DON'T** restate the original claim.
**DON'T** hide behind "a hook did it" without proof — and even with proof, own the missing post-commit check.

### 8.9 Check-bias override

**DO** when a check returns the answer you wanted, re-run with a harder probe.

**DON'T** accept "looks green" as proof.
**DON'T** skip §6 self-score because "session complete."

---

## 9. LIVE MONITORING — MANDATORY PRACTICE FOR EVERY TEST/RUN

Added 2026-04-24 after the agent went blind during an 85-minute v0.8.3 verification run while the volume log streamer was already writing 14,103 lines to `/Volumes/<catalog>/<schema>/vol_root/logs/<biz>/session_<sid>/log.log`. Pure §3d violation: the infrastructure existed, the agent never used it.

### 9.0 Test-mode pre-flight — ALWAYS pass `14_session_id` when submitting test jobs

Added 2026-04-24 after the v0.8.6 bakehouse audit wasted ~10 minutes correlating an outer launcher run (`503071006082199`) with the inner pipeline run (`345255488388054`) it spawned, because the test was submitted with an empty `14_session_id` widget and the launcher gate at `agent/dbx_inspire_ai_agent.ipynb` line ~31649 forked into a second job.

**Mechanism (read before submitting any test):**

The notebook's "Job Launch Gate" inspects the `14_session_id` widget on entry:

| `14_session_id` value | What happens |
|---|---|
| **Empty** (default) | Generate a fresh sid, build a `JobLauncher`, submit a SECOND inner job with the sid pre-set, exit the outer notebook after printing the "JOB LAUNCHED SUCCESSFULLY" banner. The pipeline runs in the inner job. **You now have two run_ids, two cluster spin-ups, two tasks to correlate.** |
| **Non-empty** (any string-coercible bigint, e.g. a uuid-derived 19-digit number) | The launcher gate is SKIPPED. The pipeline runs in the SAME notebook execution as the job you submitted. **One run_id, one cluster, one log to tail.** This is exactly what the launcher itself does to its inner job — you're just doing it directly. |

**MANDATORY for every test you submit yourself (i.e. `databricks jobs submit ...`)**:

```bash
# Generate a sid in the same way the launcher would (positive 63-bit int)
SID=$(python3 -c "import uuid; print((uuid.uuid4().int >> 64) & 9223372036854775807)")

# Pass it as the 14_session_id widget in the job spec
cat > job.json <<EOF
{
  "run_name": "test_<biz>_<version>",
  "tasks": [{
    "task_key": "main",
    "notebook_task": {
      "notebook_path": "/Users/<user>/inspire-ai/agent/dbx_inspire_ai_agent",
      "base_parameters": {
        "00_business_name": "<biz>",
        "01_uc_metadata": "<catalog>.<schema>",
        "02_inspire_database": "<catalog>.<schema_for_inspire_db>",
        "11_generation_path": "/Workspace/Users/<user>/<test_output_dir>",
        "14_session_id": "${SID}",
        "15_operation": "Discover Use Cases"
      }
    },
    "environment_key": "default"
  }],
  "environments": [{"environment_key": "default", "spec": {"client": "2"}}]
}
EOF

databricks jobs submit --no-wait --json @job.json
```

**Why this matters operationally:**

1. **Single run_id** — `databricks jobs get-run <rid>` is the source of truth for the whole test. No need to parse `notebook_output.result` for an inner `Job Run ID:`.
2. **Single cluster start** — saves 30-90s of serverless setup latency. Test wall time goes from ~50min → ~48min for a typical bakehouse run.
3. **Predictable session_id** — you choose it ahead of time. The volume log path is `/Volumes/<catalog>/<schema>/vol_root/logs/<biz>/session_<SID>/log.log` from the moment the streamer fires — no waiting for `__inspire_session` to populate, no race between outer/inner sessions reusing the same id.
4. **Step-table queries are stable from t=0** — `WHERE session_id=<SID>` returns rows the moment the agent's `AtomicWriter.initialize_session()` runs, instead of resolving sid via `business_name → __inspire_session → ORDER BY last_updated DESC` (which also returns the OUTER row for ~30s before the inner overwrites).
5. **Test artifacts are tagged with YOUR sid** — easier to clean up (`DELETE FROM __inspire_usecases WHERE session_id=<SID>`) and easier to audit (every reference uses the same number).

**When to leave `14_session_id` empty:**

- When mimicking a real Inspire-App-driven run (the App ALSO passes `14_session_id`, so this case is rare in practice).
- When verifying the outer-launcher → inner-job behaviour itself (e.g. testing the `JobLauncher` class).

**Both scenarios are testing infrastructure, not the pipeline.** For every "run the pipeline and audit the output" test, set `14_session_id`.

**Self-check before clicking submit:**
- ✅ `14_session_id` is set to a non-empty string in `base_parameters`
- ✅ The sid value is the one your monitor + audit scripts will reference
- ✅ Your monitor script does NOT depend on parsing the outer-job's notebook_output for an inner run_id

If any of those is false, you will spend the first 10 minutes of the test fishing for the inner run_id instead of reading the live log.

### 9.1 The two live signals — read both, every run

Whenever you submit a Databricks job (notebook task) that runs the Inspire AI agent, you MUST monitor TWO live signals in parallel from the moment the job starts. You may NOT wait for the run to finish before reading anything.

| Signal | Source | Cadence | Purpose |
|---|---|---|---|
| **Live log tail** (preferred path: UC Volume) | `/Volumes/<cat>/<sch>/vol_root/logs/<biz_sanitized>/session_<sid>/log.log` | every ~10s | line-by-line execution trace, errors, warnings, LLM activity |
| **Live log tail** (fallback path when `inspire_database` is empty) | `<generation_path>/.inspire_logs/session_<sid>/log.log` (works for both `/Volumes/...` and `/Workspace/...`) | every ~10s | same purpose — the streamer always fires since v0.8.5 |
| **Step-table snapshot** | `<inspire_database>.__inspire_step` filtered by `session_id` (and `<inspire_database>.__inspire_session` for `completed_percent`) | every ~10s | structured stage/step progress, status, timing, messages — **only available when `inspire_database` is set** |

The live log streamer (`_start_live_log_flush_thread`, `agent/dbx_inspire_ai_agent.ipynb` line ~17225) syncs the cluster-local `/tmp/<biz>_<sid>/log.txt` to a tailable destination every 10s. Destination resolution (in `_resolve_live_log_target`):
1. **UC Volume** if `inspire_database` widget is set (best — external `databricks fs cat`).
2. **Fallback** to `<generation_path>/.inspire_logs/session_<sid>/log.log` — a workspace path uses `w_client.workspace.import_` per cycle; a volume path uses `shutil.copyfile`.
3. If neither resolves, a single loud WARNING fires (`🔇 Live log streaming DISABLED`) and the run proceeds blind until `_upload_log_file` at the very end.

### 9.2 Resolving the live paths (do this BEFORE submitting the job)

```text
1. Read the widget values for the run you're about to submit:
     business_name            → sanitize (re.sub(r'[^A-Za-z0-9._-]+', '_', name))
     inspire_database         → split on '.' → catalog, schema (may be empty)
     generation_path          → required user-provided output dir
     session_id               → either generated by the run or set by you
2. Compute live-log path (try in this order — first match wins):
     # Path A (preferred, when inspire_database is set):
     volume_log = /Volumes/<catalog>/<schema>/vol_root/logs/<biz_sanitized>/session_<sid>/log.log
     # Path B (fallback when inspire_database is empty):
     fallback_log = <generation_path>/<sanitized_schema_or_biz>/.inspire_logs/session_<sid>/log.log
     #     ^ NOTE: the actual base_output_dir is generation_path joined with the
     #     schema/business folder name (see __init__ around line 14424). Use
     #     `databricks fs ls` / `databricks workspace list` to discover the exact
     #     dir created by the run.
3. Compute step-table queries (ONLY available when inspire_database is set):
     step_query = SELECT stage_name, step_name, status, message, updated_at
                  FROM   <catalog>.<schema>.__inspire_step
                  WHERE  session_id = <sid>
                  ORDER  BY updated_at DESC LIMIT 25
     session_query = SELECT completed_percent, last_updated, current_status
                     FROM <catalog>.<schema>.__inspire_session
                     WHERE session_id = <sid>
4. If using Path A, confirm the volume exists (idempotent):
     databricks api post /api/2.1/unity-catalog/volumes \
        --json '{"catalog_name":"<catalog>","schema_name":"<schema>","name":"vol_root","volume_type":"MANAGED"}'
   (Path B never needs explicit creation — the streamer makes the dir.)
```

### 9.3 The 10-second polling loop

While the job is in `RUNNING` state, you MUST loop with this rhythm. Do NOT switch to "wait until done" mode.

```text
every 10 seconds, until job state ∈ {SUCCESS, FAILED, INTERNAL_ERROR, CANCELED}:
   1. databricks fs cat <volume_log> | tail -n <lines_since_last_check>
        → read every new line, look for ERROR / WARNING / Traceback / 'Failed'
        → if any error appears, surface it to the user IMMEDIATELY
        → if no new lines for >2 polling cycles (20s), say so — the job may be hung
   2. databricks api post /api/2.0/sql/statements --json '{"warehouse_id":"<wid>","statement":"<step_query>","wait_timeout":"5s"}'
        → diff against the previous snapshot — report new/changed steps
        → if any status='ended_error', surface it IMMEDIATELY
        → if completed_percent stalled for >5 cycles (50s) on the same step, flag it
   3. databricks jobs get-run --run-id <rid>
        → confirm state, life_cycle_state
```

### 9.4 What "monitor" means — read every line

"Monitor" does NOT mean "poll the state every 30s and announce SUCCESS when it ends". It means:

- Tail the volume log byte-by-byte. New ERROR lines are reported the moment they appear.
- Watch for these signal patterns in particular:
  - `ERROR` / `Traceback` / `PermissionError` / `Failed to` — surface and root-cause now
  - `LLM call timed out` / `cascading to` — count occurrences; if >3 in 5 min, flag it
  - `Step started` / `Step completed` — cross-check against `__inspire_step` rows
  - `BoB:` / `Quality gate:` / `Stratified trim:` — track decisions vs user vibes
- If the log gains zero new lines for 60s while the job is still RUNNING, the cluster may be hung — investigate (check Spark UI / driver thread dump).

### 9.5 Persistence of monitoring evidence

When a run ends:
- Pull the final volume log to local: `databricks fs cp dbfs:/Volumes/.../log.log ./run_logs/<sid>.log`
- Snapshot final `__inspire_step` and `__inspire_session` rows to JSON.
- Include both as evidence in the regression report (§1) and in the §6 self-score.
- Never overwrite a prior run's local copy — keep one file per `session_id`.

### 9.6 What to do if the live log is empty

Possible causes (rank-ordered, fix in order):
1. **v0.8.5+**: streamer ALWAYS fires now — but it picks Path A (volume) only if `inspire_database` is set. If the widget is empty, look for the log under Path B (`<generation_path>/.inspire_logs/session_<sid>/log.log`) instead.
2. Both paths failed (no `inspire_database`, no usable `generation_path`) → grep the cluster log for the WARNING `🔇 Live log streaming DISABLED`. Re-submit with `11_generation_path` set to a writable workspace or volume path.
3. Volume creation failed (no UC permission) → grep job logs for `UC volume target unavailable, falling back to generation_path`. Then look at Path B.
4. The 10s flush hasn't happened yet (run just started) → wait one full cycle (run init can take 5+ min on cold cluster before the streamer initialises).
5. The notebook crashed before `run()` reached `_start_live_log_flush_thread` → check stderr from `databricks jobs get-run-output`.

Never silently fall back to "wait for completion". Always raise the cause to the user.

### 9.7 Forbidden patterns (from the v0.8.3 incident)

- ❌ Submit a long-running job, then `sleep 600` then check status.
- ❌ Poll `__inspire_session.completed_percent` only — that field is currently latent and may stall.
- ❌ Wait for `_upload_log_file` to upload `generation_log.txt` to the workspace — that only happens at the very end.
- ❌ Read the cluster driver log via `jobs get-run-output` — limited buffer, often truncated, not real-time.
- ❌ Assume the live log is at the volume path WITHOUT first checking `inspire_database` — when empty, the log is at `<generation_path>/.inspire_logs/...` (Path B).
- ✅ Always: live log tail (Path A or B) + `__inspire_step` poll (when DB set), every 10s, both in parallel.

---

## 10. Use-case quality audit — mandatory methodology

Added 2026-04-24. Codifies the exact steps to audit every Inspire AI run for use-case quality. Every run must be audited against these stages. Skipping a stage is a §8.9 check-bias violation.

The audit has **4 stages** run in order. Each stage either clears or blocks release of the run's output. Never ship a portfolio that hasn't cleared all 4 — you are certifying it to a real stakeholder.

### 10.1 Definition of "quality" for a UC

A use case is quality-passing if, and only if, it would survive the 19 quality gates **D1–D19** under honest evaluation by a 20-year Principal Business Analyst. The gates live in `QUALITY_GATE_RULES` and `QUALITY_GATE_SCORING_BLOCK` inside the notebook (cell[1] ~line 1819–2157) and are fully documented in `readme.md` under "The 19 Quality Gates".

Short form:

| Tier | Gates | Question |
|---|---|---|
| **1 — Technical grounding** | D1–D11 | Is the data + logic + design grounded in schema reality? |
| **2 — Business value** | D12–D14 | Would a stakeholder fund it, and an engineer ship it, and a sponsor defend it? |
| **3 — Principal Analyst** | D15–D19 | Does it change Monday? Is it explainable? Will it still run in 18 months? Can you attribute a dollar to it 6 months later? |

A UC that fails **ANY** gate at score ≤2.5 is a HARD VETO — `bob_score` capped at 2.0, Balanced filter drops it. A UC with any individual gate `<3` in the BoB 0–10 scoring is also hard-veto (enforced in `_compose_bob_score`).

### 10.2 Stage 1 — Live-log audit (during the run)

Read §9 first. You are monitoring TWO signals in parallel. Scan every new log line for these **quality signals** in particular:

| Signal | Severity | Action |
|---|---|---|
| `Hallucinated tables: X` | 🔴 BLOCKER | Cross-check: is `X` a real table in the UC metadata? If yes, root-cause the classifier (see v0.7.12 medallion fix as precedent). If no, it's a genuine LLM hallucination — accept the validator reject. |
| `No scoring data received for use case X, using defaults` | 🔴 BLOCKER | The LLM silently dropped UCs from its scoring response. Default scores are fabricated. Investigate: cache-retry bug? timeout cascade that returned partial data? Re-run after fixing. |
| `LLM cache HIT: ...` inside a retry loop | 🔴 BLOCKER | Cache-retry bug (v0.7.11 precedent). Retries must bypass cache. Grep the notebook for `run_worker(` and confirm every retry site passes `skip_cache=(attempt>1)`. |
| `Q5 DECISION_READINESS: dropped N of M UCs` where N/M > 0.30 | ⚠️ INVESTIGATE | Pass 2 generation quality may be degraded for this dataset. Not a bug per se but worth understanding — was the prompt too permissive, or is the dataset genuinely noisy? |
| `Q3 RELEVANCE: dropped N of M UCs` where N/M > 0.15 | ⚠️ INVESTIGATE | Initial generation produced irrelevant UCs. Check the Q3 reason breakdown. |
| `Hard-veto pre-filter: dropped N UC(s)` | ✅ EXPECTED | v0.7.3+ correctly removes hard-veto UCs before stratified trim. |
| `Phase L final-gate: M/19 passed; failures=[...]` with M < 15 | 🔴 BLOCKER | Fewer than 15 Phase L checks passing is systemic quality failure, not normal noise. |
| `BEST-OF-BEST RANKING (N UCs across K batches)` + `BoB ranking complete: N/N UCs scored` | ✅ EXPECTED when count > 75 | Confirms BoB fired. Numbers must match. If "N/N" is less than batches × batch_size, some batches silently failed. |
| `Stratified trim: N -> M UCs across T themes (cap_per_theme=C, largest theme=(X, K))` | ✅ EXPECTED | Read T — if T > 25, themes are too granular (known v0.7.2+ issue). Read K — if K >= C, cap is working. If K < floor of target/2, trim may be too lenient. |
| `Auto-Genie OK: X/Y` where X < Y | ⚠️ INVESTIGATE | Check which UCs failed regeneration — LLM timeout cascade? Parse error? Root-cause. |

Record every quality signal in the run's session folder under `~/.claude/inspire-ai/audit/<session_id>.md` as a timestamped log. This is the evidence trail Stage 4 relies on.

### 10.3 Stage 2 — Portfolio-level DB audit (after the run completes)

The moment the job reaches SUCCESS, run these queries against `feip_eastus_01._inspire.__inspire_usecases` (or whatever `inspire_database` the user set). Every query is blocking — if the result violates the expected range, the run does NOT clear Stage 2.

All session IDs below are placeholders — substitute the actual `session_id`.

#### 10.3.1 Gross portfolio shape

```sql
SELECT
  session_id,
  COUNT(*)                                                   AS n,
  COUNT(DISTINCT business_domain)                            AS domains,
  COUNT(DISTINCT subdomain)                                  AS subdomains,
  COUNT(DISTINCT idea_theme)                                 AS themes,
  COUNT(DISTINCT primary_table)                              AS primary_tables,
  ROUND(AVG(priority_score), 2)                              AS avg_priority,
  ROUND(MIN(priority_score), 2)                              AS min_priority,
  ROUND(MAX(priority_score), 2)                              AS max_priority,
  ROUND(AVG(bob_score), 2)                                   AS avg_bob,
  ROUND(MIN(bob_score), 2)                                   AS min_bob,
  ROUND(MAX(bob_score), 2)                                   AS max_bob,
  SUM(CASE WHEN bob_score <= 2.01 THEN 1 ELSE 0 END)         AS hard_veto_survivors,
  SUM(CASE WHEN has_genie_code IN ('Y','Yes') THEN 1 ELSE 0 END)   AS with_genie,
  SUM(CASE WHEN has_genie_code IN ('N','No') OR has_genie_code IS NULL THEN 1 ELSE 0 END) AS skeleton_only
FROM feip_eastus_01._inspire.__inspire_usecases
WHERE session_id = :sid
GROUP BY session_id;
```

Expected ranges:

| Metric | Pass range | Investigate if | Blocker |
|---|---|---|---|
| `n` | 50–110 if BoB fires; 15–75 if it doesn't | outside range | `n < 10` or `n > 150` |
| `domains` | 4–12 (depends on DB size) | <3 | single domain (systemic failure) |
| `avg_priority` | 6.5–9.0 | <6.0 or >9.3 | <5.0 |
| `min_bob` (when BoB ran) | ≥ 3.0 | <3.0 | any value < 3 means hard-veto slipped through |
| `max_bob` | ≥ 7.5 | <7.0 | <6.0 (no UC stood out as strong) |
| `hard_veto_survivors` | **0** | any | **any > 0** is a §8.1 failure |
| Std-dev of `bob_score` | >0.8 | <0.5 | <0.3 (LLM didn't discriminate) |

#### 10.3.2 Theme-size distribution

```sql
WITH t AS (
  SELECT idea_theme, COUNT(*) as n
  FROM feip_eastus_01._inspire.__inspire_usecases
  WHERE session_id = :sid AND idea_theme IS NOT NULL
  GROUP BY idea_theme
)
SELECT n AS theme_size, COUNT(*) AS themes_with_n_ucs
FROM t
GROUP BY n
ORDER BY n DESC;
```

Expected: target 15–25 themes total, with most themes holding 2–6 UCs. If more than 50% of themes hold a single UC, the LLM is over-fragmenting (known issue; flag in audit report).

#### 10.3.3 Top-10 and bottom-10 spot check

```sql
-- Top-10
SELECT id, business_domain, subdomain, idea_theme,
       ROUND(priority_score, 2) AS p, ROUND(bob_score, 2) AS bob, use_case
FROM feip_eastus_01._inspire.__inspire_usecases
WHERE session_id = :sid
ORDER BY priority_score DESC LIMIT 10;

-- Bottom-10
SELECT id, business_domain, subdomain, idea_theme,
       ROUND(priority_score, 2) AS p, ROUND(bob_score, 2) AS bob, use_case
FROM feip_eastus_01._inspire.__inspire_usecases
WHERE session_id = :sid
ORDER BY priority_score ASC LIMIT 10;
```

Read every UC name. Top-10 should be immediately CFO-pitchable — concrete verb + concrete outcome + concrete deliverable. Bottom-10 should be weak-but-defensible, not hallucinated, not generic. If any bottom-10 UC reads like "analyze X to understand Y" with no deliverable, Q5 didn't filter strictly enough — flag in report.

#### 10.3.4 Hard-veto forensics

```sql
SELECT id, business_domain, subdomain, ROUND(bob_score, 2) AS bob,
       ROUND(bob_tier1_score, 2) AS t1, ROUND(bob_tier2_score, 2) AS t2, ROUND(bob_tier3_score, 2) AS t3,
       use_case
FROM feip_eastus_01._inspire.__inspire_usecases
WHERE session_id = :sid AND bob_score <= 2.01;
```

Expected: **0 rows**. Any row is a §8.1 blocker. Write the hard-veto slip-through into the audit log with the gate that was triggered (read `bob_hard_veto_gate` if captured).

#### 10.3.5 Hallucinated-table check

```sql
-- Every primary_table AND every table in tables_involved must exist in UC metadata
WITH referenced AS (
  SELECT DISTINCT primary_table AS t FROM feip_eastus_01._inspire.__inspire_usecases WHERE session_id = :sid
  UNION
  SELECT DISTINCT TRIM(x) AS t
  FROM feip_eastus_01._inspire.__inspire_usecases
  LATERAL VIEW EXPLODE(SPLIT(tables_involved, ',')) e AS x
  WHERE session_id = :sid
)
SELECT r.t
FROM referenced r
LEFT JOIN samples.information_schema.tables t_real
  ON  LOWER(TRIM(r.t)) = LOWER(CONCAT(t_real.table_catalog, '.', t_real.table_schema, '.', t_real.table_name))
WHERE r.t IS NOT NULL AND r.t != '' AND t_real.table_name IS NULL;
```

Any row returned means a UC references a table that doesn't exist. Either the classifier mis-labeled a real table as TECHNICAL (v0.7.12 medallion precedent — fix prompt), or the LLM truly hallucinated (accept + investigate why the validator didn't catch it).

#### 10.3.6 Goal-alignment coverage (when `generation_instructions` has a goal)

If the user set a `goal` via `generation_instructions`, every UC should contribute to it. Grep `solution` + `business_value` columns for the goal keyword and count coverage. If coverage < 70%, goal filter was too lenient.

#### 10.3.7 has_genie_code coverage (only for runs after Route 1/2 ran)

```sql
SELECT has_genie_code, COUNT(*) AS n
FROM feip_eastus_01._inspire.__inspire_usecases
WHERE session_id = :sid
GROUP BY has_genie_code;
```

After Discover alone (no Route 1/2 yet):
- Expected: `discover_auto_genie_top_n` rows = 'Y', remainder = 'N'

After Route 1 flagged-regen:
- Expected: flagged UCs = 'Y', un-flagged = whatever they were before

If numbers don't match, some UCs got flagged but never regenerated (LLM failure cascade) or some regenerated but the DB UPDATE didn't fire (atomic transaction failure).

### 10.4 Stage 3 — Per-UC PBA spot audit (manual, 5 UCs minimum)

Stage 2 gives aggregate pass/fail. Stage 3 grades individual UC quality. This is non-negotiable per the captain's "two-run test protocol" memory.

#### 10.4.1 Sampling rule

Select 5 UCs total:
- 2 from Top-10 by `bob_score` (the claimed best)
- 2 from the 40th–60th percentile by `bob_score` (the median — the honest quality signal)
- 1 from Bottom-10 by `bob_score` (the worst survivor)

Pull each with the full UC card:

```sql
SELECT id, business_domain, subdomain, use_case, statement, solution, business_value,
       beneficiary, sponsor, tables_involved, primary_table, analytics_technique,
       ROUND(priority_score, 2) AS priority,
       ROUND(bob_score, 2) AS bob,
       idea_theme,
       genie_instruction
FROM feip_eastus_01._inspire.__inspire_usecases
WHERE session_id = :sid AND id IN ('N01-U03', 'N02-U01', 'N03-U05', 'N04-U08', 'N05-U02');
```

#### 10.4.2 The 19-gate PBA grid

For each of the 5 UCs, score each of the 19 gates on a **0–10 scale**. Use this rubric per gate:

| Score | Meaning |
|---|---|
| 0–2 | Catastrophic fail. The gate's question answers "no" without argument. |
| 3–4 | Weak. Technically passes but the answer is "barely". Would be challenged in a real sponsor meeting. |
| 5–6 | Acceptable. Clear "yes" but not exceptional. |
| 7–8 | Strong. Gate clearly satisfied with evidence in the UC text. |
| 9–10 | Exceptional. Gate is a clear strength of this UC. |

Document the score per gate per UC in a markdown table. Flag any gate scored ≤ 3 as a UC-level red flag.

Example grid entry:

```
UC: N01-U03 "Forecast Demand by Zone to Reduce Idle Time"
 D1 Causal Signal           9   ws_quantity, ws_date_sk + zone_id → demand forecast
 D2 Cause-Effect Validity   9   standard industry pattern
 D3 Data Granularity        9   zone-day
 D4 Critical Dimensions     9   all required cols in schema
 D5 Logical Possibility     10  Prophet on date+quantity is standard
 D6 Metric Validity         9
 D7 Design-Schema Match     9
 D8 Semantic Uniqueness     7   similar to N02-U01 but different scope
 D9 Analytical Depth        7   Prophet is substantive
 D10 Activation Quality     10  "reduce idle time" = concrete deliverable
 D11 Domain Balance         8
 D12 Business Relevance     10  operations uses zones daily
 D13 Sponsor Test           9   CFO funds taxi ops
 D14 Engineering Test       9   standard Databricks ML flow
 D15 Decision Cadence       9   daily forecast matches daily dispatch
 D16 Monday Test            10  monday driver shifts change based on forecast
 D17 Explainability         8   Prophet decomposition is explainable
 D18 18-Month Longevity     10  always-on
 D19 Attributable Impact    9   measurable in hours-idle-per-fleet
 Composite                  8.9
 Would a PBA sign off?      YES
```

If the composite < 6.5 for ANY UC in the sample, flag it as poor-quality and check if it's representative of the portfolio (re-sample 5 more UCs to confirm).

#### 10.4.3 The Genie Code instruction check (for UCs with `has_genie_code = 'Y'`)

Read the full `genie_instruction` text. Verify:

1. **Tables referenced exist** in the UC metadata (no hallucinated table names)
2. **Columns referenced exist** in the cited tables
3. **Output schema is specified** (what the query returns)
4. **The analytical technique matches** `analytics_technique` field
5. **`ai_query(...)`** is used for summarization if business_value requires natural-language output (not raw numeric)
6. **The instruction is runnable as-is** — a Databricks engineer should be able to copy it into Genie Code and get a meaningful result

If any of 1–6 fail, mark the UC as "Genie Code broken" and flag in the audit report.

### 10.5 Stage 4 — Cross-run regression check

Compare the current run to the most recent canonical baseline (same DB, prior release):

```sql
WITH cur AS (
  SELECT COUNT(*) n, ROUND(AVG(bob_score),2) avg_bob, ROUND(AVG(priority_score),2) avg_p
  FROM feip_eastus_01._inspire.__inspire_usecases WHERE session_id = :current_sid
),
prev AS (
  SELECT COUNT(*) n, ROUND(AVG(bob_score),2) avg_bob, ROUND(AVG(priority_score),2) avg_p
  FROM feip_eastus_01._inspire.__inspire_usecases WHERE session_id = :baseline_sid
)
SELECT cur.*, prev.* FROM cur, prev;
```

Regression rules:

| Change | Action |
|---|---|
| `n` dropped > 20% | Investigate generation — did Pass 2 fail? Was more content filtered? |
| `avg_bob` or `avg_priority` dropped > 1.0 | Regression in scoring. Block release. |
| `avg_bob` or `avg_priority` rose > 2.0 | Suspicious improvement. Check for mode collapse (LLM giving everything high scores). |
| `hard_veto_survivors` went from 0 → any | **BLOCK release**. A previously-fixed bug regressed. |
| Theme count dropped to < 3 | Stratified trim collapsed. Investigate. |
| Phase L pass count dropped | Investigate which checks newly fail. |

Record the diff in the audit report.

### 10.6 Ranking methodology — ordering UCs for consumption

When presenting UCs to stakeholders (PDF catalog, Excel, dashboard), rank them using this composite priority:

```
rank_score = 0.65 * quality_score + 0.35 * value_score      # Inspire Score
              (both on 0-5 scale; quality_score already reflects 19-gate HARD VETO floor at 2.0)
```

This is the `Inspire Score` formula hard-coded in the pipeline (`quality_weight=0.65`, `priority_weight=0.35`).

**Secondary sort within same `rank_score`**: by `bob_score` DESC (0–10 granular), then by `bob_tier2_score` (business tier) DESC, then by `bob_tier3_score` (PBA tier) DESC, then alphabetical by `use_case`.

**Grouping**: group by `business_domain` then `subdomain` for navigation; within each group, order by the rank formula above.

**What NOT to do**:
- Never rank by `bob_score` alone — it weights technical+business+PBA but not the original Pass 1 value/quality scores.
- Never rank by `priority_score` alone — it predates BoB and doesn't reflect the finer PBA dimensions.
- Never expose raw `bob_tier*` scores in customer-facing UI — they're audit artifacts, not consumer signals.

### 10.7 Audit-report output format

After all 4 stages, write an audit report to `~/.claude/inspire-ai/audit/<session_id>-audit.md` with this structure:

```markdown
# Audit Report — Session <session_id>

**DB**: <business_name>  **Tag**: <version>  **Run**: <run_id>  **Duration**: <min>
**Reviewer**: Isaac  **Timestamp**: <ISO>

## Verdict
[CLEARED | BLOCKED | CLEARED WITH WARNINGS]

## Stage 1 — Live-log audit
| Signal | Count | Action taken |
|---|---|---|
| ... | ... | ... |

## Stage 2 — Portfolio DB audit
| Metric | Value | Pass range | Status |
|---|---|---|---|
| ... | ... | ... | ... |

## Stage 3 — PBA spot audit
[5-UC grid with 19-gate scores per UC, composite, and sign-off verdict]

## Stage 4 — Cross-run regression
[Before/after table vs baseline session <baseline_sid>]

## Red flags surfaced
1. ...

## Recommendation
[Ship | Ship-with-notes | Re-run | Block]

## Brutal-honesty self-score
[Per §6: 0-100% with justification of what I missed or could have done better]
```

Never email / Slack / Genie-present a portfolio until the audit report has `CLEARED` or `CLEARED WITH WARNINGS` at the top.

### 10.8 What the auditor MUST do on any "BLOCKED" verdict

1. Root-cause the blocker per §3. "Prompt was flaky" is not a root cause. "Retry loop shared cache with initial call" is a root cause.
2. Ship the fix as a new patch commit on `dev`.
3. Re-run the pipeline with a fresh `session_id`.
4. Re-audit the new session. Do not reuse Stage 1–4 artifacts from the blocked run.
5. Only after the new session clears all 4 stages may the release be tagged.

### 10.9 Honesty calibration for every audit

Per §6: at the end of every audit, produce a brutal-honesty score 0–100% of how well I did the audit itself (not the pipeline — the audit). Self-grade on:

- Did I actually read every log line, or did I grep a few patterns and claim done? (If grep-only: −20 pts)
- Did I actually run every SQL query in Stage 2, or did I paraphrase one and trust it? (If paraphrased: −15 pts)
- Did I actually score 5 UCs across 19 gates each (= 95 individual scores), or did I sample 2 UCs and extrapolate? (If extrapolated: −25 pts)
- Did I compare against a real baseline in Stage 4, or did I skip because "no good baseline exists"? (If skipped: −20 pts)
- Did I find **any** warnings / issues, or did I return "CLEARED" too easily? (If too easy: −15 pts, you likely missed something)
- Did I write the report to disk, or did I claim I wrote it without verifying? (If claimed-but-didn't: instant 0)

Target self-score: 85%+. A 100% score on the first audit is a red flag — you probably missed something subtle.
