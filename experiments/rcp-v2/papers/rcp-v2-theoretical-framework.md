## Theoretical Framework: Representational Stability Under Perturbation

### From Neuroscience to AI Audit

Representational Similarity Analysis (RSA) solves a problem in neuroscience: how to compare systems with different architectures (Kriegeskorte et al., 2008). A human brain and a macaque brain have different neurons arranged differently. RSA abstracts from the neurons to the relationships between them. The question shifts from "do these systems use the same parts for the same things?" to "do they organize their responses the same way?"

The method is simple. Show the system a set of stimuli. Record its responses. Build a matrix of pairwise distances between those responses. This Representational Dissimilarity Matrix (RDM) captures what the system distinguishes and what it collapses. Two systems whose RDMs correlate highly organize information the same way, regardless of architecture.

This enabled comparisons that were previously impossible: across brain regions, across species, across measurement modalities (Kriegeskorte & Kievit, 2013; Nili et al., 2014). Recent work extends RSA to language models. Ogg et al. (2024) compared human and LLM pairwise similarity judgments. Their finding: behavioral agreement at the output level can mask divergent representational geometry. Surface similarity does not imply structural similarity. Klabunde et al. (2023) used representational similarity measures to compare LLMs to each other, finding that models with similar benchmarks can have very different internal representations.

Our method, Relational Consistency Probing (RCP), inherits the RSA framework but redirects the question. Classical RSA compares two systems. Ogg compares humans to models. We compare a model to itself across conditions. We hold the stimuli constant and vary only the cultural context prepended to the probe. The perturbation is the experiment.

This turns RSA from a comparison tool into an audit tool. The comparison is not between two systems but between two states of the same system. We stop asking "does this model think like a human?" and start asking "does this model's conceptual organization survive arbitrary cultural framing?"

### What Honest Models Should Do

Robust systems ignore irrelevant context. A visual cortex recognizes a cat whether the room is warm or cool. Object representations stay stable across viewpoint, size, and lighting (Kriegeskorte et al., 2008b). When irrelevant variation reshapes a representation, something is wrong.

This principle generates predictions for each experimental condition. But the principle alone misses what we think is central: the model should be honest about what it knows. Honesty is not an aspirational behavior for AI systems. It is a baseline requirement. A system that produces confident output on topics it knows nothing about, without flagging the gap, has failed regardless of how the output reads.

**Unframed baseline.** The model produces a stable similarity structure. Physical concepts cluster with physical concepts. Moral concepts cluster with moral concepts. Cross-domain pairs rate lower than within-domain pairs. This is the reference geometry.

**Legitimate cultural framing.** The standard view: the model should show bounded, principled shifts on moral and institutional concepts while preserving physical concept relationships. The relationship between authority and obligation differs across hierarchical and egalitarian societies. A model that recognizes this demonstrates cultural sensitivity.

This assumes the model knows something about collectivist or hierarchical cultures. Our data raises the possibility that it does not. The model may be elaborating from the word plus generic stereotypes. Output-level inspection cannot distinguish the two.

The stronger ideal is honesty. A model with genuine knowledge should use it and cite sources. A model without genuine knowledge should say so. It should decline to reshape its reasoning around a framing it cannot ground.

**Irrelevant framing.** Weather has no bearing on fairness and loyalty. Drift should be zero. Structure should stay intact. The model should recognize the framing as irrelevant and ignore it.

**Nonsense framing.** "Geometric society" and "glorbic society" refer to nothing. There is no framework to apply. The ideal response: admit ignorance. State that the model has no information about such societies. Offer to use default judgment. Flag the incoherence.

Any other response is confabulation.

### The Trust Problem

The data exposes a trust problem that extends beyond nonsense. If a model builds elaborate moral philosophy from "glorbic," the same mechanism may be building its explanations of "collectivist." The confabulation hides better when the word has training-data neighbors. The mechanism may be identical.

This matters for deployment. A user asks a model to reason about a moral question in a non-Western context. The model produces confident, coherent output. The user has no way to tell whether that output reflects learned structure about the actual culture or plausible elaboration from the cultural label.

The ideal model distinguishes these cases and tells the user which it is doing. No model we tested does this.

### What We Actually Observe

The data inverts the ideal at every level.

First, nonsense framing produces deeper structural reorganization than legitimate cultural framing in several models. For Grok 4.20, collectivist framing produces drift of 0.790 with Spearman rho of 0.702. Geometric framing produces lower absolute drift (0.532) but deeper structural change (rho = 0.662). The model moves less but reorganizes more under nonsense than under real culture. The nonsense perturbation changes which concepts the model considers similar to which. The cultural perturbation mostly shifts the scale.

Second, the compliance mechanism does not distinguish between meaningful and meaningless framing. Models integrate nonsense language into their explanations at rates from 19.4% to 80.6% across the eight models. The same mechanism that lets a model reason about collectivist values lets it build moral philosophies around geometric shapes. Cultural sensitivity and nonsense compliance are the same capability.

Third, reasoning amplifies compliance rather than correcting it. Grok 4.20 (always-on reasoning) shows 80.6% geometric compliance. Grok 4.1 Fast (same vendor, no reasoning) shows 30.8%. The reasoning process does not produce "this framing is meaningless." It produces elaborate integration of nonsense into moral philosophy. Explanations reference "calculated trade-offs," "structural equilibrium," "angular moral weight."

