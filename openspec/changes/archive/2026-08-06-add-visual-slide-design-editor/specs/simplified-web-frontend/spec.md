## ADDED Requirements

### Requirement: Create path chooser for design and report flows
The protected `/slides/new` experience SHALL offer an authenticated path chooser that routes to design-first project setup (template or blank) or the report-driven generation workspace.

#### Scenario: Open Create from dashboard
- **WHEN** an authenticated user activates Create presentation
- **THEN** `/slides/new` shows the authenticated navbar and clear choices for design-from-template-or-blank and generate-from-report

#### Scenario: Enter design setup
- **WHEN** the user chooses design-from-template-or-blank
- **THEN** the UI collects title and template-or-blank selection and can submit bootstrap without report uploads

#### Scenario: Enter report generation
- **WHEN** the user chooses generate-from-report
- **THEN** the existing report creation workspace is shown with its outline and generation phases

#### Scenario: Anonymous Create destination
- **WHEN** an anonymous user visits `/slides/new`
- **THEN** protected navigation redirects them to login with the intended destination

## MODIFIED Requirements

### Requirement: Create presentation placeholder
The system SHALL expose protected `/slides/new` as the authenticated create entry for both design-first bootstrap and report-driven generation, not as an empty placeholder-only page.

#### Scenario: Open create destination
- **WHEN** an authenticated user activates either Create presentation action
- **THEN** `/slides/new` displays the authenticated navbar and the create path chooser (or the selected create mode) with navigation back to `/home`

#### Scenario: Anonymous create destination
- **WHEN** an anonymous user visits `/slides/new`
- **THEN** protected navigation redirects them to login with the intended destination
