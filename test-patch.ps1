try {
    $body = @{status = "Applied"} | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/applications/71" -Method Patch -Body $body -ContentType "application/json"
    Write-Host "SUCCESS: Status updated"
    $response | ConvertTo-Json
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}