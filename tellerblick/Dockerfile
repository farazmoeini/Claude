# Tellerblick API + web app + legal pages in one container.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATA_DIR=/data
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
COPY web web
COPY legal legal
RUN useradd --uid 10001 --create-home app && mkdir -p /data && chown app /data
USER app
WORKDIR /app/backend
EXPOSE 8300
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8300/healthz')"
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8300", "--proxy-headers", "--forwarded-allow-ips", "*", "--workers", "1"]
