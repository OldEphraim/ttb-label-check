# REQUIREMENTS.md

## Context

This prototype is a take-home deliverable for the Department of the Treasury's Alcohol and Tobacco Tax and Trade Bureau (TTB) Compliance Division. TTB compliance agents currently review label artwork against application data submitted through the existing COLA system by eye. The prototype is a standalone tool — no COLA integration — that automates the field-by-field verification step. The system takes a label image plus the agent's expected values from the corresponding application and returns per-field verdicts that the agent uses to make a final compliance decision.

## Guiding Principle

Working core application with clean code is preferred over ambitious but incomplete features. Trade-offs and limitations are documented in the README rather than resolved by feature growth. This principle anchors cut-or-keep decisions throughout the build: when a feature is at risk of incompleteness, it is cut and noted in the README rather than shipped partial.

## Functional Requirements

### Single-label verification workflow

The primary workflow:

1. Agent uploads a label image (JPEG or PNG, up to a reasonable file size cap of 10 MB).
2. Agent enters expected values for each verifiable field via a form: brand name, class/type designation, alcohol content, net contents, bottler/producer name and address, country of origin (imports only).
3. System extracts the corresponding values from the label image and compares against expected values.
4. System returns per-field verdicts within approximately 5 seconds.

### Per-field verdict schema

Each verifiable field receives a verdict from one of three tiers:

- **PASS** — extracted value matches expected value within acceptable tolerance.
- **FAIL** — extracted value clearly does not match the expected value.
- **NEEDS_REVIEW** — cosmetic mismatch where semantic equivalence is plausible but not certain (e.g. "STONE'S THROW" on the label vs "Stone's Throw" in the application; "750 ML" vs "750 mL"; a trailing period present in one but not the other).

Each verdict carries:

- The extracted value from the label.
- The expected value as entered by the agent.
- A confidence score between 0 and 1.
- A one-sentence rationale explaining the verdict.
- A cropped image region showing what the model attended to, for audit trail purposes.

### Field set

The system verifies the following fields. Not all fields apply to all beverage types; the form indicates which fields are required for the selected beverage type (beer, wine, or distilled spirits).

- Brand name
- Class/type designation
- Alcohol content (ABV)
- Net contents
- Name and address of bottler or producer
- Country of origin (imports only)
- Government Health Warning Statement (mandatory on all alcohol beverages; verified by a dedicated strict checker described below)

### Government warning strict check

The Government Health Warning Statement is verified by a dedicated pipeline distinct from the field-by-field check. The strict check verifies four conditions:

1. The warning statement is present on the label.
2. The exact statutory text is present, after normalization for whitespace and line breaks.
3. The "GOVERNMENT WARNING:" prefix is rendered in all capital letters.
4. The prefix is visually bold relative to surrounding text.

A failure on any of the four sub-checks results in a FAIL verdict for this field, with the rationale identifying which sub-check failed (e.g. "warning text present but prefix is not in all caps"). All four passing yields a PASS verdict.

### Batch upload

The system accepts batch submission of multiple labels with corresponding expected-value records:

- Accept up to 300 labels per batch.
- Process labels concurrently with a sensible concurrency cap to avoid API rate limits.
- Stream results into a results table as each label completes, rather than blocking until the full batch is done.
- Each label's results follow the same per-field verdict schema as the single-label workflow.

For the prototype, expected values for batch submission may be provided via a CSV upload that pairs image filenames with their expected field values.

## Non-functional Requirements

### Latency

Single-label verification must return verdicts within approximately 5 seconds end-to-end (from upload through verdict display). This was named explicitly by the Compliance Deputy Director as the threshold below which the tool will not be adopted; a prior vendor pilot was abandoned at 30–40 second response times.

### UX accessibility

The system must be usable by agents across a wide range of technical comfort levels, including agents with limited prior exposure to web-based tools. Concrete implications:

- Large, clearly labeled click targets.
- No hidden affordances (no hover-only menus, no swipe gestures, no keyboard-only shortcuts).
- Plain-English error states with explicit next steps.
- Visual verdict indicators using color, text, and icon together rather than color alone.
- Form inputs sized for readability on standard government-issued displays.

