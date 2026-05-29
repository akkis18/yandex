#!/bin/bash
# ==================================================
#      AWS EC2 BOT DEPLOYMENT AUTO-SETUP
# ==================================================
set -e

echo "=================================================="
echo "      STARTING AWS EC2 AUTO-SETUP SCRIPT          "
echo "=================================================="

# 1. Update system
echo "[1/4] Updating system packages..."
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js v20 LTS
echo "[2/4] Installing Node.js v20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Install PM2 globally
echo "[3/4] Installing PM2..."
sudo npm install -g pm2

# 4. Install PostgreSQL locally
echo "[4/4] Installing PostgreSQL Database..."
sudo apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Configure PostgreSQL user and database
echo "Configuring PostgreSQL database..."
sudo -u postgres psql -c "CREATE DATABASE verceldb;" || true
sudo -u postgres psql -c "CREATE USER default WITH PASSWORD 'DYLacnZeb1C3';" || true
sudo -u postgres psql -c "ALTER USER default WITH SUPERUSER;" || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE verceldb TO default;" || true

echo "=================================================="
echo "            SETUP COMPLETED SUCCESSFULLY!         "
echo "=================================================="
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"
echo "PM2 version: $(pm2 -v)"
echo "PostgreSQL is running and configured!"
echo "DATABASE_URL=postgresql://default:DYLacnZeb1C3@localhost:5432/verceldb?schema=public"
echo "=================================================="
