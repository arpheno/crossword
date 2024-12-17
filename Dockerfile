FROM python:3.13-slim-bullseye

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    build-essential \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy project files
COPY pyproject.toml .
COPY src/ ./src/

# Install uv and dependencies
RUN pip install --no-cache-dir uv \
    && uv venv \
    && . .venv/bin/activate \
    && uv pip install -e .

# Expose the port the app runs on
EXPOSE 50001

# Run the Flask application
CMD [".venv/bin/python", "-m", "flask", "--app", "src.app", "run", "--host", "0.0.0.0", "--port", "50001"]