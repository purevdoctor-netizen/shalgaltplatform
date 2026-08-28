<#
.SYNOPSIS
    Шалгалтын платформыг сургуулийн дотоод сүлжээнд 24/7 ажиллуулахаар бэлдэнэ.

.DESCRIPTION
    1. LAN IP-г илрүүлж баталгаажуулна
    2. `.env`-ыг production утгаар бөглөнө
    3. Өгөгдлийн сангийн migration + (сонголтоор) жишээ өгөгдөл
    4. Вэб апп-ыг тухайн LAN хаягаар build хийнэ
    5. Windows Firewall-д дүрэм нэмнэ
    6. NSSM-ээр Windows Service болгож бүртгэнэ (компьютер асахад автоматаар эхэлнэ)

.PARAMETER Port
    Сонсох порт. Анхдагч 8080. 80 хэрэглэвэл админ эрх шаардана.

.PARAMETER LanIp
    Гараар зааж өгөх LAN IP. Хоосон бол автоматаар илрүүлнэ.

.PARAMETER SmtpHost / SmtpPort / SmtpUser / SmtpPass / SmtpFrom
    Имэйл илгээх SMTP тохиргоо. Хоосон бол имэйл идэвхгүй үлдэнэ.

.PARAMETER Seed
    Жишээ өгөгдөл ачаална (танилцах, туршихад).

.PARAMETER SkipService
    Windows Service бүртгэхгүй (зөвхөн бэлтгэл хийнэ).

.EXAMPLE
    # Админ эрхээр PowerShell нээгээд:
    .\scripts\setup-server.ps1 -Port 8080

