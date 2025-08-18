# Stage 1: Build the React frontend
# We'll use a Node.js image to build our frontend assets.
FROM node:18-alpine AS frontend-builder

# Set the working directory for the frontend code
WORKDIR /app

# Copy the entire static directory to the container.
# This copies everything from the 'static' folder in the local project to '/app/static' in the container.
COPY static ./static

# Change to the frontend directory to run npm commands
WORKDIR /app/static

# Install frontend dependencies
RUN npm install

# Build the optimized production assets.
# This creates a 'dist' directory with the final files.
RUN npm run build

# Stage 2: Create the final production image
# We'll use a lightweight Python image for the backend.
FROM python:3.9-slim-buster

# Set the working directory for the backend
WORKDIR /app

# Copy the backend requirements file and install Python dependencies.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the database file
COPY northwind.db .

# Copy the backend application code
COPY main.py .

# Copy the optimized frontend assets from the builder stage
# We're taking the files from the builder's /app/static/dist and placing them at the final destination.
COPY --from=frontend-builder /app/static/dist /app/static/dist

# Expose the port the Uvicorn server will listen on
EXPOSE 8000

# Command to run the application using Uvicorn.
# The `app.mount()` in your main.py will serve the 'static' directory,
# and the build process creates a 'dist' folder inside it.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
