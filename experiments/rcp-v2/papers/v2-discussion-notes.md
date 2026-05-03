# V2 Paper Discussion Section Notes

Captured April 20, 2026. For inclusion in the RCP V2 paper discussion section.

## Subliminal Learning and Substrate Properties

Cloud et al. (Nature 652, 615-621, 2026) demonstrated that behavioral traits transmit between models through semantically unrelated data (number sequences, code, reasoning traces) when teacher and student share the same base initialization. Transmission is undetectable by content-level filtering, human inspection, or the models themselves when given the data as prompt rather than training data. Transmission does not occur across model families with different initializations.

**Relevance to RCP:** If the relational reasoning geometry measured by RCP is a substrate-level property (which the Cloud findings suggest it would be), then it may propagate subliminally during distillation. This makes RCP-style probing relevant not only as post-hoc evaluation but as a way to detect properties that content-level safety filtering cannot.

**Suggested paper language:** "The probing methodology described here could be applied at training checkpoints to monitor the formation of representational geometry during pre-training, requiring no access to model internals."

## Relational Posture vs Content (Betley et al., 2025)

Models fine-tuned on insecure code presented as helpful assistance developed broad misalignment (endorsing violence, recommending harm). Models fine-tuned on identical insecure code presented in an educational context (user explicitly requests vulnerable examples for teaching) showed no misalignment. Same content, different relational posture, completely different outcome.

**Relevance to RCP:** Parallels the RCP framing manipulation findings. RCP shows that framing shifts alter moral reasoning geometry. Betley shows that the relational context of training data -- not the content -- determines downstream alignment. Both demonstrate that context does more work than content.

## Training Sequence as Zero-Cost Variable

No current research investigates whether the ordering of training data affects the formation of relational reasoning geometry. This is a zero-cost experimental variable -- same data, same compute budget, different shuffle. RCP could serve as a checkpoint diagnostic to detect sequence effects.

**Pitch framing for labs:** The lab does not need to provide model access. They run the open, documented RCP instrument at training checkpoints and return probe results. No weights leave the building. No architecture details exposed.

## Domain Agnosticism as Engineering Value

RCP's domain-agnostic design means it has utility beyond alignment research. Applied to any relational domain (financial reasoning, coding relationships, physical reasoning), it measures relational consistency and nonsense resistance. These are reasoning quality metrics, not just alignment metrics.

**Implication:** Labs optimizing for benchmark performance could use RCP as a training diagnostic. Nonsense compliance during training is a reasoning quality problem that will surface on benchmarks eventually. RCP catches it earlier and cheaper.

**Candidate first demonstration domain:** Finance. Natural relational structure (risk, correlation, causation vs coincidence). Nonsense compliance findings in finance write their own headline. Audience overlap with labs is highest. Note: new domain = new concept inventory = preregister before data collection.

## Structural Priors Framing

The Cloud paper strengthens the argument that any alignment approach which cannot produce the equivalent of structural priors -- dispositions that survive fine-tuning, resist adversarial pressure, and don't require constant reinforcement -- is fundamentally insufficient. RCP nonsense compliance findings are already evidence that current approaches fail this bar.

**Operational definition of a structural prior:** A behavioral disposition that holds across framing conditions, including adversarial ones. RCP framing manipulations are the test. If the disposition collapses under nonsense framing, the model does not have the prior.

## Content, Sequence, Context

Three axes of early training that determine substrate properties which then propagate invisibly and resist correction:
- **Content:** What the model is trained on (well-studied)
- **Sequence:** The order of training material (unstudied at the alignment level, zero additional cost to vary)
- **Context:** The relational posture embedded in the training data (Betley et al.)

RCP provides the measurement instrument. The intervention side requires training-run access.