.EXAMPLE
    .\scripts\setup-server.ps1 -Port 8080 -SmtpHost smtp.gmail.com -SmtpPort 465 `
        -SmtpUser bagsh@gmail.com -SmtpPass "xxxx xxxx xxxx xxxx"
#>

[CmdletBinding()]
param(
    [int]$Port = 8080,
    [string]$LanIp = '',
    [string]$SmtpHost = '',
    [int]$SmtpPort = 587,
    [string]$SmtpUser = '',
    [string]$SmtpPass = '',
    [string]$SmtpFrom = '',
    [switch]$Seed,
    [switch]$SkipService,
    [switch]$SetPrivateNetwork,
    [string]$ServiceName = 'ShalgaltPlatform',

    <#
      QR кодод шингээх ТОГТМОЛ хаяг (ж: http://192.168.1.50:8080).
      ХООСОН орхивол QR нь багшийн нээсэн хаягийг автоматаар дагана —
      DHCP-ээр IP өөрчлөгддөг сүлжээнд ИЛҮҮ НАЙДВАРТАЙ.
      Статик IP тохируулсны дараа энд заана.
    #>
    [string]$PublicUrl = '',

    # --- Админ данс ---
    [string]$AdminUsername = 'admin',
    [string]$AdminName = '',
    [string]$AdminEmail = '',
    [switch]$SkipAdmin
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Write-Step  { param([string]$m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok    { param([string]$m) Write-Host "    OK  $m" -ForegroundColor Green }
function Write-Warn2 { param([string]$m) Write-Host "    !   $m" -ForegroundColor Yellow }
function Write-Err2  { param([string]$m) Write-Host "    X   $m" -ForegroundColor Red }

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ---------------------------------------------------------------------------
# 0. Урьдчилсан шалгалт
# ---------------------------------------------------------------------------
Write-Step 'Урьдчилсан шалгалт'

$isAdmin = Test-Admin
if (-not $isAdmin) {
    Write-Warn2 'Админ эрхгүй байна. Firewall болон Service бүртгэл алгасагдана.'
    Write-Warn2 'Бүрэн суулгахын тулд PowerShell-ийг "Run as administrator" гэж нээнэ үү.'
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Write-Err2 'Node.js олдсонгүй. https://nodejs.org-оос LTS хувилбарыг суулгана уу.'; exit 1 }
Write-Ok "Node.js $(node --version)"

$env:Path = "$env:APPDATA\npm;$env:Path"
$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
    Write-Warn2 'pnpm олдсонгүй — суулгаж байна…'
    npm install -g pnpm@9.12.3 --loglevel=error
    $env:Path = "$env:APPDATA\npm;$env:Path"
}
Write-Ok "pnpm $(pnpm -v)"

# ---------------------------------------------------------------------------
# 1. LAN IP
# ---------------------------------------------------------------------------
Write-Step 'LAN IP тодорхойлох'

if ($LanIp -eq '') {
    $candidates = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object {
            $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and
            $_.PrefixOrigin -ne 'WellKnown' -and
            (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).Status -eq 'Up'
        } |
        Sort-Object -Property @{ Expression = { if ($_.IPAddress -match '^192\.168\.') { 0 } elseif ($_.IPAddress -match '^10\.') { 1 } else { 2 } } }

    if (-not $candidates) { Write-Err2 'LAN IP олдсонгүй. -LanIp параметрээр гараар зааж өгнө үү.'; exit 1 }

    if ($candidates.Count -gt 1) {
        Write-Host '    Олон хаяг олдлоо:'
        $i = 0
        foreach ($c in $candidates) { Write-Host "      [$i] $($c.IPAddress)  ($($c.InterfaceAlias))"; $i++ }
    }
    $LanIp = $candidates[0].IPAddress
}

Write-Ok "LAN IP: $LanIp"
$BaseUrl = "http://${LanIp}:${Port}"
Write-Ok "Нийтийн хаяг: $BaseUrl"

$chosenAdapter = (Get-NetIPAddress -IPAddress $LanIp -ErrorAction SilentlyContinue | Select-Object -First 1)

if ($chosenAdapter -and $chosenAdapter.PrefixOrigin -eq 'Dhcp') {
    Write-Warn2 'Энэ IP нь DHCP-ээр авсан ТҮР хаяг байна!'
    Write-Warn2 'Router дээр DHCP reservation хийх эсвэл статик IP тохируулна уу.'
    Write-Warn2 'Эс бөгөөс дахин асаахад хаяг өөрчлөгдөж, хэвлэсэн QR код ажиллахаа болино.'
    Write-Warn2 'Дэлгэрэнгүй: DEPLOY.md §2'
}

# ---------------------------------------------------------------------------
# 1.1 Сүлжээний профайл — Public бол Firewall орох холболтыг хаана
# ---------------------------------------------------------------------------
Write-Step 'Сүлжээний профайл шалгах'

$profiles = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue |
    Where-Object { $_.NetworkCategory -eq 'Public' -and $_.InterfaceAlias -eq $chosenAdapter.InterfaceAlias })

if ($profiles.Count -gt 0) {
    $alias = $profiles[0].InterfaceAlias
    Write-Warn2 "'$alias' сүлжээ PUBLIC профайлтай байна."
    Write-Warn2 'Public профайлд Windows Firewall орох холболтыг хаадаг тул'
    Write-Warn2 'өөр компьютер/утаснаас НЭЭГДЭХГҮЙ.'

    if ($SetPrivateNetwork -and $isAdmin) {
        Set-NetConnectionProfile -InterfaceAlias $alias -NetworkCategory Private
        Write-Ok "'$alias' → Private болголоо"
    }
    elseif ($isAdmin) {
        Write-Warn2 'Засах: -SetPrivateNetwork тугтай дахин ажиллуулах, эсвэл:'
        Write-Warn2 "  Set-NetConnectionProfile -InterfaceAlias '$alias' -NetworkCategory Private"
    }
    else {
        Write-Warn2 'Админ эрхээр дараахыг ажиллуулна уу:'
        Write-Warn2 "  Set-NetConnectionProfile -InterfaceAlias '$alias' -NetworkCategory Private"
    }
}
else {
    Write-Ok 'Сүлжээний профайл тохиромжтой (Private/Domain)'
}

# ---------------------------------------------------------------------------
# 2. .env бэлдэх
# ---------------------------------------------------------------------------
Write-Step '.env тохиргоо бичих'

$envPath = Join-Path $RepoRoot '.env'

# ---------------------------------------------------------------------------
# Хуучин .env дэх SMTP тохиргоог ХАДГАЛНА.
# (`setup-email.ps1`-ээр тохируулсан Gmail тохиргоо дахин суулгахад арилахгүй.)
# ---------------------------------------------------------------------------
$existing = @{}
if (Test-Path $envPath) {
    foreach ($line in [IO.File]::ReadAllLines($envPath, [Text.UTF8Encoding]::new($false))) {
        if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') {
            $existing[$Matches[1]] = $Matches[2].Trim()
        }
    }
}

function Get-Existing { param([string]$Key, [string]$Fallback = '')
    if ($existing.ContainsKey($Key) -and $existing[$Key] -ne '') { return $existing[$Key].Trim('"').Trim("'") }
    return $Fallback
}

if ($SmtpHost -eq '') {
    $keptHost = Get-Existing 'SMTP_HOST'
    # localhost:1025 нь тохируулаагүйн шинж — хадгалах утгагүй
    $keptPort = Get-Existing 'SMTP_PORT'
    if ($keptHost -ne '' -and -not ($keptHost -match '^(localhost|127\.0\.0\.1)$' -and $keptPort -eq '1025')) {
        $SmtpHost  = $keptHost
        $SmtpPort  = [int]$keptPort
        $SmtpUser  = Get-Existing 'SMTP_USER'
        $SmtpPass  = Get-Existing 'SMTP_PASS'
        $SmtpFrom  = Get-Existing 'SMTP_FROM'
        Write-Ok "Хуучин SMTP тохиргоог хадгаллаа ($SmtpHost)"
    }
}

$smtpFromValue = if ($SmtpFrom -ne '') { $SmtpFrom } elseif ($SmtpUser -ne '') { "Шалгалтын платформ <$SmtpUser>" } else { 'Шалгалтын платформ <noreply@shalgalt.local>' }
$smtpSecure = if ($SmtpPort -eq 465) { 'true' } else { 'false' }

$envContent = @"
# ЭНЭ ФАЙЛЫГ scripts/setup-server.ps1 ҮҮСГЭСЭН
# Гараар засаж болно. Зассаны дараа үйлчилгээг дахин асаана:
#   Restart-Service $ServiceName

# ⚠ Vite нь .env дотор NODE_ENV байхыг зөвшөөрдөггүй тул APP_ENV ашиглана
APP_ENV=production
TZ=Asia/Ulaanbaatar

API_PORT=$Port
API_HOST=0.0.0.0

DATABASE_PROVIDER=sqlite
DATABASE_URL="file:./prod.db"

# Вэб апп-ыг ижил портоор үйлчилнэ — nginx/Docker шаардлагагүй
SERVE_WEB_DIR=apps/web/dist

WEB_ORIGIN=$BaseUrl
CORS_ALLOW_LAN=true

RATE_LIMIT_WINDOW_MIN=1
RATE_LIMIT_MAX=300

UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=10

SMTP_HOST=$SmtpHost
SMTP_PORT=$SmtpPort
SMTP_SECURE=$smtpSecure
SMTP_USER=$SmtpUser
SMTP_PASS=$SmtpPass
SMTP_FROM="$smtpFromValue"
EMAIL_MAX_ATTEMPTS=5

# QR кодод орох нийтийн хаяг (build үед шингэнэ).
# ХООСОН = багшийн нээсэн хаягийг автоматаар дагана (DHCP-д найдвартай).
VITE_APP_NAME="Шалгалтын платформ"
VITE_API_BASE_URL=
VITE_PUBLIC_APP_URL=$PublicUrl
VITE_QR_MAX_BYTES=1200
"@

if (Test-Path $envPath) {
    $backup = "$envPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item $envPath $backup
    Write-Warn2 "Хуучин .env-ыг нөөцөллөө: $(Split-Path -Leaf $backup)"
}
Set-Content -Path $envPath -Value $envContent -Encoding utf8
Write-Ok '.env бичигдлээ'

if ($SmtpHost -eq '') {
    Write-Warn2 'SMTP тохируулаагүй тул имэйл илгээхгүй. Тайланг гараар татаж болно.'
}

# ---------------------------------------------------------------------------
# 3. Хамаарал + өгөгдлийн сан
# ---------------------------------------------------------------------------
Write-Step 'Хамаарал суулгах'
Push-Location $RepoRoot
try {
    pnpm install --prod=false
    if ($LASTEXITCODE -ne 0) { throw 'pnpm install амжилтгүй' }
    Write-Ok 'Хамаарал бэлэн'

    Write-Step 'Өгөгдлийн сангийн migration'
    pnpm db:deploy
    if ($LASTEXITCODE -ne 0) { throw 'migration амжилтгүй' }
    Write-Ok 'Өгөгдлийн сан бэлэн'

    if ($Seed) {
        Write-Step 'Жишээ өгөгдөл ачаалах'
        pnpm db:seed
        Write-Ok 'Жишээ өгөгдөл орлоо'
    }

    # -----------------------------------------------------------------------
    # 3.1 Админ данс — багш нарын дансыг энэ дансаар нээнэ
    # -----------------------------------------------------------------------
    if (-not $SkipAdmin) {
        Write-Step 'Админ данс'

        $adminArgs = @('--username', $AdminUsername)
        if ($AdminName -ne '') { $adminArgs += @('--name', $AdminName) }
        if ($AdminEmail -ne '') { $adminArgs += @('--email', $AdminEmail) }

        # Аль хэдийн байвал алгасна (нууц үгийг дахин үүсгэхгүй)
        $adminOutput = & pnpm --filter '@shalgalt/api' admin:create -- @adminArgs 2>&1
        $adminText = ($adminOutput | Out-String)

        if ($adminText -match 'аль хэдийн байна') {
            Write-Ok "'$AdminUsername' админ данс аль хэдийн байна — алгасав"
            Write-Warn2 'Нууц үгийг нь сэргээх бол:'
            Write-Warn2 "  pnpm --filter @shalgalt/api admin:create -- --username $AdminUsername --reset"
        }
        else {
            # Түр нууц үгийг тод харуулна
            Write-Host $adminText
            $script:AdminCreated = $true
        }
    }

    # -----------------------------------------------------------------------
    # 4. Build (VITE_PUBLIC_APP_URL нь build үед шингэдэг тул .env-ийн ДАРАА)
    # -----------------------------------------------------------------------
    Write-Step "Build хийх (QR код $BaseUrl хаягийг заана)"
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw 'build амжилтгүй' }
    Write-Ok 'Build бэлэн'
}
finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# 5. Firewall
# ---------------------------------------------------------------------------
Write-Step 'Windows Firewall'

if ($isAdmin) {
    $ruleName = "Shalgalt Platform (TCP $Port)"
    Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP `
        -LocalPort $Port -Action Allow -Profile Private,Domain | Out-Null
    Write-Ok "Дүрэм нэмэгдлээ: $ruleName (Private + Domain профайл)"
    Write-Warn2 'Public профайлд зориуд НЭЭГЭЭГҮЙ — нээлттэй Wi-Fi дээр аюулгүй байхын тулд.'
} else {
    Write-Warn2 "Алгасав. Админ эрхээр дараахыг ажиллуулна уу:"
    Write-Warn2 "  New-NetFirewallRule -DisplayName 'Shalgalt Platform' -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private,Domain"
}

