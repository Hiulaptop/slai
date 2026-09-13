## Purpose

Defines the visible editing chrome (toolbar, block palette, layer list) around the GrapesJS-based HTML canvas, on top of the direct-edit/save/error-recovery behavior the canvas already provides.

## ADDED Requirements

### Requirement: Visible canvas toolbar
The canvas SHALL expose a visible toolbar with Undo, Redo, and a save-state indicator, reflecting the canvas's own edit history and the host's save/dirty state.

#### Scenario: Undo/redo a canvas edit
- **WHEN** the owner activates Undo or Redo in the toolbar after making one or more canvas edits
- **THEN** the canvas reverts or reapplies the most recent edit and updates the toolbar's enabled/disabled state accordingly

#### Scenario: Undo unavailable with no edits
- **WHEN** the canvas has no unsaved edit history for the current slide
- **THEN** the toolbar's Undo control is disabled

#### Scenario: Save-state indicator reflects host state
- **WHEN** the host reports a dirty, saving, or saved state
- **THEN** the toolbar's indicator reflects that state without the canvas needing its own separate save mechanism

### Requirement: Block palette for adding components
The canvas SHALL expose a block palette letting the owner add a new component to the slide, not only rearrange or restyle existing content.

#### Scenario: Add a component from the palette
- **WHEN** the owner drags or activates a block from the palette
- **THEN** a corresponding component is added to the slide at a valid position within the canvas bounds and the canvas is marked dirty

#### Scenario: Palette respects content-safety rules
- **WHEN** a palette block would introduce content the canvas's sanitization rules disallow
- **THEN** the palette does not offer that block

### Requirement: Layer list for existing components
The canvas SHALL expose a layer list reflecting the slide's current components, letting the owner select or reorder a component without locating it visually on the canvas.

#### Scenario: Select a component from the layer list
- **WHEN** the owner activates an entry in the layer list
- **THEN** the corresponding component becomes selected on the canvas

#### Scenario: Layer list reflects canvas edits
- **WHEN** a component is added, removed, or reordered on the canvas
- **THEN** the layer list updates to match without a page reload

### Requirement: Host-configurable chrome
Each host embedding the canvas SHALL be able to opt out of individual chrome pieces (toolbar, block palette, layer list) without losing the underlying direct-edit/save/error-recovery behavior.

#### Scenario: Lighter chrome for the feedback editor
- **WHEN** a host renders the canvas with a reduced chrome configuration
- **THEN** the omitted chrome pieces do not render, while direct editing, save serialization, and error recovery continue to work unchanged

#### Scenario: Full chrome for the design editor
- **WHEN** a host renders the canvas with the full chrome configuration
- **THEN** the toolbar, block palette, and layer list all render alongside the canvas
