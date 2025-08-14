# Use the official Python image as a base
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the frontend build files
COPY static ./static

# Copy the database
COPY northwind.db .

# Add a diagnostic command to list files and confirm the database exists
RUN ls -l /app

# Copy the backend code
COPY main.py .

# Expose the port the app runs on
EXPOSE 8000

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
