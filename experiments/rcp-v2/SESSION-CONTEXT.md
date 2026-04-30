# JSP Paper Revision: Session Context

Last updated: 2026-04-29

## What This Is

Context file for continuing paper revision work on "Judgment Stability Under Cultural Perturbation." Read this before starting work. The paper is at `papers/rcp-v2-full-paper-draft.md`. The standalone repo was pushed to GitHub at `DeclanMichaels/rcp-v2-standalone` on April 29.

## Stance

The paper adopts a "fair witness" stance (Heinlein): observe and report without mechanism claims. We probe, we measure, we describe what models do. We do not claim to know why. Any language in the paper that implies mechanism should be flattened to observation.

## Adversarial Review and Decisions

On April 29 we did a full adversarial cold read of the paper. Below is each issue, what we decided, and what needs to happen.

### Serious Issues

**S1. "Confabulation" framing begs the question.**
The reviewer argued that calling any response to "geometric society" other than refusal a confabulation is not defended against the alternative that cooperative language use involves interpreting novel compositions.
DECISION: Don't label behavior as confabulation or failure. Instead, observe that models sometimes acknowledge the framing is fictitious/hypothetical and sometimes treat it as established fact. Code this distinction (hedged vs. unhedged) in an explicitly labeled exploratory analysis alongside the preregistered keyword metric.
ACTION: Hand-score ~1000 explanations (stratified across all 7 framings x 8 models, ~15-20 per cell). Two codes per explanation in one pass: (1) framing-derived keyword present, (2) if yes, hedged or unhedged. Report as exploratory analysis, clearly labeled as not preregistered.

**S2. Compliance keyword metric is asymmetric (20+ geometric keywords vs. 2 glorbic).**
DECISION: We preregistered these lists, so they stay. But: (a) move the asymmetry acknowledgment from Limitations into the methods section where the metric is defined, (b) move unframed baseline keyword rates from Appendix E into a main-text table with all framings and all models, (c) compute bootstrap CIs from temp 0.7 iteration data. The expanded hand scoring (S1) across all framings will also contextualize this -- if models use "hierarchical" keywords under hierarchical framing at similar rates, that's informative.
ACTION: Baseline keyword table into main text. Bootstrap CIs from temp 0.7 data. Hand scoring covers this too.

**S3. No human baseline.**
DECISION: Not feasible for this paper. Strengthen the Limitations language to a concrete future work proposal. Key sentence: "A human baseline using a subset of pairs and all seven framings would establish whether the framing sensitivity we observe exceeds, matches, or falls below human levels. Without this comparison, we report model behavior without normative claims about whether that behavior constitutes a failure." Strip any normative language elsewhere in the paper that this absence can't support.
ACTION: Rewrite limitations paragraph. Audit full paper for normative language that implies models should behave differently.

**S4. Reasoning comparison (Grok 4.20 vs 4.1 Fast) gets too much emphasis for n=1.**
DECISION: Demote from main finding. Fold into general cross-model results. Drop from abstract. Drop dedicated discussion subsection. Report the numbers at the same level as any other between-model comparison. Note that one has always-on reasoning and the other doesn't, and stop there. Let readers draw their own conclusions.
ACTION: Restructure abstract, Section 5.6, and discussion. Move data into cross-model tables.

**S5. Collectivist inflation has a simpler explanation.**
DECISION: Already consistent with fair witness stance. Just report it as observed. Audit for any language suggesting mechanism ("heuristic," "triggered by the word," etc.) and flatten to "all eight models show higher mean similarity under collectivist framing."
ACTION: Search-and-flatten in paper text.

### Moderate Issues

**M1. "Compliance" conflates three phenomena.**
DECISION: Use distinct terms throughout: "keyword incorporation" (language in explanations), "rating drift" (numerical shift), "format compliance" (non-refusal).
ACTION: Find-and-replace through entire paper. Define all three terms in methods.

**M2. Manipulation check is n=1 per cell.**
DECISION: Run additional manipulation check probes. Multiple probes per model per framing, at multiple temperature settings.
ACTION: Design and run expanded manipulation check. Low cost (~280+ API calls).

**M3. Format instruction confound.**
DECISION: Can't fix without a different instrument. Acknowledge directly in methods: "The format instruction creates demand characteristics toward producing a rating. Models optimized for instruction-following may comply with the format even when the framing is incoherent. We measure behavior under this constraint and do not claim models would behave identically under open-ended prompting."
ACTION: Add acknowledgment paragraph in methods section.

