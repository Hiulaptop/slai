## ADDED Requirements

### Requirement: Whitelisted Tailwind class resolution for text font-size and color
The system SHALL validate a text element's font-size and color when authored as Tailwind utility classes against a developer-maintained whitelist of supported patterns and resolve each to a concrete property value before the element reaches structured graph validation, and MUST reject an unrecognized or malformed class without persisting the element or substituting a default or nearest-match value.

#### Scenario: Resolve a whitelisted named-scale class
- **WHEN** a text element's font-size or color is authored as a class matching a whitelisted named Tailwind scale entry
- **THEN** the system resolves it to that entry's concrete value and the persisted element contains only the resolved value, never the class name

#### Scenario: Resolve a whitelisted type-hinted arbitrary value
- **WHEN** a text element's font-size or color is authored as a type-hinted arbitrary-value class matching a whitelisted pattern (a length for font-size, a color for text color)
- **THEN** the system resolves it to the literal value carried in the class and persists only that resolved value

#### Scenario: Reject an unrecognized or malformed class
- **WHEN** a text element's font-size or color class does not match any whitelisted pattern, or an arbitrary-value class omits its type hint or carries a value outside the whitelisted format
- **THEN** the system rejects the containing command with a stable error and persists no element or revision

#### Scenario: Whitelist is developer-controlled only
- **WHEN** the system resolves a Tailwind class reference
- **THEN** it consults only the whitelist deployed by developers and never a value or pattern supplied within the request being validated

## MODIFIED Requirements

### Requirement: Deterministic render on demand
The system SHALL provide a portable deterministic renderer that converts a validated structured revision into safe complete HTML for preview and standalone download, rendering a text element's font-size and color as a compiled Tailwind utility class when the revision's generation was authored with Tailwind class resolution, and as an equivalent inline style otherwise.

#### Scenario: Render preview
- **WHEN** an authorized owner requests a preview of a completed structured revision
- **THEN** the system resolves its slide and element graph, escapes user content, applies registered definitions, and returns safe HTML without persisting it

#### Scenario: Download standalone presentation
- **WHEN** an authorized owner requests a downloadable presentation
- **THEN** the system returns a complete `.html` document with application-owned navigation and animations, a compiled stylesheet covering every Tailwind utility class present in that document, and no remote runtime or content dependencies

#### Scenario: Render malformed stored structure
- **WHEN** a stored graph violates a required invariant or references an unavailable definition
- **THEN** the renderer fails closed with a stable non-sensitive error instead of emitting partial or unsafe HTML

#### Scenario: Compile only at render boundaries
- **WHEN** the system produces preview or download output
- **THEN** it compiles the Tailwind stylesheet at that time from the document's resolved values and does not retain the compiled output as part of generation, revision, cache, or log records
