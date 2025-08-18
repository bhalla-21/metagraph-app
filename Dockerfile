# Stage 1: Build the React frontend
# We'll use a Node.js image to build our frontend assets.
FROM node:18-alpine AS frontend-builder

# Set the working directory for the frontend code
WORKDIR /app/static

# Copy package.json and package-lock.json (if you have it)
COPY static/package.json ./

# Install frontend dependencies
RUN npm install

# Copy the rest of the frontend source code
COPY static/ ./

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
# The 'dist' folder from the frontend build stage will be copied to '/app/static/dist'
COPY --from=frontend-builder /app/static/dist /app/static/dist

# Expose the port the Uvicorn server will listen on
EXPOSE 8000

# Command to run the application using Uvicorn.
# The `app.mount()` in your main.py will serve the 'static' directory,
# and the build process creates a 'dist' folder inside it.
# You need to make sure your main.py is configured to serve from the correct path.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
