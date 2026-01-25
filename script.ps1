=[System.IO.File]::ReadAllBytes('app/page.tsx')
=New-Object System.Text.UTF8Encoding(False,True)
try {
  .GetString() | Out-Null
  Write-Output 'valid'
} catch {
  Write-Output .Exception.Message
}