### Image robustness

The system should produce useful output on labels that are not perfectly captured: moderate angle skew, uneven lighting, and partial glare are all expected real-world conditions. When image quality is too poor for confident extraction, the system must return a clear "image quality insufficient" message rather than a low-confidence verdict that could mislead the agent.

### Reliability and error handling

- Network errors, API timeouts, and rate limit errors must be caught and surfaced with actionable messages.
- Partial batch results must remain visible if the batch is interrupted before completion.
- The system must not silently substitute default values or fabricate extracted text when extraction fails; failure must be explicit.

## Constraints

### Model selection

- The production code path must not use Anthropic models. (Anthropic models may be used in development tooling such as Claude Code, but not in the deployed application's runtime.)
- The vision and extraction model must be from a US-based provider. OpenAI is the chosen vendor for this prototype.
- Rationale for model choice must be documented in the README.

### Integration scope

- The prototype is standalone; it does not integrate with the COLA system or any other TTB internal system.
- The prototype does not handle real personally identifiable information or production application data. Sample and test labels only.

### Deployment

- The prototype must be accessible via a public URL that evaluators can reach without VPN access or special credentials.

## Deliverables

The project brief specifies three explicit deliverables:

- **Source code repository (GitHub or equivalent)** containing all source code for the prototype.
- **README** documenting setup and run instructions, the technical approach taken, tools and libraries used, and assumptions made during the build. Trade-offs and known limitations are also captured here per the Guiding Principle.
- **Deployed application URL** accessible to evaluators without VPN access or special credentials. (See also the Deployment item under Constraints.)

## Stakeholder-to-Decision Mapping

This section maps concerns raised in the discovery interviews to specific design decisions in this prototype.

- **Sarah Chen (Deputy Director of Label Compliance), 5-second response time:** Single vision-model call per label with structured output; no multi-hop OCR-plus-LLM pipeline. Streaming results in batch processing.
- **Sarah Chen, UX for low-technical-comfort agents:** UX accessibility requirements above; single-page workflow with no hidden affordances.
- **Sarah Chen, batch upload for peak-season importers:** Batch workflow supporting up to 300 labels per submission.
- **Marcus Williams (IT Systems Administrator), federal network restrictions on outbound ML endpoints:** Acknowledged in the README as a production consideration. The prototype uses a commercial cloud API; production deployment would require either an authorized cloud-hosted inference endpoint or on-premise/VPC model serving.
- **Dave Morrison (Senior Compliance Agent), cosmetic mismatches that are clearly the same thing:** NEEDS_REVIEW verdict tier with rationale, surfacing the ambiguity to the agent rather than auto-rejecting.
- **Jenny Park (Junior Compliance Agent), government warning exact-text and styling requirement:** Dedicated strict-check pipeline for the warning statement with separate sub-verdicts for presence, exact wording, all-caps prefix, and bold-relative styling.
- **Jenny Park, imperfect image capture in the wild:** Image-robustness requirement above; explicit "image quality insufficient" response when extraction confidence falls below a defined threshold.

## Evaluation Criteria

These are lifted directly from the project brief, with a one-line note on how this requirements set addresses each.

- **Correctness and completeness of core requirements:** The field set, three-tier verdict schema, and dedicated government warning check together cover the TTB review elements named in the brief.
- **Code quality and organization:** Addressed in CLAUDE.md (coding standards, file structure, naming conventions).
- **Appropriate technical choices for the scope:** Single-pass vision model with structured output; deliberate avoidance of multi-stage pipelines that would jeopardize the latency budget.
- **User experience and error handling:** UX accessibility and reliability requirements above.
- **Attention to requirements:** The stakeholder-to-decision mapping makes explicit how each named concern from the discovery interviews is addressed.
- **Creative problem-solving:** The NEEDS_REVIEW verdict tier, the government warning as a dedicated strict-check pipeline, and the audit-trail thumbnails are design choices intended to demonstrate engineering judgment beyond the literal brief.