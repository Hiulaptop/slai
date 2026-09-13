## Purpose

Defines the GrapesJS-based drag-and-drop HTML canvas that both the design editor and the per-slide feedback editor use to let owners directly edit a slide's real HTML/CSS.

## ADDED Requirements

### Requirement: Direct HTML canvas editing
The frontend SHALL render each slide being edited as a live GrapesJS canvas over that slide's HTML/CSS, allowing the owner to add, move, resize, restyle, and delete components directly on the rendered slide.

#### Scenario: Load a slide into the canvas
- **WHEN** an owner opens a completed presentation's design editor or a slide's feedback editor
- **THEN** the canvas initializes from that slide's current HTML/CSS and reflects it visually without requiring a separate preview iframe

#### Scenario: Direct edit produces a draft
- **WHEN** the owner drags, resizes, restyles, or edits text of a component in the canvas
- **THEN** the change is reflected immediately in the canvas and held as an unsaved draft until the owner explicitly saves

#### Scenario: Canvas confined to slide bounds
- **WHEN** a component is dragged or resized
- **THEN** the canvas constrains it to the slide's fixed dimensions the same way the previous pointer-based canvas did

### Requirement: Shared canvas across creation and feedback flows
The same canvas component SHALL back both the design editor's from-scratch authoring flow and the per-slide feedback editor's direct-edit flow.

#### Scenario: Design editor uses the canvas
- **WHEN** an owner opens the design editor for a presentation
- **THEN** the GrapesJS canvas replaces the previous pointer-based `DesignCanvas` for viewing and editing every slide

#### Scenario: Feedback editor uses the canvas
- **WHEN** an owner opens a slide in the per-slide feedback editor
- **THEN** the GrapesJS canvas replaces the previous read-only sandboxed iframe preview, and the owner can either edit the slide directly or still submit a free-text feedback instruction for that slide

### Requirement: Save produces sanitized per-slide HTML
The frontend SHALL serialize the canvas's current component/style state into the slide's HTML/CSS representation before sending a save, generate, or edit request, and MUST NOT submit content the canvas cannot express as safe static HTML/CSS.

#### Scenario: Save current draft
- **WHEN** the owner saves after making canvas edits
- **THEN** the frontend serializes the canvas to HTML/CSS and submits it through the presentation save contract, and a successful response replaces the canvas content with the persisted result

#### Scenario: Discard on reload or navigation
- **WHEN** the owner navigates away or reloads without saving
- **THEN** unsaved canvas edits are discarded and the next load reflects only the last persisted HTML/CSS

#### Scenario: Reject unsafe authored content
- **WHEN** a canvas edit would introduce `<script>` content, inline event-handler attributes, or a remote resource reference disallowed by the presentation's content-safety rules
- **THEN** the frontend blocks the save and surfaces an inline error instead of submitting the unsafe content

### Requirement: Canvas recovers from load and save failures
The canvas SHALL present explicit, retryable states for load and save failures instead of rendering a broken or partial canvas.

#### Scenario: Slide fails to load
- **WHEN** the owner's slide HTML/CSS cannot be retrieved
- **THEN** the editor shows a labeled error state with a retry action instead of initializing an empty or partial canvas

#### Scenario: Save fails
- **WHEN** a save request fails or returns a conflict
- **THEN** the canvas keeps the owner's unsaved draft visible, surfaces the error inline, and does not silently discard the draft
