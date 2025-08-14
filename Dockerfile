# filename: Dockerfile

# Use the official Python image as a base
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install the dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code into the container
COPY main.py .

# Copy the static frontend files
COPY static/ ./static/

# --- NEW LINE ADDED HERE ---
# Copy the SQLite database file into the container
COPY northwind.db .

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application using Gunicorn
# This is a robust way to run Python web apps in production
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8000", "main:app"]
