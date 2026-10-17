# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- One device per KitchenOwl shopping list (items to buy) and one per
  household (today's and tomorrow's meals, from the meal plan).
- "Shopping list" dashboard widget: the items with their description, an
  "Add" form, a "Check off" form and a one-tap check for the first two items.
- Scene trigger "Item added to a KitchenOwl list" (list and item filters; who
  added it, and whether it came from Gladys), never for the items already
  there at start, and remembered across restarts.
- Scene actions "Add to a KitchenOwl list" (never twice, case and accents
  ignored) and "Check off a KitchenOwl item".
- "Test the connection" action, connection status naming the problem, and a
  transport badge per device.
- Every text in English, French, German and Spanish, documentation included.

[Unreleased]: https://github.com/guim31/gladys-kitchenowl/commits/main