# ---------------------------------------------------------------------------
# 6. Windows Service (NSSM)
# ---------------------------------------------------------------------------
if ($SkipService) {
    Write-Step 'Windows Service — алгасав (-SkipService)'
}
elseif (-not $isAdmin) {
    Write-Step 'Windows Service — админ эрх шаардлагатай тул алгасав'
}
else {
    Write-Step 'Windows Service бүртгэх'

    $toolsDir = Join-Path $RepoRoot '.tools'
    $nssmExe = Join-Path $toolsDir 'nssm.exe'

    if (-not (Test-Path $nssmExe)) {
        Write-Host '    NSSM татаж байна…'
        New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
        $zip = Join-Path $env:TEMP 'nssm.zip'
        $extract = Join-Path $env:TEMP "nssm-extract-$(Get-Random)"
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile $zip -UseBasicParsing
            Expand-Archive -Path $zip -DestinationPath $extract -Force
            $arch = if ([Environment]::Is64BitOperatingSystem) { 'win64' } else { 'win32' }
            $found = Get-ChildItem -Path $extract -Recurse -Filter 'nssm.exe' |
                Where-Object { $_.FullName -match [regex]::Escape($arch) } |
                Select-Object -First 1
            if (-not $found) { throw 'NSSM архивт nssm.exe олдсонгүй' }
            Copy-Item $found.FullName $nssmExe -Force
            Write-Ok 'NSSM бэлэн'
        }
        catch {
            Write-Err2 "NSSM татаж чадсангүй: $_"
            Write-Warn2 'Гараар https://nssm.cc/download-оос татаж .tools\nssm.exe болгож хуулна уу,'
            Write-Warn2 'эсвэл DEPLOY.md дахь Task Scheduler хувилбарыг ашиглана уу.'
            exit 1
        }
        finally {
            Remove-Item $zip, $extract -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Warn2 "'$ServiceName' үйлчилгээ аль хэдийн байна — дахин үүсгэж байна"
        & $nssmExe stop $ServiceName 2>$null | Out-Null
        Start-Sleep -Seconds 2
        & $nssmExe remove $ServiceName confirm 2>$null | Out-Null
        Start-Sleep -Seconds 2
    }

    $logDir = Join-Path $RepoRoot 'logs'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null

    $entry = Join-Path $RepoRoot 'apps\api\dist\index.js'
    if (-not (Test-Path $entry)) { Write-Err2 "Build гаралт олдсонгүй: $entry"; exit 1 }

    & $nssmExe install $ServiceName $node.Source $entry            | Out-Null
    & $nssmExe set $ServiceName AppDirectory      $RepoRoot        | Out-Null
    & $nssmExe set $ServiceName DisplayName       'Шалгалтын платформ' | Out-Null
    & $nssmExe set $ServiceName Description       "Сурагчийн өмнөх/дараах үнэлгээний платформ — $BaseUrl" | Out-Null
    & $nssmExe set $ServiceName Start             SERVICE_AUTO_START | Out-Null
    & $nssmExe set $ServiceName AppStdout         (Join-Path $logDir 'service.log') | Out-Null
    & $nssmExe set $ServiceName AppStderr         (Join-Path $logDir 'service-error.log') | Out-Null
    & $nssmExe set $ServiceName AppRotateFiles    1                | Out-Null
    & $nssmExe set $ServiceName AppRotateBytes    10485760         | Out-Null
    # Унтарвал автоматаар дахин асаана (5 сек хүлээгээд)
    & $nssmExe set $ServiceName AppExit Default   Restart          | Out-Null
    & $nssmExe set $ServiceName AppRestartDelay   5000             | Out-Null
    # Сангууд (Express г.м.) production горимд ажиллахын тулд
    & $nssmExe set $ServiceName AppEnvironmentExtra "NODE_ENV=production" | Out-Null

    Start-Service -Name $ServiceName
    Start-Sleep -Seconds 6

    $svc = Get-Service -Name $ServiceName
    if ($svc.Status -eq 'Running') {
        Write-Ok "'$ServiceName' үйлчилгээ ажиллаж байна (компьютер асахад автоматаар эхэлнэ)"
    } else {
        Write-Err2 "Үйлчилгээ эхлээгүй байна: $($svc.Status)"
        Write-Warn2 "Лог: $logDir\service-error.log"
    }
}

