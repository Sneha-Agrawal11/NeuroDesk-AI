Write-Host "Setting up NeuroDesk AI..." -ForegroundColor Cyan

# Install frontend dependencies
Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
pnpm install

# Install backend dependencies
Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
cd server
pnpm install
Write-Host "Generating Prisma client..." -ForegroundColor Yellow
pnpm prisma:generate
Write-Host "Running database migrations..." -ForegroundColor Yellow
pnpm prisma:migrate
cd ..

# Setup Python environment
Write-Host "Setting up Python AI service environment..." -ForegroundColor Yellow
cd ai-service
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
cd ..

# Create data directories
Write-Host "Creating data directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "data/cache/thumbnails" | Out-Null
New-Item -ItemType Directory -Force -Path "data/cache/summaries" | Out-Null
New-Item -ItemType Directory -Force -Path "data/cache/embeddings" | Out-Null
New-Item -ItemType Directory -Force -Path "data/logs" | Out-Null
New-Item -ItemType Directory -Force -Path "data/chromadb" | Out-Null

# Copy .env template
if (!(Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env file. Please fill in your API keys." -ForegroundColor Magenta
} else {
    Write-Host ".env file already exists." -ForegroundColor Gray
}

Write-Host "Setup complete!" -ForegroundColor Green
