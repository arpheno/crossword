# Build legacy browser assets from the npm lockfile; no generated vendor files
# are required in the source checkout.
FROM node:24.20.0-bookworm-slim AS legacy-assets

WORKDIR /build
COPY package.json package-lock.json ./
COPY scripts/build-legacy-assets.mjs scripts/build-legacy-assets.mjs
RUN npm ci --ignore-scripts && npm run build

FROM python:3.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=5001

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libmagic1 \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir uv==0.12.7

COPY pyproject.toml uv.lock README.md ./
COPY src/ ./src/
COPY run.py ./run.py

# uv creates and manages the project environment from the pinned lockfile.
RUN uv sync --frozen --no-dev
COPY --from=legacy-assets /build/src/crossword/static/lib/ ./src/crossword/static/lib/

EXPOSE 5001
CMD [".venv/bin/python", "run.py"]