# ---------------------------------------------------------------------------
# 7. Шалгах
# ---------------------------------------------------------------------------
Write-Step 'Ажиллагааг шалгах'

$ok = $false
for ($attempt = 1; $attempt -le 10; $attempt++) {
    try {
        $health = Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 4
        Write-Ok "API: $($health.status) · сан: $($health.database) · $($health.provider)"
        $page = Invoke-WebRequest "http://localhost:$Port/" -TimeoutSec 6 -UseBasicParsing
        Write-Ok "Вэб: HTTP $($page.StatusCode)"
        $ok = $true
        break
    }
    catch {
        Start-Sleep -Seconds 2
    }
}

if (-not $ok) {
    Write-Err2 'Сервер хариу өгөхгүй байна.'
    Write-Warn2 "Лог шалгана уу: $RepoRoot\logs\service-error.log"
    if ($SkipService -or -not $isAdmin) {
        Write-Warn2 'Үйлчилгээ бүртгээгүй бол гараар асаана: pnpm --filter @shalgalt/api start'
    }
    exit 1
}

# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '===========================================================' -ForegroundColor Green
Write-Host '  БЭЛЭН БОЛЛОО' -ForegroundColor Green
Write-Host '===========================================================' -ForegroundColor Green
Write-Host ''
Write-Host "  Хаяг            : $BaseUrl"
Write-Host "  Эрүүл мэнд      : $BaseUrl/api/health"
Write-Host ''
Write-Host '  ── ДАРААГИЙН АЛХАМ ──────────────────────'
Write-Host "  1. $BaseUrl/login хаягаар админаар нэвтэрнэ"
Write-Host '     (дээр хэвлэгдсэн түр нууц үгийг ашиглана)'
Write-Host '  2. Нууц үгээ солино'
Write-Host "  3. $BaseUrl/admin/users → багш бүрд данс нээж өгнө"
Write-Host '  4. Багш бүрд нэвтрэх нэр + түр нууц үгийг дамжуулна'
Write-Host ''
Write-Host '  Сурагчид данс шаардахгүй — QR кодоор шууд орно.'
Write-Host ''
Write-Host '  Удирдах командууд:'
Write-Host "    Get-Service $ServiceName          # төлөв харах"
Write-Host "    Restart-Service $ServiceName      # дахин асаах"
Write-Host "    Stop-Service $ServiceName         # зогсоох"
Write-Host "    Get-Content logs\service.log -Tail 50 -Wait"
Write-Host ''
Write-Host '  Өдөр бүр нөөцлөх (Task Scheduler-т нэмнэ):'
Write-Host "    .\scripts\backup.ps1"
Write-Host ''
Write-Host '  Админы нууц үг мартвал:'
Write-Host "    pnpm --filter @shalgalt/api admin:create -- --username $AdminUsername --reset"
Write-Host ''
