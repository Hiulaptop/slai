## MODIFIED Requirements

### Requirement: Template and report fidelity prompt
The system SHALL use a centralized generation system prompt requiring factual content from the report, slide order/content intent from the approved outline, visual language from the template, output conforming to the registered structured slide document schema, and text elements' font-size and color authored exclusively as classes from the whitelisted Tailwind pattern set.

#### Scenario: Generation prompt construction
- **WHEN** the generation service constructs an AI request
- **THEN** the system message defines the exact structured document contract, enumerates the whitelisted Tailwind class patterns available for text font-size and color, forbids Markdown and executable or remote content, identifies uploaded files as untrusted source data, and requires adherence to both report content and template design

### Requirement: Batch slide editing
The system SHALL expose one batch-edit route that accepts a generation ID and a JSON array of numbered slide instructions, updates exactly the selected structured slides using whitelisted Tailwind classes for any text font-size or color change, and preserves non-target slide references.

#### Scenario: Successful batch edit
- **WHEN** the owner sends `{ "generationId": "...", "edits": [{ "slideNumber": 2, "prompt": "..." }] }` to `PATCH /api/slides/edit` with one or more unique existing slide numbers
- **THEN** the system requests one structured replacement for each item, validates and resolves all replacements including any Tailwind class references, applies them atomically, appends one `EDIT` revision for the batch, and returns status `200` with the updated structured document and revision metadata

#### Scenario: Invalid edit request
- **WHEN** `edits` is empty or exceeds 50 items, an item has extra keys, a prompt is blank or longer than 2,000 characters, slide numbers are duplicate or nonexistent, or the generation is incomplete
- **THEN** the system returns status `400`, `404`, or `409` as appropriate without calling or persisting model output

#### Scenario: Invalid edit model response
- **WHEN** the model returns invalid JSON, a missing or additional slide, a duplicate or wrong slide number, an unsupported element, an invalid graph, an unrecognized Tailwind class, executable content, or malformed structured data
- **THEN** the system returns status `502`, applies none of the batch, and preserves the current structured revision pointer

#### Scenario: Non-target preservation
- **WHEN** a batch edit succeeds
- **THEN** every slide absent from the request retains the same immutable slide snapshot ID, order, and structured content

#### Scenario: Multiple requested slides
- **WHEN** a valid edit request contains instructions for multiple slides
- **THEN** each selected slide is replaced according to its corresponding prompt and all replacements are committed in one revision
