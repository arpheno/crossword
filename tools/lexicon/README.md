# Lexicon ledger

`source-ledger.json` is the machine-readable record for lexicon inputs. It keeps
the older local fixture decision intact and adds the current inventory candidates:
the pinned CWL artifact, ESDB, wordfreq, Wiktextract/Kaikki, Wikidata, and the
excluded Spread the Wordlist. A source entry is not approved merely because its
repository is public: the ledger records artifact hashes, transforms, notices,
and the decision required for the intended distribution.

`build-inventory.mjs` is the offline, stream-oriented adapter. It accepts CWL
`word;score` rows, ESDB-style text, and Wiktextract JSONL, then emits normalized
records in `review` status with source receipts. Use `--decisions` for an
explicit answer-keyed editorial decision file; without it, no record becomes
accepted. It is suitable for a small engineering sample first and does not
require downloading the full Wiktextract archive into the browser repository.
