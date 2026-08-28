<#
.SYNOPSIS
    Өгөгдлийн сан болон тайлангийн файлуудыг нөөцлөнө.

.DESCRIPTION
    SQLite бол сангийн файлыг (WAL/SHM хамт), PostgreSQL бол `pg_dump`-ыг ашиглана.
    Мөн `uploads/` доторх .docx тайлангуудыг ZIP болгож хадгална.
    Хуучин нөөцийг `-KeepDays` хоногийн дараа автоматаар устгана.

.PARAMETER Destination
    Нөөц хадгалах хавтас. Анхдагч: <repo>\backups
    Сүлжээний диск заавал зөвлөнө, ж: \\server\backup\shalgalt

.PARAMETER KeepDays
    Хэдэн хоногийн нөөц хадгалах. Анхдагч 30.

.EXAMPLE
    .\scripts\backup.ps1

.EXAMPLE
    .\scripts\backup.ps1 -Destination D:\Backup\shalgalt -KeepDays 90

.NOTES
    Өдөр бүр автоматаар ажиллуулах (админ PowerShell дээр нэг удаа):

      $action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
                   -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\Users\purev.b\burtgel-web\shalgalt-platform\scripts\backup.ps1"'
      $trigger = New-ScheduledTaskTrigger -Daily -At 23:30
      Register-ScheduledTask -TaskName 'Shalgalt нөөцлөлт' -Action $action -Trigger $trigger -RunLevel Highest
#>

[CmdletBinding()]
param(
    [string]$Destination = '',
    [int]$KeepDays = 30
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot

if ($Destination -eq '') { $Destination = Join-Path $RepoRoot 'backups' }
New-Item -ItemType Directory -Force -Path $Destination | Out-Null

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$target = Join-Path $Destination $stamp
New-Item -ItemType Directory -Force -Path $target | Out-Null

Write-Host "Нөөцлөлт: $target" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# .env-ээс тохиргоо унших
# ---------------------------------------------------------------------------
$envPath = Join-Path $RepoRoot '.env'
if (-not (Test-Path $envPath)) { Write-Error ".env олдсонгүй: $envPath"; exit 1 }

$settings = @{}
foreach ($line in Get-Content $envPath -Encoding utf8) {
    if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') {
        $settings[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
}

$provider = if ($settings.ContainsKey('DATABASE_PROVIDER')) { $settings['DATABASE_PROVIDER'] } else { 'sqlite' }
$dbUrl = if ($settings.ContainsKey('DATABASE_URL')) { $settings['DATABASE_URL'] } else { 'file:./prod.db' }

# ---------------------------------------------------------------------------
# Өгөгдлийн сан
# ---------------------------------------------------------------------------
if ($provider -eq 'sqlite') {
    # DATABASE_URL нь "file:./prod.db" — prisma хавтаснаас харьцангуй
    $relative = $dbUrl -replace '^file:', ''
    $dbFile = Join-Path (Join-Path $RepoRoot 'apps\api\prisma') $relative
    $dbFile = [IO.Path]::GetFullPath($dbFile)

    if (-not (Test-Path $dbFile)) {
        Write-Warning "SQLite файл олдсонгүй: $dbFile"
    }
    else {
        # WAL горимд -wal / -shm файлууд бас хэрэгтэй
        foreach ($suffix in @('', '-wal', '-shm', '-journal')) {
            $source = "$dbFile$suffix"
            if (Test-Path $source) {
                Copy-Item $source (Join-Path $target (Split-Path -Leaf $source)) -Force
            }
        }
        $size = [math]::Round((Get-Item $dbFile).Length / 1MB, 2)
        Write-Host "  OK  Өгөгдлийн сан хуулагдлаа ($size MB)" -ForegroundColor Green
    }
}
else {
    $pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
    if (-not $pgDump) {
        Write-Warning 'pg_dump олдсонгүй. PostgreSQL client tools суулгана уу.'
    }
    else {
        $dumpFile = Join-Path $target 'database.dump'
        & $pgDump.Source --dbname=$dbUrl --format=custom --file=$dumpFile
        if ($LASTEXITCODE -eq 0) {
            $size = [math]::Round((Get-Item $dumpFile).Length / 1MB, 2)
            Write-Host "  OK  pg_dump амжилттай ($size MB)" -ForegroundColor Green
        } else {
            Write-Warning "pg_dump алдаа (exit $LASTEXITCODE)"
        }
    }
}

# ---------------------------------------------------------------------------
# Тайлангийн файлууд
# ---------------------------------------------------------------------------
$uploadsDir = Join-Path $RepoRoot 'apps\api\uploads'
if ((Test-Path $uploadsDir) -and (Get-ChildItem $uploadsDir -File -ErrorAction SilentlyContinue)) {
    $zip = Join-Path $target 'uploads.zip'
    Compress-Archive -Path (Join-Path $uploadsDir '*') -DestinationPath $zip -Force
    $size = [math]::Round((Get-Item $zip).Length / 1MB, 2)
    Write-Host "  OK  Тайлангууд архивлагдлаа ($size MB)" -ForegroundColor Green
}

# .env-ыг мөн нөөцөлнө (нууц үг агуулдаг тул нөөц хавтас хамгаалагдсан байх ёстой)
Copy-Item $envPath (Join-Path $target 'env.backup') -Force

# ---------------------------------------------------------------------------
# Хуучин нөөц устгах
# ---------------------------------------------------------------------------
$cutoff = (Get-Date).AddDays(-$KeepDays)
$removed = 0
Get-ChildItem $Destination -Directory | Where-Object { $_.CreationTime -lt $cutoff } | ForEach-Object {
    Remove-Item $_.FullName -Recurse -Force
    $removed++
}
if ($removed -gt 0) { Write-Host "  OK  $removed хуучин нөөц устгагдлаа (>$KeepDays хоног)" -ForegroundColor Green }

$total = [math]::Round((Get-ChildItem $target -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
Write-Host "`nДууслаа. Нийт $total MB → $target" -ForegroundColor Green
