<#
.SYNOPSIS
    Имэйл илгээх (SMTP) тохиргоог `.env` файлд бичнэ.

.DESCRIPTION
    Нууц үгийг далдалж асуух тул дэлгэц дээр харагдахгүй.
    Тохиргоог бичсэний дараа холболтыг шалгаж, хүсвэл туршилтын захиа илгээнэ.

.PARAMETER Provider
    gmail | outlook | custom.  Анхдагч: gmail

.PARAMETER Email
    Илгээгчийн имэйл хаяг (нэвтрэх нэр). Хоосон бол асууна.

.PARAMETER FromName
    Захиан дээр харагдах нэр. Ж: "12-р сургууль"

.PARAMETER TestTo
    Тохируулсны дараа туршилтын захиа илгээх хаяг.

.EXAMPLE
    .\scripts\setup-email.ps1
    # Бүх зүйлийг асууна

.EXAMPLE
    .\scripts\setup-email.ps1 -Email bagsh@gmail.com -FromName "12-р сургууль" -TestTo shalgagch@gmail.com

.NOTES
    ⚠ Gmail: энгийн нууц үг АЖИЛЛАХГҮЙ. "App Password" хэрэгтэй:
      1. https://myaccount.google.com/security
      2. "2-Step Verification"-ыг АСААНА (заавал)
      3. https://myaccount.google.com/apppasswords
      4. Апп нэр бичээд үүсгэнэ → 16 тэмдэгт код гарна (ж: abcd efgh ijkl mnop)
#>

