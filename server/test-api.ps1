$body = @{
    jdText = "Finance Manager at TechCorp. Requirements: 5+ years experience, SAP, IFRS, team leadership, budgeting and forecasting. Location: Amsterdam. Salary: €70-90k."
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3001/api/evaluate" -Method Post -Body $body -ContentType "application/json"
$response | ConvertTo-Json -Depth 10
