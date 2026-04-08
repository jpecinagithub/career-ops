try {
    $wc = New-Object System.Net.WebClient
    $wc.Headers.Add("Content-Type", "application/json")
    $body = '{"jdText": "Finance Manager role. Requirements: SAP, IFRS, team leadership."}'
    
    $response = $wc.UploadString("http://localhost:3001/api/evaluate/stream", "POST", $body)
    
    Write-Host "SUCCESS: Stream completed"
    Write-Host "Response length: $($response.Length)"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}