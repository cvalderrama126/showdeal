$base = "http://localhost:3000"
$script:p = 0; $script:f = 0

function TE($method, $path, $body, $h, $exp, $lbl) {
    try {
        $prm = @{ Uri = "$base$path"; Method = $method; UseBasicParsing = $true; ErrorAction = "Stop" }
        if ($h) { $prm.Headers = $h }
        if ($body) { $prm.Body = ($body | ConvertTo-Json -Compress) }
        $r = Invoke-WebRequest @prm
        $ok = $exp -contains [int]$r.StatusCode
        $script:p += if ($ok) { 1 } else { 0 }; $script:f += if (!$ok) { 1 } else { 0 }
        Write-Host "  [$(if($ok){'PASS'}else{'FAIL'})] $lbl => HTTP $($r.StatusCode)"
        return $r
    }
    catch {
        $c = [int]$(if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { 0 })
        $ok = $c -gt 0 -and ($exp -contains $c)
        $script:p += if ($ok) { 1 } else { 0 }; $script:f += if (!$ok) { 1 } else { 0 }
        Write-Host "  [$(if($ok){'PASS'}else{'FAIL'})] $lbl => HTTP $c"
        return $null
    }
}

Write-Host ""
Write-Host "======================================"
Write-Host " SHOWDEAL - PRODUCTION TEST SUITE"
Write-Host "======================================"

# 1. Health
Write-Host "`n[1] Health & Readiness"
TE "GET" "/health" $null $null @(200) "GET /health"
TE "GET" "/health/ready" $null $null @(200) "GET /health/ready"

# 2. CSRF
Write-Host "`n[2] CSRF Token"
$cr = TE "GET" "/auth/csrf-token" $null @{ "Content-Type" = "application/json" } @(200) "GET /auth/csrf-token"
$ct = $null; $ck = $null
if ($cr) {
    $ct = ($cr.Content | ConvertFrom-Json).csrfToken
    $setCookie = $cr.Headers['Set-Cookie']
    if ($setCookie) { $ck = ($setCookie -split ';')[0] }
    Write-Host "    Token: $($ct.Substring(0, 20))..."
}

# 3. Auth
Write-Host "`n[3] Authentication Flow"
$jh = @{ "Content-Type" = "application/json" }
$ah = @{ "Content-Type" = "application/json"; "x-csrf-token" = $ct; "Cookie" = $ck }

TE "POST" "/auth/login" @{ user = ""; password = "" } $ah @(400) "POST /auth/login body vacio"
TE "POST" "/auth/login" @{ user = "nosoy"; password = "xxx" } $ah @(401, 403, 429) "POST /auth/login user inexistente"
Start-Sleep -Milliseconds 800
TE "POST" "/auth/login" @{ user = "admin"; password = "wrongpass" } $ah @(401, 403, 429) "POST /auth/login password incorrecta"
Start-Sleep -Milliseconds 800
TE "POST" "/auth/login" @{ user = "admin"; password = "password123" } $jh @(200, 429) "POST /auth/login sin CSRF (excluido intencionalmente)"
Start-Sleep -Milliseconds 1200
$lr = TE "POST" "/auth/login" @{ user = "admin"; password = "password123" } $ah @(200) "POST /auth/login admin OK"
$tk = $null
if ($lr) {
    $ld = $lr.Content | ConvertFrom-Json
    Write-Host "    Keys: $(($ld | Get-Member -MemberType NoteProperty).Name -join ', ')"
    $tk = if ($ld.token) { $ld.token } elseif ($ld.accessToken) { $ld.accessToken } elseif ($ld.sessionToken) { $ld.sessionToken } else { $null }
    # Fallback: extract JWT from sd_auth session cookie
    if (!$tk -and $lr.Headers['Set-Cookie']) {
        $allCookies = $lr.Headers['Set-Cookie']
        if ($allCookies -match 'sd_auth=([^;]+)') { $tk = $Matches[1] }
    }
    if ($tk) { Write-Host "    Token obtenido OK ($(if($tk.Length -gt 30){$tk.Substring(0,30)+'...'}else{$tk}))" }
}

# 4. Rutas protegidas sin token
Write-Host "`n[4] Rutas protegidas sin token (esperado 401)"
$routes = "r_user", "r_role", "r_module", "r_auction", "r_asset", "r_bid", "r_company", "r_access", "r_event"
foreach ($rt in $routes) {
    TE "GET" "/api/$rt" $null $jh @(401) "GET /api/$rt sin token"
}
TE "GET" "/api/ruta_404" $null $jh @(404) "GET ruta inexistente"

# 5. Con token de admin
if ($tk) {
    Write-Host "`n[5] Rutas autenticadas con token Admin"
    $bh = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $tk" }
    foreach ($rt in $routes) {
        TE "GET" "/api/$rt" $null $bh @(200) "GET /api/$rt con token"
    }
    TE "GET" "/auth/me" $null $bh @(200) "GET /auth/me"
}
else {
    Write-Host "`n[5] SKIP (no hay token de acceso)" -ForegroundColor Red
}

Write-Host ""
Write-Host "======================================"
$col = if ($script:f -eq 0) { "Green" } else { "Yellow" }
Write-Host " RESULTADO: PASS=$($script:p)  FAIL=$($script:f)" -ForegroundColor $col
Write-Host "======================================"
