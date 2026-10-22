# Windows PowerShell: shows the gateway alternating between the two Event Service instances.
# Usage:  .\deploy\test-load-balancing.ps1 -Gateway http://<EC2-PUBLIC-IP>:3000 -Email admin@evm.com -Password Admin@123
param(
  [string]$Gateway = "http://localhost:3000",
  [Parameter(Mandatory = $true)][string]$Email,
  [Parameter(Mandatory = $true)][string]$Password
)
$login = Invoke-RestMethod -Method Post -Uri "$Gateway/api/login" -ContentType "application/json" `
  -Body (@{ email = $Email; password = $Password } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.token)" }
1..6 | ForEach-Object {
  $r = Invoke-RestMethod -Uri "$Gateway/api/events/health" -Headers $headers
  "{0}: call {1} answered by {2}" -f (Get-Date -Format "HH:mm:ss"), $_, $r.instance
}
