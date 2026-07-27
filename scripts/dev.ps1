Write-Host "Starting NeuroDesk AI Development Environment..." -ForegroundColor Cyan

# Start AI Service (Python)
Write-Host "Starting AI Service..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd ai-service; .\.venv\Scripts\activate; uvicorn main:app --reload --port 8000"

# Start Backend (Express)
Write-Host "Starting Backend Service..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd server; pnpm dev"

# Start Frontend (Next.js)
Write-Host "Starting Frontend Service..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "pnpm dev"

Write-Host "All services starting..." -ForegroundColor Green
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:3001" -ForegroundColor Cyan
Write-Host "AI:       http://localhost:8000" -ForegroundColor Cyan
