<#
.SYNOPSIS
    Gmail App Password-ыг `.env` файлд бичнэ (цонхтой оруулга).

.DESCRIPTION
    `setup-email.ps1` нь нууц үгийг КОНСОЛ дээр асуудаг. Windows-ийн хуучин
    консол цонх нь заримдаа хулганы баруун товчийн наалтыг (paste) хүлээж
    авдаггүй тул нууц үг дутуу орох тохиолдол гардаг.

    Энэ скрипт нь жижиг ЦОНХ гаргаж ирнэ. Тэр цонхонд Ctrl+V үргэлж ажиллана.

    `.env` доторх бусад SMTP тохиргоог ХӨНДӨХГҮЙ — зөвхөн SMTP_PASS-ыг солино.

.PARAMETER TestTo
    Тохируулсны дараа туршилтын захиа илгээх хаяг.

.PARAMETER SkipTest
    Туршилтын захиа илгээхгүй, зөвхөн хадгална.

.EXAMPLE
    .\scripts\set-smtp-password.ps1 -TestTo purevdoctor@gmail.com
#>

[CmdletBinding()]
param(
    [string]$TestTo = '',
    [switch]$SkipTest
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$EnvPath = Join-Path $RepoRoot '.env'

function Write-Step { param([string]$m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok   { param([string]$m) Write-Host "    OK  $m" -ForegroundColor Green }
function Write-Warn2{ param([string]$m) Write-Host "    !   $m" -ForegroundColor Yellow }
function Write-Err2 { param([string]$m) Write-Host "    X   $m" -ForegroundColor Red }

if (-not (Test-Path $EnvPath)) { Write-Err2 '.env олдсонгүй.'; exit 1 }

# ---------------------------------------------------------------------------
# 1. Цонхтой нууц үг асуух
# ---------------------------------------------------------------------------
Write-Step 'Нууц үг оруулах цонх нээгдэж байна'
Write-Host '    (Дэлгэц дээр цонх гарахгүй бол бусад цонхнуудын АРД байж магадгүй —' -ForegroundColor DarkGray
Write-Host '     Alt+Tab дарж хайна уу.)' -ForegroundColor DarkGray

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object Windows.Forms.Form
$form.Text = 'Gmail App Password'
$form.Size = New-Object Drawing.Size(460, 230)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true

$label = New-Object Windows.Forms.Label
$label.Text = "Google-ээс авсан 16 тэмдэгтийг доор наана уу.`n`nCtrl+V дарж наана. Зайтай наасан ч болно."
$label.Location = New-Object Drawing.Point(18, 18)
$label.Size = New-Object Drawing.Size(410, 62)
$form.Controls.Add($label)

$box = New-Object Windows.Forms.TextBox
$box.Location = New-Object Drawing.Point(18, 88)
$box.Size = New-Object Drawing.Size(410, 28)
$box.UseSystemPasswordChar = $true
$box.Font = New-Object Drawing.Font('Consolas', 12)
$form.Controls.Add($box)

$show = New-Object Windows.Forms.CheckBox
$show.Text = 'Харуулах'
$show.Location = New-Object Drawing.Point(18, 122)
$show.Size = New-Object Drawing.Size(120, 24)
$show.Add_CheckedChanged({ $box.UseSystemPasswordChar = -not $show.Checked })
$form.Controls.Add($show)

$ok = New-Object Windows.Forms.Button
$ok.Text = 'Хадгалах'
$ok.Location = New-Object Drawing.Point(248, 152)
$ok.Size = New-Object Drawing.Size(86, 30)
$ok.DialogResult = [Windows.Forms.DialogResult]::OK
$form.Controls.Add($ok)
$form.AcceptButton = $ok

$cancel = New-Object Windows.Forms.Button
$cancel.Text = 'Болих'
$cancel.Location = New-Object Drawing.Point(342, 152)
$cancel.Size = New-Object Drawing.Size(86, 30)
$cancel.DialogResult = [Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancel)
$form.CancelButton = $cancel

$form.Add_Shown({ $form.Activate(); $box.Focus() })
$result = $form.ShowDialog()

$pass = $box.Text
$form.Dispose()

if ($result -ne [Windows.Forms.DialogResult]::OK) { Write-Err2 'Болилоо. Юу ч өөрчлөгдөөгүй.'; exit 1 }

# Google нууц үгийг 4 бүлгээр харуулдаг тул зайг нь авна
$pass = $pass -replace '\s', ''

if ($pass -eq '') { Write-Err2 'Хоосон байна — юу ч наагдаагүй бололтой.'; exit 1 }
if ($pass.Length -ne 16) {
    Write-Err2 "$($pass.Length) тэмдэгт оруулав. App Password нь ЯГ 16 тэмдэгт байх ёстой."
    Write-Warn2 'Ctrl+V-ээр наасан эсэхээ шалгаад дахин оролдоно уу.'
    exit 1
}
Write-Ok "$($pass.Length) тэмдэгт хүлээн авлаа"

# ---------------------------------------------------------------------------
# 2. `.env`-д бичих (зөвхөн SMTP_PASS)
# ---------------------------------------------------------------------------
Write-Step '.env шинэчлэх'

$backup = "$EnvPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $EnvPath $backup
Write-Ok "Нөөц: $(Split-Path $backup -Leaf)"

$text = [IO.File]::ReadAllText($EnvPath, [Text.UTF8Encoding]::new($false))
$value = "SMTP_PASS=`"$pass`""

if ($text -match '(?m)^SMTP_PASS=.*$') {
    $text = [Regex]::Replace($text, '(?m)^SMTP_PASS=.*$', $value)
} else {
    $text = $text.TrimEnd() + "`n$value`n"
}
[IO.File]::WriteAllText($EnvPath, $text, [Text.UTF8Encoding]::new($false))
Write-Ok "SMTP_PASS = $('•' * 8)"

# ---------------------------------------------------------------------------
# 3. Шалгах
# ---------------------------------------------------------------------------
if ($SkipTest) {
    Write-Warn2 'Шалгалтыг алгасав (-SkipTest).'
} else {
    Write-Step 'SMTP холболт шалгах'

    # `pnpm` нь PATH-д байхгүй байж болно (ялангуяа -NoProfile эсвэл админ цонхонд)
    $pnpm = (Get-Command pnpm -ErrorAction SilentlyContinue).Source
    if (-not $pnpm) {
        foreach ($c in @("$env:APPDATA\npm\pnpm.cmd", "$env:ProgramFiles\nodejs\pnpm.cmd")) {
            if (Test-Path $c) { $pnpm = $c; break }
        }
    }

    if (-not $pnpm) {
        Write-Warn2 'pnpm олдсонгүй — холболтыг шалгаж чадсангүй.'
        Write-Warn2 'Нууц үг хадгалагдсан. Гараар шалгах:  pnpm --filter @shalgalt/api email:check'
    } else {
        Push-Location $RepoRoot
        try {
            if ($TestTo) { & $pnpm --filter '@shalgalt/api' email:check -- $TestTo }
            else { & $pnpm --filter '@shalgalt/api' email:check }
        } finally { Pop-Location }
    }
}

# ---------------------------------------------------------------------------
# 4. Серверийг дахин асаах
# ---------------------------------------------------------------------------
Write-Step 'Серверийг дахин асаах'
Write-Host '    (.env-ыг сервер зөвхөн эхлэх үедээ уншдаг)' -ForegroundColor DarkGray

$svc = Get-Service ShalgaltPlatform -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Warn2 'ShalgaltPlatform үйлчилгээ бүртгэгдээгүй байна.'
} else {
    try {
        Restart-Service -Name ShalgaltPlatform -Force -ErrorAction Stop
        Start-Sleep -Seconds 4
        Write-Ok "Дахин асаалаа ($((Get-Service ShalgaltPlatform).Status))"
    } catch {
        Write-Warn2 'Дахин асааж чадсангүй — АДМИН эрх шаардлагатай.'
        Write-Warn2 'Админ эрхтэй PowerShell дээр:  Restart-Service ShalgaltPlatform'
    }
}

Write-Host ''
Write-Host '  Дууслаа.' -ForegroundColor Green
if ($TestTo -and -not $SkipTest) {
    Write-Host "  $TestTo шуудангаа шалгана уу (Spam хавтсыг ч хараарай)."
}
Write-Host ''
