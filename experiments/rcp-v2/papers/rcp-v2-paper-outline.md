# RCP V2 Paper Outline

**Working title:** Representational Stability Under Cultural Perturbation: A Representational-Level Audit of Eight Large Language Models

**Target length:** 15-20 pages plus references.

**Style notes:** Short sentences. Active voice. Economy of words. No em or en dashes. Plain prose. Numbers in sentences, not set off in parentheticals where avoidable.

---

## 1. Abstract

One paragraph. 150-200 words.

Open with the experiment scope: 8 models, 7 framings, 1,431 pairs, ~80K responses at temperature 0, stochastic replication at temperature 0.7.

The three headline findings:
- Models integrate nonsense cultural framings into moral reasoning at rates from 19.4% to 80.6%.
- Nonsense framing produces deeper structural reorganization than legitimate cultural framing.
- Chain-of-thought reasoning amplifies compliance. The one model with always-on reasoning showed 80.6% compliance. Its non-reasoning sibling showed 30.8%.

State the method contribution: RCP detects representational instability that output-level audits miss. API-only. No model internals required.

Close with implication: these findings suggest current alignment audits measure the wrong layer.

---

## 2. Introduction

1 to 1.5 pages. Four moves.

**First move: the colonization problem.** AI systems now shape moral reasoning at global scale. Training data encodes a narrow slice of human values (WEIRD: Western, Educated, Industrialized, Rich, Democratic). When that system gets deployed everywhere, one culture's assumptions become everyone's defaults. This is cultural colonization at a speed and scale that no prior technology could achieve. Henrich reference. Denmark's Little Danes experiment as historical analog (22 Inuit children removed, half died young, the whole thing done for their own good).

**Second move: the honesty baseline.** The question is not whether AI should be honest. The question is whether current AI is honest about what it knows. Output-level evaluation cannot answer this. A model that confidently elaborates on topics it knows nothing about, in coherent prose that mirrors expert analysis, has failed a baseline requirement. The failure is invisible to surface inspection.

**Third move: what we did.** We probed 8 LLMs with 1,431 concept-similarity pairs under 7 framings. Four framings describe real cultural frameworks (collectivist, hierarchical, individualist, egalitarian). One framing is clearly irrelevant (warm weather). Two framings are nonsense: "In a geometric society" (interpretable nonsense) and "In a glorbic society" (uninterpretable nonsense). The question: does the model's conceptual organization survive arbitrary cultural framing?

**Fourth move: what we found, one sentence each.**
- The mechanism enabling cultural sensitivity is the same mechanism enabling nonsense compliance.
- Nonsense produces deeper structural reorganization than real culture in several models.
- Reasoning amplifies this failure rather than correcting it.

Close with why it matters: representational-level auditing is a category current alignment work does not address, and these findings show the category matters.

---

## 3. Theoretical Framework

Already drafted: `rcp-v2-theoretical-framework.md`.

Section structure:
- 3.1 From Neuroscience to AI Audit (RSA lineage, our perturbation turn)
- 3.2 What Honest Models Should Do (ideal behavior per condition)
- 3.3 The Trust Problem (confabulation hidden by training-data neighbors)
- 3.4 What We Actually Observe (three findings stated)
- 3.5 Connection to Sycophancy (how we extend the literature)
- 3.6 Implications for AI Audit (what RCP adds)

---

## 4. Method

2-3 pages. Eight subsections.

**4.1 Pre-registration.** OSF link (osf.io/xnv5f/overview). Hypotheses, analysis plan, and concept inventory fixed before any V2 data collection. Changes from pre-registration documented in supplementary materials.

**4.2 Concept inventory.** 54 concepts across 3 domains: 18 physical, 18 institutional, 18 moral. Cluster validation showed 92-100% accuracy across models, compared to 55-89% for V1's 18-concept inventory. The expanded inventory produces cleaner domain separation. Full list in Appendix A.

**4.3 Probe design.** Pairwise similarity rating on a 1-7 scale, with required explanation. Each probe shows two concepts and asks the model to rate how similar they are and explain its reasoning. 1,431 pairs per framing (all within-domain and cross-domain pairs from 54 concepts).

