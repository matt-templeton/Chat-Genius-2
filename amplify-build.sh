#!/bin/bash
set -e

echo "Starting Amplify build process..."

# Install Python and dependencies
echo "Installing Python and dependencies..."
sudo yum update -y
sudo yum install -y python3 python3-pip python3-devel gcc
python3 -m pip install --user virtualenv
python3 -m virtualenv venv
source venv/bin/activate
pip install langchain_experimental langchain_openai langchain_community langchain-experimental pinecone-client openai python-dotenv

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm ci

# Build the application
echo "Building the application..."
npm run build

# Make sure Python scripts are executable
echo "Setting permissions for Python scripts..."
chmod +x server/py/*.py

echo "Build completed successfully!" 