"""Serve the legacy page with a local synthetic puzzle for browser smoke tests.

The real legacy app remains provider-backed when run through ``make legacy:run``.
This harness replaces only that route in memory, so a browser smoke never calls
the private provider or depends on copyrighted puzzle data.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from flask import jsonify

# Running a file under scripts/ puts that directory first on sys.path. Add the
# checkout root explicitly so the legacy src namespace works from any cwd.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.crossword.app import app, socketio


def synthetic_crossword(weekday: str):
    """Return a tiny provider-neutral puzzle used only by the smoke harness."""

    del weekday

    letters = ["C", "A", "T"]
    entries = [
        {
            "clue_number": 1,
            "clue_text": "Small domestic animal (smoke fixture)",
            "direction": "across",
            "start_x": 0,
            "start_y": 0,
            "characters": [{"letters": letter} for letter in letters],
        },
        {
            "clue_number": 1,
            "clue_text": "A feline sound (smoke fixture)",
            "direction": "down",
            "start_x": 0,
            "start_y": 0,
            "characters": [{"letters": letter} for letter in letters],
        },
    ]
    return jsonify(
        {
            "metadata": {
                "date": "260829",
                "title": "Synthetic legacy browser fixture",
                "authors": ["Crossword test fixture"],
                "width": 3,
                "height": 3,
            },
            "entries": entries,
        }
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=5001, type=int)
    args = parser.parse_args()

    # Flask stores the endpoint name separately from its function. Replacing
    # the mapping keeps the production application module untouched.
    app.view_functions["get_random_crossword"] = synthetic_crossword
    socketio.run(app, host=args.host, port=args.port, debug=False, allow_unsafe_werkzeug=True)


if __name__ == "__main__":
    main()
