FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app /app/app
COPY backend/adapters /app/adapters
COPY sample-data /app/sample-data
ENV PYTHONPATH=/app
ENV SAMPLE_PROJECTS_ROOT=/app/sample-data/projects
ENV SAMPLE_LEGACY_PATH=/app/sample-data/projects/party-customer-wave1/legacy
ENV MIGRATION_REPO_PATH=/app/sample-data/projects/party-customer-wave1/migration-repo
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
