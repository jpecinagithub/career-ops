$body = @{
    jdText = "Finance Manager at test company. Requirements: 5+ years finance experience, SAP, IFRS, team leadership. Location: Amsterdam. Salary: €70-90k."
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/evaluate" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 60
    Write-Host "SUCCESS: Evaluation completed"
    Write-Host "Score: $($response.score)"
    Write-Host "Content length: $($response.content.Length)"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}