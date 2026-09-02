#!/bin/sh

# Compatibility entrypoint for the private bridge. uv owns interpreter
# selection; do not fall back to a globally installed Python.
set -eu
exec uv run python run.py