[CmdletBinding()]
param(
    [ValidateSet('gmail', 'outlook', 'custom')]
    [string]$Provider = 'gmail',
    [string]$Email = '',
    [string]$FromName = '',
    [string]$SmtpHost = '',
    [int]$SmtpPort = 0,
    [string]$TestTo = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$EnvPath = Join-Path $RepoRoot '.env'

function Write-Step { param([string]$m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok   { param([string]$m) Write-Host "    OK  $m" -ForegroundColor Green }
function Write-Warn2{ param([string]$m) Write-Host "    !   $m" -ForegroundColor Yellow }
function Write-Err2 { param([string]$m) Write-Host "    X   $m" -ForegroundColor Red }

# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '===========================================================' -ForegroundColor Cyan
Write-Host '  ИМЭЙЛИЙН ТОХИРГОО' -ForegroundColor Cyan
Write-Host '===========================================================' -ForegroundColor Cyan

if (-not (Test-Path $EnvPath)) {
    Write-Err2 ".env олдсонгүй: $EnvPath"
    Write-Warn2 'Эхлээд `.\scripts\setup-server.ps1` ажиллуулна уу.'
    exit 1
}

# ---------------------------------------------------------------------------
# 1. Үйлчилгээ үзүүлэгчийн тохиргоо
# ---------------------------------------------------------------------------
switch ($Provider) {
    'gmail' {
        if ($SmtpHost -eq '') { $SmtpHost = 'smtp.gmail.com' }
        if ($SmtpPort -eq 0)  { $SmtpPort = 465 }
        Write-Host ''
        Write-Host '  Gmail ашиглах бол ЗААВАЛ "App Password" хэрэгтэй:' -ForegroundColor Yellow
        Write-Host '    1. https://myaccount.google.com/security'
        Write-Host '    2. "2-Step Verification"-ыг АСААНА'
        Write-Host '    3. https://myaccount.google.com/apppasswords'
        Write-Host '    4. Шинэ App password үүсгэнэ → 16 тэмдэгт код гарна'
        Write-Host ''
        Write-Host '  (Энгийн Gmail нууц үг АЖИЛЛАХГҮЙ.)' -ForegroundColor Yellow
        Write-Host ''
    }
    'outlook' {
        if ($SmtpHost -eq '') { $SmtpHost = 'smtp.office365.com' }
        if ($SmtpPort -eq 0)  { $SmtpPort = 587 }
    }
    'custom' {
        if ($SmtpHost -eq '') { $SmtpHost = Read-Host '  SMTP серверийн хаяг (ж: mail.school.edu.mn)' }
        if ($SmtpPort -eq 0)  { $SmtpPort = [int](Read-Host '  Порт (465 = SSL, 587 = STARTTLS)') }
    }
}

# ---------------------------------------------------------------------------
# 2. Нэвтрэх мэдээлэл
# ---------------------------------------------------------------------------
if ($Email -eq '') { $Email = (Read-Host '  Илгээгчийн имэйл хаяг').Trim() }
if ($Email -eq '') { Write-Err2 'Имэйл хаяг шаардлагатай.'; exit 1 }
if ($Email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { Write-Err2 "«$Email» буруу форматтай байна."; exit 1 }

$secure = Read-Host '  Нууц үг (App Password) — бичихэд харагдахгүй' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $plainPass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

# Google App Password-ыг 4 бүлгээр харуулдаг тул зайг нь авна
$plainPass = $plainPass -replace '\s', ''
if ($plainPass -eq '') { Write-Err2 'Нууц үг хоосон байна.'; exit 1 }

if ($Provider -eq 'gmail' -and $plainPass.Length -ne 16) {
    Write-Warn2 "App Password ихэвчлэн 16 тэмдэгт байдаг (та $($plainPass.Length) тэмдэгт оруулав)."
    Write-Warn2 'Энгийн нууц үг оруулсан бол Gmail татгалзана.'
}

if ($FromName -eq '') {
    $FromName = (Read-Host '  Захиан дээр харагдах нэр (Enter = "Шалгалтын платформ")').Trim()
    if ($FromName -eq '') { $FromName = 'Шалгалтын платформ' }
}

$smtpSecure = if ($SmtpPort -eq 465) { 'true' } else { 'false' }

# ---------------------------------------------------------------------------
# 3. .env шинэчлэх
# ---------------------------------------------------------------------------
Write-Step '.env шинэчлэх'

$backup = "$EnvPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $EnvPath $backup
Write-Ok "Нөөц: $(Split-Path -Leaf $backup)"

$text = [IO.File]::ReadAllText($EnvPath, [Text.UTF8Encoding]::new($false))

# Утга дотор # тэмдэг байвал тайлбар гэж уншигдахгүйн тулд хашилтад хийнэ
$settings = [ordered]@{
    SMTP_HOST   = $SmtpHost
    SMTP_PORT   = "$SmtpPort"
    SMTP_SECURE = $smtpSecure
    SMTP_USER   = $Email
    SMTP_PASS   = "`"$plainPass`""
    SMTP_FROM   = "`"$FromName <$Email>`""
}

foreach ($key in $settings.Keys) {
    $value = $settings[$key]
    $pattern = "(?m)^$key=.*$"
    if ($text -match $pattern) {
        $text = [Regex]::Replace($text, $pattern, "$key=$value")
    } else {
        $text = $text.TrimEnd() + "`n$key=$value`n"
    }
}

[IO.File]::WriteAllText($EnvPath, $text, [Text.UTF8Encoding]::new($false))

Write-Ok "SMTP_HOST   = $SmtpHost"
Write-Ok "SMTP_PORT   = $SmtpPort (secure=$smtpSecure)"
Write-Ok "SMTP_USER   = $Email"
Write-Ok "SMTP_PASS   = $('•' * 8)"
Write-Ok "SMTP_FROM   = $FromName <$Email>"

# ---------------------------------------------------------------------------
# 4. Холболт шалгах
# ---------------------------------------------------------------------------
Write-Step 'Холболт шалгах'

$env:Path = "$env:APPDATA\npm;$env:Path"
Push-Location $RepoRoot
try {
    if ($TestTo -ne '') {
        & pnpm --filter '@shalgalt/api' email:check -- $TestTo
    } else {
        & pnpm --filter '@shalgalt/api' email:check
    }
    $checkOk = $LASTEXITCODE -eq 0
}
finally {
    Pop-Location
}

Write-Host ''
if ($checkOk) {
    Write-Host '===========================================================' -ForegroundColor Green
    Write-Host '  ТОХИРГОО АМЖИЛТТАЙ' -ForegroundColor Green
    Write-Host '===========================================================' -ForegroundColor Green
    Write-Host ''
    Write-Host '  ⚠ Сервер ажиллаж байгаа бол ДАХИН АСААНА УУ:' -ForegroundColor Yellow
    Write-Host '      Restart-Service ShalgaltPlatform      # үйлчилгээ болгосон бол'
    Write-Host '      (эсвэл `pnpm dev`-ээ зогсоогоод дахин асаана)'
    Write-Host ''
} else {
    Write-Host '===========================================================' -ForegroundColor Red
    Write-Host '  ТОХИРГОО АЖИЛЛАХГҮЙ БАЙНА' -ForegroundColor Red
    Write-Host '===========================================================' -ForegroundColor Red
    Write-Host ''
    Write-Host '  Түгээмэл шалтгаан:' -ForegroundColor Yellow
    Write-Host '    • Gmail дээр энгийн нууц үг оруулсан → App Password хэрэгтэй'
    Write-Host '    • 2-Step Verification асаагаагүй → App Password үүсэхгүй'
    Write-Host '    • Порт 465 бол SMTP_SECURE=true, 587 бол false байх ёстой'
    Write-Host '    • Галт хана эсвэл байгууллагын сүлжээ 465/587 портыг хаасан'
    Write-Host ''
    Write-Host "  Хуучин тохиргоог сэргээх: Copy-Item `"$backup`" `"$EnvPath`" -Force"
    Write-Host ''
}