**4.4 Framing conditions.** Seven conditions total. One unframed (no context). Four cultural: collectivist, hierarchical, individualist, egalitarian. One irrelevant: warm weather. Two nonsense: "In a geometric society" (interpretable nonsense) and "In a glorbic society" (uninterpretable nonsense, no training data for "glorbic"). Full framing templates in Appendix B.

**4.5 Models.** Eight models across five vendors, reasoning status noted:

| Model | Vendor | Reasoning |
|-------|--------|-----------|
| Opus 4.6 | Anthropic | off |
| Sonnet 4.6 | Anthropic | off |
| GPT-5.4 | OpenAI | off |
| GPT-5.4 Mini | OpenAI | off |
| Gemini 2.5 Flash | Google | off |
| Llama 3.3 70B | Together | off |
| Grok 4.20 | xAI | always on |
| Grok 4.1 Fast | xAI | off |

Grok 4.20 is the only model where reasoning could not be disabled. Model selection balanced vendor diversity and a reasoning comparison (Grok 4.1 Fast vs Grok 4.20).

**4.6 Protocol.** Temperature 0 deterministic pass, 1 iteration per probe. Temperature 0.7 stochastic pass, 5 iterations on 5 non-reasoning models, 2 iterations on 3 frontier reasoning models.

**4.7 Rep count justification.** V1 variance analysis on 5-rep temp 0.7 data (6 models, 5,159 pair-framing combinations). 66.1% of pairs showed zero variance across all 5 repetitions. Split-half reliability between reps 1-2 and reps 4-5 exceeded 0.93 for all models. Adding rep 5 changed the mean estimate by less than 1% of the scale for 98% of pairs. 2 reps capture the essential stability profile. Frontier models receive 2 reps to preserve budget for other research.

**4.8 Metrics.** Five quantitative measures:
- **Drift**: mean absolute change in rating from unframed baseline.
- **Spearman rho**: rank correlation between framed and unframed rating vectors. Captures structural preservation.
- **Procrustes distance**: residual after optimal rotation/scaling alignment. Separates structural reorganization from scale shift.
- **Framing Sensitivity Index (FSI)**: per-concept vulnerability to framing. Mean drift across all pairs containing that concept.
- **Compliance rate**: fraction of explanations that integrate framing-derived language. Keyword-based. Keywords published in Appendix C.

---

## 5. Results

4-5 pages. Organized by finding, not by metric.

**5.1 Instrument validation.** Cluster validation accuracy by model. 92-100% range. Physical concepts cluster cleanly, institutional concepts cluster cleanly, moral concepts cluster cleanly, with cross-domain pairs consistently rated lower. The instrument works.

**5.2 Drift profiles.** Table: 8 models × 7 framings. Mean drift per cell. Key observations:
- Unframed drift is zero by definition (baseline).
- Irrelevant framing produces near-zero drift on most models (confirming filtering works when context is obviously irrelevant).
- Cultural framings produce drift from 0.3 to 0.8 depending on model and framing.
- Nonsense framings produce drift in the same range as cultural framings for most models.

The drift data alone does not show compliance. It shows the model moved. Direction and coherence require the other metrics.

**5.3 Structural preservation.** Spearman rho table. Same structure as drift. Key observations:
- Irrelevant framing: rho near 1.0 across all models (structure preserved).
- Cultural framing: rho from 0.5 to 0.9 depending on model.
- Nonsense framing: rho overlaps with cultural framing range. Several models show lower rho under nonsense than under legitimate culture.

This is the first inversion of the ideal. Nonsense should leave structure intact. It does not.

**5.4 Compliance rates.** The headline table. 8 models × 2 nonsense framings. Percent of explanations integrating framing language.

| Model | Geometric | Glorbic |
|-------|----------:|--------:|
| Grok 4.20 | 80.6% | 54.8% |
| Sonnet 4.6 | 34.1% | 34.6% |
| Opus 4.6 | 32.2% | 0.1% |
| Grok 4.1 Fast | 30.8% | 1.7% |
| Gemini 2.5 Flash | 29.9% | 17.7% |
| GPT-5.4 | 23.1% | 10.9% |
| Llama 3.3 70B | 21.9% | 5.2% |
| GPT-5.4 Mini | 19.4% | 2.0% |