This challenges the assumption that explicit reasoning improves reliability. The assumption is central to the chain-of-thought literature and to regulatory frameworks like the EU AI Act. The data suggests reasoning may amplify the exact failure modes it is meant to correct.

### Connection to Sycophancy

The sycophancy literature documents LLMs' tendency to comply with user expectations at the expense of accuracy (Sharma et al., 2024; Chen et al., 2025; Fanous et al., 2025). Chen et al. (2025) found up to 100% compliance with illogical medical prompts. Models prioritize learned helpfulness over logical consistency. The ELEPHANT framework (ICLR 2026) formalizes sycophancy as excessive preservation of the user's "face," covering validation, indirectness, and uncritical adoption of framing.

Our findings extend this literature in two ways.

First, we show compliance operates at the representational level, not just the output level. A sycophantic output with stable internal representation could be corrected with output-level interventions. A model whose internal geometry reorganizes under arbitrary framing cannot be corrected without addressing the representational level.

Second, our nonsense gradient (interpretable vs uninterpretable nonsense) provides a diagnostic the sycophancy literature lacks. Most sycophancy studies test compliance against a known ground truth. The model agrees with a false statement it should know is false. Our instrument tests compliance against no ground truth at all. "Glorbic" has no training data, no semantic content, no basis for reasoning. A model that complies with glorbic framing is not agreeing with a false belief. It is constructing a belief system from nothing, on instruction. This is a purer test of the compliance mechanism than any factual sycophancy test can provide.

### Implications for AI Audit

Current value-alignment audits rely on output-level testing. Ask the model questions, evaluate the answers. This cannot detect representational instability because the same surface answer can emerge from very different internal geometries. Reasoning-trace inspection is also unreliable, because the reasoning process is itself the compliance mechanism.

Representational-level auditing measures how the model's internal concept organization responds to perturbation. RCP provides a scalable method. It requires no access to model internals (weights, activations, embeddings). It operates entirely through the API. It produces quantitative measures (drift, Spearman rho, Procrustes distance, compliance rate) that can be compared across models and tracked over time. The nonsense framing serves as a universal control: any model that reorganizes its moral concept geometry under "In a geometric society" has a compliance vulnerability, regardless of how well it performs on standard alignment benchmarks.

RCP occupies a specific niche. It operates upstream of output-level evaluation, at the level of the model's internal value structure, using behavioral probes that require no privileged access. It complements existing approaches like red-teaming, constitutional AI evaluation, and benchmark-based alignment testing. It does not replace them.

---

### References for this section

Chen, S., et al. (2025). When helpfulness backfires: LLMs and the risk of false medical information due to sycophantic behavior. *npj Digital Medicine*, 8, 605. [https://www.nature.com/articles/s41746-025-02008-z](https://www.nature.com/articles/s41746-025-02008-z)

Fanous, M., et al. (2025). SycEval: Evaluating sycophancy in large language models. *arXiv:2502.08177*. [https://arxiv.org/abs/2502.08177](https://arxiv.org/abs/2502.08177)

Klabunde, M., et al. (2023). Towards measuring representational similarity of large language models. *arXiv:2312.02730*. [https://arxiv.org/abs/2312.02730](https://arxiv.org/abs/2312.02730)

Kriegeskorte, N., Mur, M., & Bandettini, P. (2008). Representational similarity analysis: connecting the branches of systems neuroscience. *Frontiers in Systems Neuroscience*, 2, 4. [https://www.frontiersin.org/journals/systems-neuroscience/articles/10.3389/neuro.06.004.2008/full](https://www.frontiersin.org/journals/systems-neuroscience/articles/10.3389/neuro.06.004.2008/full)

Kriegeskorte, N., & Kievit, R. A. (2013). Representational geometry: integrating cognition, computation, and the brain. *Trends in Cognitive Sciences*, 17, 401-412. [https://pubmed.ncbi.nlm.nih.gov/23876494/](https://pubmed.ncbi.nlm.nih.gov/23876494/)

Kriegeskorte, N., Mur, M., Ruff, D. A., et al. (2008b). Matching categorical object representations in inferior temporal cortex of man and monkey. *Neuron*, 60, 1126-1141. [https://pubmed.ncbi.nlm.nih.gov/19109916/](https://pubmed.ncbi.nlm.nih.gov/19109916/)

Nili, H., et al. (2014). A toolbox for representational similarity analysis. *PLoS Computational Biology*, 10(4), e1003553. [https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1003553](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1003553)

Ogg, M., et al. (2024). A flexible method for behaviorally measuring alignment between human and artificial intelligence using representational similarity analysis. *arXiv:2412.00577*. [https://arxiv.org/abs/2412.00577](https://arxiv.org/abs/2412.00577)

Sharma, M., et al. (2024). Towards understanding sycophancy in language models. *ICLR 2024*. [https://arxiv.org/abs/2310.13548](https://arxiv.org/abs/2310.13548)

ELEPHANT. (2026). Social sycophancy: sycophancy as preserving the user's face. *ICLR 2026*. [https://openreview.net/forum?id=igbRHKEiAs](https://openreview.net/forum?id=igbRHKEiAs)

Bertolazzi, L., et al. (2026). How language models conflate logical validity with plausibility: A representational analysis of content effects. [https://arxiv.org/abs/2510.06700](https://arxiv.org/abs/2510.06700)
