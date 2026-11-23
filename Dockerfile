# syntax=docker/dockerfile:1
# Full app: static front-end + account API. See DEPLOY.md.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    ALLOW_GUEST=1 \
    ALLOW_LOCAL_TOOLS=0

WORKDIR /app
COPY . .

# Create the public env file (empty unless .env was copied; .dockerignore keeps it out by default).
RUN python scripts/build.py env && mkdir -p /data

EXPOSE 3000
VOLUME ["/data"]

# The entrypoint fixes ownership of DATA_DIR, drops privileges to UID 10001, then starts server.py.
ENTRYPOINT ["python", "scripts/docker_entrypoint.py"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '3000') + '/api/health', timeout=4)" || exit 1
