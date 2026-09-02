import os
import sys

import pytest

# Add the src directory to Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "src")))


def pytest_collection_modifyitems(config, items):
    """Keep provider-backed diagnostics opt-in even outside Make targets."""

    del config  # pytest passes the config for hook compatibility.
    if os.environ.get("CROSSWORD_ALLOW_LIVE_PROVIDER") == "1":
        return

    skip_live = pytest.mark.skip(
        reason="live provider tests require CROSSWORD_ALLOW_LIVE_PROVIDER=1"
    )
    for item in items:
        if "live_provider" in item.keywords:
            item.add_marker(skip_live)
