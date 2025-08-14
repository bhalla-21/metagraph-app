# Stage 1: Build the React frontend
# We use a node image to build the frontend assets.
FROM node:18-alpine AS frontend-builder
WORKDIR /app/text-to-sql-frontend
COPY ./text-to-sql-frontend/package.json ./text-to-sql-frontend/package-lock.json ./
RUN npm install
COPY ./text-to-sql-frontend/ .
RUN npm run build

# Stage 2: Build the FastAPI backend and serve the frontend
# We use a Python image to run the backend and serve the static files.
FROM python:3.9-slim
WORKDIR /app

# Copy the Python dependencies and install them
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the built frontend assets from the first stage
COPY --from=frontend-builder /app/text-to-sql-frontend/dist ./static

# Copy the backend code and the database
COPY main.py .
COPY generator.py .
COPY metagraph.py .
COPY northwind.db .

# Expose the port the application will run on
EXPOSE 8000

# Run the uvicorn server with the --host 0.0.0.0 flag to make it accessible
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
