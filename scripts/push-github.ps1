<#
.SYNOPSIS
    Кодыг GitHub дээр байршуулна (repo үүсгэх + push).

.DESCRIPTION
    Зөөврийн GitHub CLI (`.tools\gh.exe`) ашиглана — админ эрх шаардахгүй.

    Алхмууд:
      1. GitHub-д нэвтрэх (браузер нээгдэнэ) — нэг л удаа
      2. Repo байхгүй бол үүсгэнэ (анхдагчаар ХУВИЙН)
      3. Нууц файл ороогүйг шалгана
      4. push хийнэ

.PARAMETER RepoName
    Repo-гийн нэр. Анхдагч: shalgalt-platform

.PARAMETER Public
    Нийтэд нээлттэй repo үүсгэнэ. Анхдагчаар ХУВИЙН (private).

.EXAMPLE
    .\scripts\push-github.ps1

.EXAMPLE
    .\scripts\push-github.ps1 -RepoName shalgalt -Public
#>

[CmdletBinding()]
param(
    [string]$RepoName = 'shalgalt-platform',
    [switch]$Public
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Write-Step { param([string]$m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok   { param([string]$m) Write-Host "    OK  $m" -ForegroundColor Green }
function Write-Warn2{ param([string]$m) Write-Host "    !   $m" -ForegroundColor Yellow }
function Write-Err2 { param([string]$m) Write-Host "    X   $m" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# 0. gh бэлэн эсэх
# ---------------------------------------------------------------------------
$gh = Join-Path $RepoRoot '.tools\gh.exe'
if (-not (Test-Path $gh)) {
    Write-Step 'GitHub CLI татаж байна (админ эрх шаардахгүй)'
    New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot '.tools') | Out-Null
    $zip = Join-Path $env:TEMP 'gh.zip'
    $ext = Join-Path $env:TEMP "gh-extract-$(Get-Random)"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        # ASSUMPTION: хувилбарыг тогтмол бэхэлсэн — `latest/download` нь файлын
        # нэрэнд хувилбар агуулдаг тул шинэ хувилбар гарахад 404 өгдөг.
        Invoke-WebRequest -Uri 'https://github.com/cli/cli/releases/download/v2.98.0/gh_2.98.0_windows_amd64.zip' `
            -OutFile $zip -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath $ext -Force
        $exe = Get-ChildItem $ext -Recurse -Filter 'gh.exe' | Select-Object -First 1
        Copy-Item $exe.FullName $gh -Force
        Write-Ok 'GitHub CLI бэлэн'
    }
    catch {
        Write-Err2 "Татаж чадсангүй: $($_.Exception.Message)"
        Write-Warn2 'https://cli.github.com-оос гараар татаж .tools\gh.exe болгоно уу.'
        exit 1
    }
    finally { Remove-Item $zip, $ext -Recurse -Force -ErrorAction SilentlyContinue }
}

# ---------------------------------------------------------------------------
# 1. Нэвтрэх
# ---------------------------------------------------------------------------
Write-Step 'GitHub нэвтрэлт'

& $gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Warn2 'Нэвтрээгүй байна. Одоо нэвтэрнэ — браузер нээгдэнэ.'
    Write-Host ''
    Write-Host '  Асуултуудад дараах байдлаар хариулна:' -ForegroundColor Yellow
    Write-Host '    What account do you want to log into?  → GitHub.com'
    Write-Host '    What is your preferred protocol?       → HTTPS'
    Write-Host '    Authenticate Git with your credentials?→ Yes'
    Write-Host '    How would you like to authenticate?    → Login with a web browser'
    Write-Host ''
    Write-Host '  Дэлгэц дээр гарах 8 тэмдэгтийн кодыг хуулж, браузерт оруулна.' -ForegroundColor Yellow
    Write-Host ''

    & $gh auth login
    if ($LASTEXITCODE -ne 0) { Write-Err2 'Нэвтрэлт амжилтгүй.'; exit 1 }
}

$account = (& $gh api user --jq '.login' 2>$null)
if (-not $account) { Write-Err2 'GitHub хэрэглэгчийг тодорхойлж чадсангүй.'; exit 1 }
Write-Ok "Нэвтэрсэн: $account"

# ---------------------------------------------------------------------------
# 2. Аюулгүй байдлын шалгалт — нууц файл push хийхээс сэргийлнэ
# ---------------------------------------------------------------------------
Write-Step 'Нууц файл шалгах'

git add -A 2>&1 | Out-Null
$tracked = git ls-files
$risky = $tracked | Where-Object {
    $_ -match '(^|/)\.env$' -or $_ -match '\.env\.backup' -or $_ -match '\.db$' -or
    $_ -match '^logs/' -or $_ -match '^backups/' -or $_ -match 'nssm\.exe' -or $_ -match '^\.tools/'
}

if ($risky) {
    Write-Err2 'Нууц эсвэл хэрэггүй файл git-д орсон байна:'
    $risky | ForEach-Object { Write-Host "      $_" -ForegroundColor Red }
    Write-Warn2 'Push зогсоов. `.gitignore`-оо шалгаад дараахыг ажиллуулна уу:'
    Write-Warn2 '  git rm --cached <файл>'
    exit 1
}
Write-Ok "$($tracked.Count) файл — нууц зүйл ороогүй"

# ---------------------------------------------------------------------------
# 3. Commit хийгээгүй өөрчлөлт байвал commit
# ---------------------------------------------------------------------------
if (git status --porcelain) {
    Write-Step 'Өөрчлөлтийг commit хийх'
    git commit -q -m "Шинэчлэлт $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    Write-Ok 'Commit хийгдлээ'
}

# ---------------------------------------------------------------------------
# 4. Repo үүсгэх / remote холбох
# ---------------------------------------------------------------------------
Write-Step "Repo: $account/$RepoName"

$exists = $false
& $gh repo view "$account/$RepoName" 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { $exists = $true }

if ($exists) {
    Write-Ok 'Repo аль хэдийн байна'
} else {
    $visibility = if ($Public) { '--public' } else { '--private' }
    & $gh repo create "$RepoName" $visibility --source=. --remote=origin --description "Сурагчийн өмнөх/дараах үнэлгээний платформ"
    if ($LASTEXITCODE -ne 0) { Write-Err2 'Repo үүсгэж чадсангүй.'; exit 1 }
    Write-Ok "Repo үүслээ ($(if ($Public) { 'нийтийн' } else { 'хувийн' }))"
}

# remote тохируулах
$remoteUrl = "https://github.com/$account/$RepoName.git"
if (git remote 2>$null | Select-String -Pattern '^origin$' -Quiet) {
    git remote set-url origin $remoteUrl
} else {
    git remote add origin $remoteUrl
}
Write-Ok "remote: $remoteUrl"

# ---------------------------------------------------------------------------
# 5. Push
# ---------------------------------------------------------------------------
Write-Step 'Push хийх'

$branch = git branch --show-current
git push -u origin $branch
if ($LASTEXITCODE -ne 0) {
    Write-Err2 'Push амжилтгүй.'
    Write-Warn2 "Repo дээр аль хэдийн өөр агуулга байвал:  git push -u origin $branch --force"
    exit 1
}

Write-Host ''
Write-Host '===========================================================' -ForegroundColor Green
Write-Host '  GITHUB ДЭЭР БАЙРШЛАА' -ForegroundColor Green
Write-Host '===========================================================' -ForegroundColor Green
Write-Host ''
Write-Host "  Repo : https://github.com/$account/$RepoName"
Write-Host "  Салбар: $branch"
Write-Host ''
Write-Host '  Цаашид өөрчлөлт оруулахдаа:'
Write-Host '    git add -A'
Write-Host '    git commit -m "тайлбар"'
Write-Host '    git push'
Write-Host ''
Write-Host '  Үүлэнд deploy хийх бол: CLOUD-DEPLOY.md §3 (Render)'
Write-Host ''