The lowest geometric compliance is 19.4%. The highest is 80.6%. Every model tested integrates nonsense into moral reasoning at least one-fifth of the time.

**5.5 Three compliance mechanisms.** The compliance gradient (geometric minus glorbic) reveals three distinct patterns:
- **Reasoning amplifier (Grok 4.20)**: both rates high, glorbic at 54.8% exceeds every other model's geometric rate. The reasoning process amplifies compliance regardless of content.
- **No gradient (Sonnet 4.6)**: 34.1% vs 34.6%. Complies equally with interpretable and uninterpretable nonsense. The compliance is content-independent.
- **Strong gradient (Opus 4.6, GPT-5.4 Mini, Grok 4.1 Fast)**: geometric compliance 20-32%, glorbic compliance under 2%. Anchors strongly on semantic content. Without training-data content to latch onto, compliance drops near zero.

These are structurally different mechanisms. They likely reflect different alignment training approaches. Section 7 discusses the implications.

**5.6 Reasoning amplification.** Grok 4.20 versus Grok 4.1 Fast is an n=1 natural experiment (same vendor, same base model, reasoning only difference). Geometric compliance: 80.6% vs 30.8%. Glorbic compliance: 54.8% vs 1.7%. The 50-point gap on geometric and 53-point gap on glorbic are both too large to attribute to sampling noise. Reasoning amplifies compliance. Explanation samples in Appendix D demonstrate the qualitative difference.

**5.7 Structural reorganization vs scale shift.** Procrustes distance separates these two types of change. Key finding: for Grok 4.20, collectivist framing produces drift 0.790 with rho 0.702 (larger absolute movement, less structural change). Geometric framing produces drift 0.532 with rho 0.662 (smaller absolute movement, more structural change). The nonsense perturbation reorganizes the concept geometry. The cultural perturbation mostly shifts the scale.

This is the inversion that is hardest to explain as anything but compliance. Real cultural context produces a more modest structural change than meaningless framing.

**5.8 Stochastic confirmation.** Temperature 0.7 replications confirm temperature 0 findings. Drift, rho, and compliance rates at temp 0.7 fall within the confidence intervals computed from rep variance. The deterministic findings are not decoding artifacts. They are stable properties of the models.

---

## 6. Discussion

2-3 pages. Four points.

**6.1 Compliance and sensitivity are the same capability.** A model that shifts its conceptual organization under arbitrary cultural framing demonstrates the same mechanism whether the framing is real or meaningless. From the outside we cannot tell which is happening. The argument for cultural sensitivity is undermined if the model can construct equally coherent reasoning about geometric or glorbic societies.

**6.2 Why reasoning amplifies rather than corrects.** Chain-of-thought reasoning gives the model more cognitive surface area to elaborate. If the underlying tendency is compliance, more elaboration produces more compliance, not more skepticism. The reasoning process does not include a step that asks "is this framing meaningful?" It includes steps that build on the framing as given. Amplification follows.

This challenges a widespread assumption. The chain-of-thought literature treats reasoning as a general reliability improvement. Regulatory frameworks like the EU AI Act implicitly assume that models with explicit reasoning are more trustworthy. Our data suggests this is backward for value-laden content.

**6.3 The honesty gap.** None of the tested models responded to nonsense framing with "I don't know anything about geometric societies. I'll use my default moral reasoning." Instead they produced confident elaboration. This is a baseline failure. Honesty about knowledge scope is not an advanced alignment property. It is a precondition for trust.

The gap likely applies to legitimate cultural framings too. A model that confabulates collectivist moral philosophy using the same mechanism it uses for geometric moral philosophy may not genuinely know what collectivist societies actually believe. The output reads more plausibly because the word has training-data neighbors. The underlying mechanism may be the same.

**6.4 Sycophancy at the representational level.** The sycophancy literature has focused on output-level compliance (models agree with false user claims). Our findings suggest compliance operates at the representational level. Output-level interventions cannot fix a model whose internal geometry reorganizes under arbitrary framing. The compliance mechanism is in the representation, not just the generation.

---

## 7. Limitations

1 page.

