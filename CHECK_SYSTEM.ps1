#!/usr/bin/env pwsh
# Diagnostic script to verify all components are working

Write-Host "=== AI Clinical Conversation Capture - Diagnostic Check ===" -ForegroundColor Cyan
Write-Host ""

# Check 1: Backend running
Write-Host "[1/6] Checking backend server..." -ForegroundColor Yellow
$backendRunning = $false
try {
    $health = Invoke-WebRequest -Uri "http://localhost:3002/health" -UseBasicParsing -ErrorAction Stop
    if ($health.StatusCode -eq 200) {
        Write-Host "✅ Backend running on port 3002" -ForegroundColor Green
        $backendRunning = $true
    }
} catch {
    Write-Host "❌ Backend not responding. Start with: cd src/backend && npm start" -ForegroundColor Red
}

# Check 2: Deepgram token endpoint
Write-Host "[2/6] Checking Deepgram token endpoint..." -ForegroundColor Yellow
if ($backendRunning) {
    try {
        $dgToken = Invoke-WebRequest -Uri "http://localhost:3002/api/deepgram/token" -Method POST -ContentType "application/json" -UseBasicParsing -ErrorAction Stop
        if ($dgToken.StatusCode -eq 200) {
            Write-Host "✅ Deepgram token endpoint working" -ForegroundColor Green
        }
    } catch {
        Write-Host "⚠️  Deepgram endpoint error: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "⏭️  Skipped (backend not running)" -ForegroundColor Gray
}

# Check 3: AssemblyAI token endpoint
Write-Host "[3/6] Checking AssemblyAI token endpoint..." -ForegroundColor Yellow
if ($backendRunning) {
    try {
        $aaToken = Invoke-WebRequest -Uri "http://localhost:3002/api/assemblyai/token" -Method POST -ContentType "application/json" -UseBasicParsing -ErrorAction Stop
        $aaResponse = $aaToken.Content | ConvertFrom-Json
        if ($aaResponse.ready) {
            Write-Host "✅ AssemblyAI token endpoint working (API key validated)" -ForegroundColor Green
        } else {
            Write-Host "⚠️  AssemblyAI response: $($aaResponse.error)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️  AssemblyAI endpoint error: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "   (This is expected if API key is not configured)" -ForegroundColor Gray
    }
} else {
    Write-Host "⏭️  Skipped (backend not running)" -ForegroundColor Gray
}

# Check 4: Frontend build
Write-Host "[4/6] Checking frontend build..." -ForegroundColor Yellow
if (Test-Path "build/index.html") {
    $buildSize = (Get-Item "build/assets/index*.js" | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "✅ Frontend built ($('{0:F1}' -f $buildSize)MB)" -ForegroundColor Green
} else {
    Write-Host "❌ Frontend not built. Run: npm run build" -ForegroundColor Red
}

# Check 5: VoiceAnalyzer installed
Write-Host "[5/6] Checking VoiceAnalyzer component..." -ForegroundColor Yellow
if (Test-Path "src/services/speaker-detection/VoiceAnalyzer.ts") {
    Write-Host "✅ VoiceAnalyzer.ts found" -ForegroundColor Green
    $voiceAnalyzerSize = (Get-Item "src/services/speaker-detection/VoiceAnalyzer.ts").Length / 1KB
    Write-Host "   (File size: $('{0:F1}' -f $voiceAnalyzerSize)KB)" -ForegroundColor Gray
} else {
    Write-Host "❌ VoiceAnalyzer.ts missing" -ForegroundColor Red
}

# Check 6: Environment variables
Write-Host "[6/6] Checking environment configuration..." -ForegroundColor Yellow
$envFile = "src/backend/.env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile
    $hasDG = $envContent | Select-String "DEEPGRAM_API_KEY"
    $hasAA = $envContent | Select-String "ASSEMBLYAI_API_KEY"
    
    if ($hasDG) { Write-Host "✅ DEEPGRAM_API_KEY configured" -ForegroundColor Green }
    else { Write-Host "⚠️  DEEPGRAM_API_KEY not found" -ForegroundColor Yellow }
    
    if ($hasAA) { Write-Host "✅ ASSEMBLYAI_API_KEY configured" -ForegroundColor Green }
    else { Write-Host "⚠️  ASSEMBLYAI_API_KEY not found" -ForegroundColor Yellow }
} else {
    Write-Host "❌ .env file not found at src/backend/.env" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "If all checks pass, you're ready to test acoustic speaker detection!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Open http://localhost:5175 in browser" -ForegroundColor White
Write-Host "2. Press F12 to open Developer Console" -ForegroundColor White
Write-Host "3. Click 'Start Recording'" -ForegroundColor White
Write-Host "4. Have two different speakers take turns speaking" -ForegroundColor White
Write-Host "5. Watch console for speaker detection logs" -ForegroundColor White
Write-Host ""
Write-Host "Expected console output:" -ForegroundColor Yellow
Write-Host "[Audio Analysis] Acoustic analysis initialized" -ForegroundColor Gray
Write-Host "🔊 Speaker change detected: Doctor (confidence: 0.84)" -ForegroundColor Gray
