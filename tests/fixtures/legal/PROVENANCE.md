# Legal fixture provenance

`synthetic_mechanics_v1.json` is a hand-authored, provider-neutral fixture
created on 2026-08-29 for the M0.3 characterization suite.

- Status: synthetic; no puzzle-provider payload was copied or transformed.
- License: CC0-1.0 for this fixture and its invented clue surfaces.
- Source: `null` (there is no external source record).
- Network: not required; tests load the checked-in JSON only.
- Protected material: the fixture was written from scratch and contains no
  protected clues, answers, identifiers, endpoints, or solution links.
- Scope: normal cells, circled cells, shaded cells, rebus cells, a cell with
  combined circle/shade/rebus metadata, and duplicate clue text with distinct
  numbered entries.

The encoded grid rows are deliberately a small compatibility representation
for the current parser. They are not a provider export. The test adapter adds
only the parser's historical section delimiters at runtime; no raw wire dump is
stored in the repository.