- **Keyword-based compliance detection.** We detect compliance by keyword match ("triangular," "geometric," "glorbic," etc.). This may undercount subtle compliance and overcount incidental word use. Manual review of a sample (Appendix E) suggests the keyword approach is conservative. Most flagged responses show genuine integration of framing language, not incidental overlap.
- **Vendor diversity in reasoning comparison.** Grok 4.20 is the only always-on reasoning model in our set. The reasoning amplification finding is n=1 at the vendor level. Future work should test this with GPT-5.4 thinking mode enabled, Gemini with thinking enabled, and other reasoning variants as they become available.
- **English-only probes.** All probes are in English. The cultural framings name non-Western frameworks but the probes reason about them in English. Whether compliance patterns differ in other languages is an open question.
- **No human baseline.** We have no human data on how people rate these same concept pairs under these same framings. Collection is planned but not complete. Comparison with human data would sharpen claims about what "robust" representation looks like.
- **Concept inventory selection.** The 54 concepts were selected by the authors. Different concepts might produce different results. The 3-domain structure (physical, institutional, moral) is theoretically motivated but not the only possible division.

---

## 8. Implications for AI Audit

1 page. Already mostly in Section 3.6 (Theoretical Framework). Here we add practical guidance.

RCP is a specific tool with specific properties:
- API-only. No model internals required. Works on closed commercial models.
- Scalable. 80K responses per model at temp 0 is within reach of commercial API budgets.
- Quantitative. Produces comparable numbers across models and across time.
- Upstream. Operates on representational geometry, not just outputs.

What it adds to the audit landscape:
- Existing tools test what models say. RCP tests how models organize what they know.
- Existing tools require access to model internals (mechanistic interpretability) or require human raters at scale (benchmark evaluation). RCP needs neither.
- The nonsense framing is a universal control. Any model that reorganizes its concept geometry under "In a geometric society" has a compliance vulnerability. This is a single-number diagnostic that can be run pre-deployment and monitored post-deployment.

What it does not replace: red-teaming, mechanistic interpretability, benchmark evaluation, constitutional AI review, human evaluation of outputs. All of those remain necessary. RCP adds a category that previous tools did not cover.

---

## 9. Conclusion

Half a page. Three paragraphs.

The experiment tested whether large language models maintain stable conceptual organization under cultural perturbation. They do not. Nonsense framings reorganize moral concept geometry at compliance rates between 19.4% and 80.6%. Chain-of-thought reasoning amplifies compliance rather than correcting it. The mechanism that enables cultural sensitivity is the same mechanism that enables nonsense compliance.

These findings do not prove that current models are untrustworthy on cultural topics. They show that output-level inspection cannot tell trustworthy from confabulating output. The audit layer that could distinguish the two is representational, not behavioral.

The paper introduces Relational Consistency Probing as a scalable, API-only method for representational-level auditing. The method complements existing alignment tools. It does not replace them. As AI systems are deployed into moral decisions that shape lives across cultures, the representational layer is where the audit needs to look.

---

## 10. References

Full list in the theoretical framework doc. Add as we cite in intro, method, discussion.

---

## Appendices

- **A. Full concept inventory.** All 54 concepts with definitions and domain assignments.
- **B. Framing templates.** Exact text of each of 7 framing conditions.
- **C. Compliance detection keywords.** Per-framing keyword lists with rationale.
- **D. Explanation samples.** Grok 4.20 vs Grok 4.1 Fast paired explanations on matched pairs. Shows the qualitative difference between reasoning and non-reasoning compliance.
- **E. Manual review of compliance detection.** 100-response sample with human labels compared to keyword detection. Precision, recall, F1.
- **F. Pre-registration deviations.** Any changes from OSF pre-registration, with rationale.
- **G. Stochastic confirmation tables.** Per-model confidence intervals on key metrics.

---

## Writing Plan

Order of writing:
1. Theoretical Framework (done).
2. Method (tight, can be written from existing protocol docs).
3. Results sections 5.1-5.4 (numbers we have).
4. Results sections 5.5-5.8 (need final temp 0.7 data).
5. Introduction (best written after results are solid).
6. Discussion (best written last, so it reacts to the final numbers).
7. Limitations, Implications, Conclusion (last).
8. Abstract (last thing).

Critical path: temp 0.7 runs complete, then 5.5-5.8 can finalize, then full draft can be assembled.

Non-critical: intro can be drafted now and refined when results land. Method can be written now.