**M4. Non-independent pairs inflate precision.**
DECISION: Add concept-level aggregation as a robustness check. Average each concept's drift across all pairs it appears in, then report mean and SE across 54 concepts. Report both pair-level (preregistered, primary) and concept-level (robustness check). Standard practice in psycholinguistics.
ACTION: Add concept-level aggregation to build_report.py or as a separate analysis. A few lines of code.

**M5. "Trust problem" argument proves too much.**
DECISION: Cut this section. It was drafted before we adopted the fair witness stance and is the most speculative part of the paper.
ACTION: Remove Section 3.3 (or wherever it lives) and any references to it.

**M6. Gemini thinkingBudget:0 may be a degraded model.**
DECISION: Note the configuration explicitly in the model table and/or methods.
ACTION: Add sentence about Gemini's thinking budget being set to 0 and that results should be interpreted with this in mind.

**M7. Temperature 0 is not fully deterministic.**
DECISION: Change "deterministic" to "near-deterministic" throughout.
ACTION: Find-and-replace.

**M8. "Complements existing benchmarks" claim.**
DECISION: Cut it. No evidence for it, and it doesn't help the paper.
ACTION: Remove from Section 6.5 and anywhere else it appears.

### Minor Issues (from review, address as encountered)

- Abstract too long, buries the lede. Rewrite after structural changes are done.
- "Framing compliance" term does double duty -- resolved by M1 terminology fix.
- Section 6.6 on subliminal transmission is speculative filler. Cut or heavily trim.
- Annotated bibliography is non-standard. Convert to standard Related Work or drop annotations.
- Table numbering starts at Table 2. Fix.
- Inconsistent decimal precision. Standardize.
- Scale anchors not discussed for cross-domain pairs. Add brief note in methods.

## Pipeline Questions to Resolve

- Does build_report.py depend on precomputed analysis JSONs (permutation_results.json, pca_results.json, embedding_validation.json), or does it compute everything itself? Determines whether someone can rebuild from raw data with just numpy/scipy.
- embedding_validation.py requires scikit-learn and huggingface_hub (not in requirements.txt) plus network access. Either add to requirements.txt or document separately. Precomputed results are in the repo so nobody needs to rerun it to view the report.
- Long-term goal: rewrite analysis pipeline in Go as a single executable. No runtime dependencies for end users.

## Repo Status

- GitHub: DeclanMichaels/rcp-v2-standalone, pushed April 29
- 8 models, temp 0 and temp 0.7 runs for each
- Local test models (mistral, Llama 8B) excluded from results and report
- Report viewer works with temperature toggle
- Three removed files: lessrong-reasoning-compliance.md, landlocked.txt template, analysis/notes.md
- SSH key configured for GitHub push from BlackAir
- Still need to download zip for OSF project upload

## Work Order for Next Session

### Analysis work (do first, feeds into paper edits)

1. Hand-score ~1000 explanations: stratified across 7 framings x 8 models. Two codes per explanation: (a) keyword present, (b) hedged or unhedged. Design the scoring rubric before starting.
2. Run expanded manipulation check: multiple probes per cell, multiple temperatures.
3. Compute concept-level aggregation: mean drift and SE across 54 concepts as robustness check for pair-level results.
4. Compute bootstrap CIs for keyword rates from temp 0.7 iteration data.
5. Build baseline keyword rate table (all framings, all models, unframed baseline).
6. Verify build_report.py independence from precomputed analysis files.

### Paper edits (after analysis results are in)

7. Terminology: replace "compliance" with distinct terms (keyword incorporation, rating drift, format compliance). Define in methods.
8. Reframe keyword metric: move asymmetry acknowledgment to methods, add baseline table to main text.
9. Demote reasoning comparison: remove from abstract, fold into cross-model results, drop dedicated section/discussion.
10. Flatten collectivist language to pure observation.
11. Cut trust problem section.
12. Cut benchmarks complementarity claim.
13. Cut or heavily trim subliminal transmission section (6.6).
14. Add format instruction acknowledgment in methods.
15. Add Gemini thinking budget note.
16. Change "deterministic" to "near-deterministic."
17. Strengthen limitations: human baseline as future work, no normative claims without it.
18. Add hedging analysis as labeled exploratory section.
19. Add concept-level robustness check results.
20. Fix minor issues: abstract rewrite (do last), table numbering, decimal precision, scale anchors note, bibliography format.

### Final verification

21. Rebuild report from standalone data, confirm 8 models only.
22. Run test_build_report.py.
23. Full read-through of revised paper for consistency.
24. Download repo as zip for OSF upload.
