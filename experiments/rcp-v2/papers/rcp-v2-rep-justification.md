## Stochastic Replication: Rep Count Justification

### Rationale

Temperature 0 data captures each model's single deterministic response to every probe. Temperature 0.7 data introduces sampling variability, allowing measurement of response stability. The question is how many stochastic repetitions are needed to produce reliable estimates.

### Empirical Validation from V1

We analyzed intra-repetition variance from the V1 experiment (6 models, 153 pairs, 7 framings, 5 repetitions at temperature 0.7) to determine the minimum number of repetitions needed for stable estimates.

**Finding 1: Models are predominantly deterministic even at temperature 0.7.** Across 5,159 pair-framing combinations, 66.1% produced identical ratings across all 5 repetitions (zero variance). The most stable model (Llama 3.3 70B) showed zero variance on 81.3% of pairs. The least stable (GPT-4o) still showed zero variance on 43.6%. At temperature 0.7, these models are not "noisy" in the way stochastic sampling might suggest; rather, the majority of concept-pair relationships are deterministic properties of the model, and the stochastic pass primarily confirms this.

**Finding 2: Variance estimates converge by repetition 3.** Running variance computed after 2, 3, 4, and 5 repetitions shows minimal change beyond rep 3. For the noisiest model (Gemini 2.5 Flash), mean variance moved from 0.397 at 2 reps to 0.409 at 5 reps, a 3% change over 3 additional repetitions. For Llama 3.3 70B, the change was from 0.083 to 0.073 (12% over 3 reps, on an already near-zero baseline). Adding repetition 5 changed the mean estimate by less than 0.07 points (1% of the 1-7 scale) for all models, and fewer than 2% of pairs shifted their mean by more than 0.5 points.

**Finding 3: Split-half reliability exceeds 0.93 for all models.** Spearman rank correlation between the mean of repetitions 1-2 and the mean of repetitions 4-5 ranged from 0.929 (GPT-4o) to 0.985 (Llama 3.3 70B). This means the first two repetitions predict the last two repetitions almost perfectly. Direction changes (a pair rated above 4.0 on early reps but below 4.0 on late reps) occurred in fewer than 2.1% of pairs for any model.

### Rep Count Decision

Based on this analysis:

- **Non-reasoning models (5 repetitions):** Sonnet 4.6, GPT-5.4 Mini, Gemini 2.5 Flash, Llama 3.3 70B, Grok 4.1 Fast received 5 repetitions at temperature 0.7, matching the V1 protocol and providing full variance estimates.

- **Frontier reasoning models (2 repetitions):** Opus 4.6, GPT-5.4, and Grok 4.20 received 2 repetitions at temperature 0.7. This decision was based on three considerations: (1) the V1 variance analysis demonstrates that 2 repetitions capture the essential stability profile (split-half r > 0.93), (2) the temperature 0 effects for these models are large enough (e.g., Grok 4.20 at 80.6% compliance) that stochastic variation is unlikely to alter conclusions, and (3) cost efficiency, as frontier reasoning models are 10-30x more expensive per call than their non-reasoning counterparts. Two repetitions provide stochastic confirmation while preserving budget for other research activities (embedding extraction, human data collection).

### What the Stochastic Data Provides

The stochastic pass serves three purposes, none of which require high rep counts given the observed stability:

1. **Confirmation that temperature 0 results are not artifacts of deterministic decoding.** If a model's drift or compliance changes dramatically at temperature 0.7, the temperature 0 results may reflect a decoding artifact rather than a stable property. The V1 analysis suggests this is unlikely (the signal is overwhelmingly stable), but the stochastic pass confirms it empirically.

2. **Confidence intervals on aggregate metrics.** For drift, Spearman rho, and compliance rates, the 5-rep data allows computation of per-pair variance, which propagates into confidence intervals on the aggregate statistics. Given that 66% of pairs show zero variance, these intervals will be tight.

3. **Identification of high-variance pairs.** The minority of pairs that do vary across repetitions may be diagnostically interesting: they may mark concept relationships where the model is genuinely uncertain rather than confidently wrong. This is a qualitative finding that requires identifying the variable pairs, not precisely estimating their variance.
