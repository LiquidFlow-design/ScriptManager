#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Invoke-UpdateManager.ps1
    Prueft und installiert Windows-, Treiber- und Anwendungsupdates.
    Jede Kategorie wird einzeln angezeigt und nur nach Bestaetigung installiert.

.NOTES
    Speicherort: C:\Scripte\Invoke-UpdateManager.ps1
    Aufruf:      Als Administrator - direkt ODER ueber den Script Manager
    Logdatei:    C:\Scripte\Logs\UpdateManager_DATUM.log
#>

# ================================================================
#  KONFIGURATION
# ================================================================
$LogDir  = "C:\Scripte\Logs"
$LogFile = Join-Path $LogDir ("UpdateManager_" + (Get-Date -Format "yyyy-MM-dd_HH-mm") + ".log")
$Line    = "-" * 60

# ================================================================
#  LOG-ORDNER
# ================================================================
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# ================================================================
#  HILFSFUNKTIONEN
# ================================================================
function Write-Log {
    param([string]$Msg, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "[$ts] [$Level] $Msg" -Encoding UTF8
}

function Write-Head {
    param([string]$Title)
    Write-Host ""
    Write-Host $Line -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host $Line -ForegroundColor Cyan
    Write-Log "=== $Title ==="
}

function Write-Ok   { param([string]$M) Write-Host "  [OK]   $M" -ForegroundColor Green;  Write-Log $M }
function Write-Warn { param([string]$M) Write-Host "  [WARN] $M" -ForegroundColor Yellow; Write-Log $M "WARN" }
function Write-Err  { param([string]$M) Write-Host "  [ERR]  $M" -ForegroundColor Red;    Write-Log $M "ERROR" }
function Write-Info { param([string]$M) Write-Host "  $M"        -ForegroundColor Gray;   Write-Log $M }

function Ask-User {
    param([string]$Question)
    Write-Host ""
    Write-Host "  >> $Question [J/N]: " -ForegroundColor Magenta -NoNewline
    $a = Read-Host
    return ($a -match '^[JjYy]$')
}

function Show-WuTable {
    param([array]$Updates)
    if (-not $Updates -or $Updates.Count -eq 0) { return }
    Write-Host ""
    Write-Host "  Nr.  Name                                                    Groesse" -ForegroundColor DarkCyan
    Write-Host "  ---  ------------------------------------------------------  --------" -ForegroundColor DarkGray
    $i = 1
    foreach ($u in $Updates) {
        $name = $u.Title
        if ($name.Length -gt 54) { $name = $name.Substring(0, 51) + "..." }
        $size = if ($u.MaxDownloadSize -gt 0) {
            [string][math]::Round($u.MaxDownloadSize / 1MB, 1) + " MB"
        } else { "-" }
        $nr   = $i.ToString().PadRight(4)
        $nm   = $name.PadRight(54)
        Write-Host "  $nr $nm $size" -ForegroundColor White
        $i++
    }
    Write-Host ""
}

function Show-AppTable {
    param([array]$Pkgs)
    if (-not $Pkgs -or $Pkgs.Count -eq 0) { return }
    Write-Host ""
    Write-Host "  Nr.  Anwendung                           Aktuell        Verfuegbar" -ForegroundColor DarkCyan
    Write-Host "  ---  ----------------------------------  -------------  ----------" -ForegroundColor DarkGray
    $i = 1
    foreach ($p in $Pkgs) {
        $name = $p.Name
        if ($name.Length -gt 34) { $name = $name.Substring(0, 31) + "..." }
        $nr  = $i.ToString().PadRight(4)
        $nm  = $name.PadRight(34)
        $cur = $p.CurrentVersion.PadRight(14)
        Write-Host "  $nr $nm $cur $($p.AvailableVersion)" -ForegroundColor White
        $i++
    }
    Write-Host ""
}

# ================================================================
#  BANNER
# ================================================================
Clear-Host
Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "    UPDATE MANAGER  v1.1" -ForegroundColor Cyan
Write-Host "    Windows | Treiber | Anwendungen" -ForegroundColor DarkCyan
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "  Gestartet : $(Get-Date -Format 'dd.MM.yyyy HH:mm:ss')" -ForegroundColor Gray
Write-Host "  Computer  : $env:COMPUTERNAME" -ForegroundColor Gray
Write-Host "  Benutzer  : $env:USERNAME" -ForegroundColor Gray
Write-Host "  Logdatei  : $LogFile" -ForegroundColor Gray
Write-Host ""
Write-Log "UPDATE MANAGER GESTARTET"

# ================================================================
#  SCHRITT 1: VORAUSSETZUNGEN
# ================================================================
Write-Head "SCHRITT 1/4 - Voraussetzungen pruefen"

# PSWindowsUpdate
Write-Info "Pruefe PSWindowsUpdate..."
$wuModule = Get-Module -ListAvailable -Name PSWindowsUpdate
if (-not $wuModule) {
    Write-Warn "PSWindowsUpdate fehlt. Installiere..."
    try {
        Install-Module -Name PSWindowsUpdate -Force -Scope CurrentUser -ErrorAction Stop
        Write-Ok "PSWindowsUpdate installiert."
    } catch {
        Write-Err "Installation fehlgeschlagen: $_"
        Write-Warn "Bitte manuell: Install-Module PSWindowsUpdate -Force"
    }
} else {
    Write-Ok "PSWindowsUpdate vorhanden."
}
Import-Module PSWindowsUpdate -ErrorAction SilentlyContinue

# winget
Write-Info "Pruefe winget..."
$wingetOk = $false
try {
    $wgv = & winget --version 2>$null
    if ($LASTEXITCODE -eq 0 -or $wgv) {
        $wingetOk = $true
        Write-Ok "winget verfuegbar: $wgv"
    }
} catch {
    Write-Warn "winget nicht gefunden - Anwendungsupdates werden uebersprungen."
}

# ================================================================
#  SCHRITT 2: WINDOWS UPDATES PRUEFEN
# ================================================================
Write-Head "SCHRITT 2/4 - Windows Updates pruefen"
Write-Info "Suche laeuft (kann etwas dauern)..."

$winUpdates = @()
$winError   = $false

try {
    $modLoaded = Get-Module -Name PSWindowsUpdate -ErrorAction SilentlyContinue
    if ($modLoaded -or (Get-Module -ListAvailable -Name PSWindowsUpdate)) {
        $winUpdates = @(Get-WindowsUpdate -NotCategory "Drivers" -ErrorAction Stop |
                        Where-Object { $_.IsInstalled -eq $false })
    } else {
        # COM-API Fallback
        $sess   = New-Object -ComObject Microsoft.Update.Session
        $search = $sess.CreateUpdateSearcher()
        $result = $search.Search("IsInstalled=0 AND Type='Software' AND IsHidden=0")
        $winUpdates = @($result.Updates | ForEach-Object {
            [PSCustomObject]@{
                Title            = $_.Title
                MaxDownloadSize  = $_.MaxDownloadSize
                _com             = $_
            }
        })
    }
    Write-Log "Windows Updates gefunden: $($winUpdates.Count)"
} catch {
    Write-Err "Fehler beim Abrufen: $_"
    $winError = $true
}

if (-not $winError) {
    if ($winUpdates.Count -eq 0) {
        Write-Ok "Alle Windows Updates sind aktuell."
    } else {
        Write-Warn "$($winUpdates.Count) Update(s) verfuegbar:"
        Show-WuTable $winUpdates
    }
}

# ================================================================
#  SCHRITT 3: TREIBER UPDATES PRUEFEN
# ================================================================
Write-Head "SCHRITT 3/4 - Treiber Updates pruefen"
Write-Info "Suche laeuft..."

$drvUpdates = @()
$drvError   = $false

try {
    $modLoaded = Get-Module -Name PSWindowsUpdate -ErrorAction SilentlyContinue
    if ($modLoaded -or (Get-Module -ListAvailable -Name PSWindowsUpdate)) {
        $drvUpdates = @(Get-WindowsUpdate -Category "Drivers" -ErrorAction Stop |
                        Where-Object { $_.IsInstalled -eq $false })
    } else {
        $sess   = New-Object -ComObject Microsoft.Update.Session
        $search = $sess.CreateUpdateSearcher()
        $result = $search.Search("IsInstalled=0 AND Type='Driver' AND IsHidden=0")
        $drvUpdates = @($result.Updates | ForEach-Object {
            [PSCustomObject]@{
                Title           = $_.Title
                MaxDownloadSize = $_.MaxDownloadSize
                _com            = $_
            }
        })
    }
    Write-Log "Treiber-Updates gefunden: $($drvUpdates.Count)"
} catch {
    Write-Err "Fehler beim Abrufen: $_"
    $drvError = $true
}

if (-not $drvError) {
    if ($drvUpdates.Count -eq 0) {
        Write-Ok "Alle Treiber sind aktuell."
    } else {
        Write-Warn "$($drvUpdates.Count) Treiber-Update(s) verfuegbar:"
        Show-WuTable $drvUpdates
    }
}

# ================================================================
#  SCHRITT 4: ANWENDUNGSUPDATES (WINGET)
# ================================================================
Write-Head "SCHRITT 4/4 - Anwendungsupdates pruefen (winget)"

$appUpdates = @()

if ($wingetOk) {
    Write-Info "Suche via winget..."
    try {
        $raw   = & winget upgrade --include-unknown 2>&1
        $lines = $raw -split "`n"

        # Header-Zeile finden
        $hIdx = -1
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match "Name\s+Id\s+Version\s+Available") {
                $hIdx = $i
                break
            }
        }

        if ($hIdx -ge 0) {
            $hdr     = $lines[$hIdx]
            $nameEnd = $hdr.IndexOf("Id")
            $idEnd   = $hdr.IndexOf("Version")
            $verEnd  = $hdr.IndexOf("Available")
            $srcEnd  = $hdr.IndexOf("Source")
            if ($srcEnd -lt 0) { $srcEnd = $hdr.Length }

            for ($i = $hIdx + 2; $i -lt $lines.Count; $i++) {
                $l = $lines[$i]
                if ($l.Trim() -eq "") { continue }
                if ($l -match "^\d+ Upgrade") { continue }
                if ($l -match "^-+$") { continue }
                if ($l.Length -lt $verEnd) { continue }

                try {
                    $n = $l.Substring(0, [math]::Min($nameEnd, $l.Length)).Trim()
                    $d = $l.Substring($nameEnd, [math]::Min($idEnd - $nameEnd, $l.Length - $nameEnd)).Trim()
                    $v = $l.Substring($idEnd, [math]::Min($verEnd - $idEnd, $l.Length - $idEnd)).Trim()
                    $a = $l.Substring($verEnd, [math]::Min($srcEnd - $verEnd, $l.Length - $verEnd)).Trim()
                    if ($n -ne "" -and $a -ne "" -and $a -ne "Available") {
                        $appUpdates += [PSCustomObject]@{
                            Name             = $n
                            Id               = $d
                            CurrentVersion   = $v
                            AvailableVersion = $a
                        }
                    }
                } catch { continue }
            }
        }
        Write-Log "Anwendungsupdates gefunden: $($appUpdates.Count)"
    } catch {
        Write-Err "Fehler bei winget: $_"
    }

    if ($appUpdates.Count -eq 0) {
        Write-Ok "Alle Anwendungen sind aktuell."
    } else {
        Write-Warn "$($appUpdates.Count) Anwendungsupdate(s) verfuegbar:"
        Show-AppTable $appUpdates
    }
} else {
    Write-Info "winget nicht verfuegbar - uebersprungen."
}

# ================================================================
#  ZUSAMMENFASSUNG
# ================================================================
Write-Head "ZUSAMMENFASSUNG"

$total = $winUpdates.Count + $drvUpdates.Count + $appUpdates.Count

Write-Host ""
$wc = if ($winUpdates.Count -gt 0) { "Yellow" } else { "Green" }
$dc = if ($drvUpdates.Count -gt 0) { "Yellow" } else { "Green" }
$ac = if ($appUpdates.Count -gt 0) { "Yellow" } else { "Green" }
$tc = if ($total -gt 0) { "Cyan" } else { "Green" }

Write-Host "  Windows Updates     : $($winUpdates.Count)" -ForegroundColor $wc
Write-Host "  Treiber-Updates     : $($drvUpdates.Count)" -ForegroundColor $dc
Write-Host "  Anwendungsupdates   : $($appUpdates.Count)" -ForegroundColor $ac
Write-Host "  $Line" -ForegroundColor DarkGray
Write-Host "  Gesamt verfuegbar   : $total" -ForegroundColor $tc
Write-Host ""

Write-Log "ZUSAMMENFASSUNG - Windows:$($winUpdates.Count) Treiber:$($drvUpdates.Count) Apps:$($appUpdates.Count) Gesamt:$total"

if ($total -eq 0) {
    Write-Ok "System ist vollstaendig aktuell. Keine Aktion noetig."
    Write-Log "Keine Updates installiert."
    Write-Host ""
    Read-Host "  [ENTER] zum Beenden"
    exit 0
}

# ================================================================
#  INSTALLATION: WINDOWS UPDATES
# ================================================================
if ($winUpdates.Count -gt 0) {
    Write-Head "INSTALLATION - Windows Updates"
    Show-WuTable $winUpdates

    if (Ask-User "Windows Updates installieren? ($($winUpdates.Count) Updates)") {
        Write-Info "Installiere Windows Updates..."
        Write-Log "Benutzer bestaetigt: Windows Updates"
        try {
            $modLoaded = Get-Module -Name PSWindowsUpdate -ErrorAction SilentlyContinue
            if ($modLoaded -or (Get-Module -ListAvailable -Name PSWindowsUpdate)) {
                Install-WindowsUpdate -NotCategory "Drivers" -AcceptAll -AutoReboot:$false |
                    ForEach-Object { Write-Info $_.Title; Write-Log "Installiert: $($_.Title)" }
            } else {
                $sess  = New-Object -ComObject Microsoft.Update.Session
                $dldr  = $sess.CreateUpdateDownloader()
                $inst  = $sess.CreateUpdateInstaller()
                $coll  = New-Object -ComObject Microsoft.Update.UpdateColl
                foreach ($u in $winUpdates) { $coll.Add($u._com) | Out-Null }
                $dldr.Updates = $coll
                $dldr.Download() | Out-Null
                $inst.Updates = $coll
                $r = $inst.Install()
                Write-Log "ResultCode: $($r.ResultCode)"
            }
            Write-Ok "Windows Updates installiert."
        } catch {
            Write-Err "Fehler: $_"
        }
    } else {
        Write-Info "Windows Updates uebersprungen."
        Write-Log "Benutzer lehnte Windows Updates ab."
    }
}

# ================================================================
#  INSTALLATION: TREIBER UPDATES
# ================================================================
if ($drvUpdates.Count -gt 0) {
    Write-Head "INSTALLATION - Treiber Updates"
    Show-WuTable $drvUpdates

    Write-Warn "Tipp: Wiederherstellungspunkt vor Treiber-Installation empfohlen."

    if (Ask-User "Wiederherstellungspunkt erstellen?") {
        try {
            Enable-ComputerRestore -Drive "C:\" -ErrorAction SilentlyContinue
            Checkpoint-Computer -Description ("Vor Treiber-Updates " + (Get-Date -Format "dd.MM.yyyy")) `
                                -RestorePointType "MODIFY_SETTINGS" -ErrorAction Stop
            Write-Ok "Wiederherstellungspunkt erstellt."
            Write-Log "Wiederherstellungspunkt erstellt."
        } catch {
            Write-Warn "Wiederherstellungspunkt fehlgeschlagen: $_"
        }
    }

    if (Ask-User "Treiber-Updates installieren? ($($drvUpdates.Count) Updates)") {
        Write-Info "Installiere Treiber..."
        Write-Log "Benutzer bestaetigt: Treiber-Updates"
        try {
            $modLoaded = Get-Module -Name PSWindowsUpdate -ErrorAction SilentlyContinue
            if ($modLoaded -or (Get-Module -ListAvailable -Name PSWindowsUpdate)) {
                Install-WindowsUpdate -Category "Drivers" -AcceptAll -AutoReboot:$false |
                    ForEach-Object { Write-Info $_.Title; Write-Log "Treiber: $($_.Title)" }
            } else {
                $sess  = New-Object -ComObject Microsoft.Update.Session
                $dldr  = $sess.CreateUpdateDownloader()
                $inst  = $sess.CreateUpdateInstaller()
                $coll  = New-Object -ComObject Microsoft.Update.UpdateColl
                foreach ($u in $drvUpdates) { $coll.Add($u._com) | Out-Null }
                $dldr.Updates = $coll
                $dldr.Download() | Out-Null
                $inst.Updates = $coll
                $r = $inst.Install()
                Write-Log "Treiber ResultCode: $($r.ResultCode)"
            }
            Write-Ok "Treiber-Updates installiert."
        } catch {
            Write-Err "Fehler: $_"
        }
    } else {
        Write-Info "Treiber-Updates uebersprungen."
        Write-Log "Benutzer lehnte Treiber-Updates ab."
    }
}

# ================================================================
#  INSTALLATION: ANWENDUNGSUPDATES
# ================================================================
if ($appUpdates.Count -gt 0 -and $wingetOk) {
    Write-Head "INSTALLATION - Anwendungsupdates"
    Show-AppTable $appUpdates

    Write-Host "  Optionen:" -ForegroundColor DarkCyan
    Write-Host "  [A] Alle $($appUpdates.Count) Anwendungen auf einmal" -ForegroundColor White
    Write-Host "  [E] Einzeln auswaehlen" -ForegroundColor White
    Write-Host "  [N] Ueberspringen" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Auswahl [A/E/N]: " -ForegroundColor Magenta -NoNewline
    $choice = Read-Host

    if ($choice -match '^[Aa]$') {
        Write-Info "Aktualisiere alle Anwendungen..."
        Write-Log "Benutzer: Alle Apps aktualisieren"
        & winget upgrade --all --include-unknown --accept-source-agreements --accept-package-agreements
        Write-Ok "Alle Anwendungsupdates abgeschlossen."
        Write-Log "winget upgrade --all ausgefuehrt."

    } elseif ($choice -match '^[Ee]$') {
        Write-Log "Benutzer: Einzelne Apps auswaehlen"
        $idx = 1
        foreach ($pkg in $appUpdates) {
            Write-Host ""
            Write-Host "  [$idx/$($appUpdates.Count)] $($pkg.Name)  ($($pkg.CurrentVersion) -> $($pkg.AvailableVersion))" -ForegroundColor White
            if (Ask-User "Jetzt aktualisieren?") {
                try {
                    & winget upgrade --id $pkg.Id --accept-source-agreements --accept-package-agreements
                    Write-Ok "$($pkg.Name) aktualisiert."
                    Write-Log "Aktualisiert: $($pkg.Name) -> $($pkg.AvailableVersion)"
                } catch {
                    Write-Err "Fehler bei $($pkg.Name): $_"
                }
            } else {
                Write-Info "Uebersprungen: $($pkg.Name)"
                Write-Log "Uebersprungen: $($pkg.Name)"
            }
            $idx++
        }
    } else {
        Write-Info "Anwendungsupdates uebersprungen."
        Write-Log "Benutzer lehnte App-Updates ab."
    }
}

# ================================================================
#  ABSCHLUSS & NEUSTART-CHECK
# ================================================================
Write-Head "ABGESCHLOSSEN"
Write-Info "Beendet: $(Get-Date -Format 'dd.MM.yyyy HH:mm:ss')"
Write-Info "Logdatei: $LogFile"
Write-Log "UPDATE MANAGER BEENDET"

# Neustart-Erkennung
$reboot = $false
try {
    if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired") {
        $reboot = $true
    }
    $pfr = Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager" `
                            -Name "PendingFileRenameOperations" -ErrorAction SilentlyContinue
    if ($pfr) { $reboot = $true }
} catch {}

if ($reboot) {
    Write-Host ""
    Write-Host "  +--------------------------------------------+" -ForegroundColor Yellow
    Write-Host "  |  NEUSTART ERFORDERLICH                     |" -ForegroundColor Yellow
    Write-Host "  |  Updates werden nach Neustart wirksam.     |" -ForegroundColor Yellow
    Write-Host "  +--------------------------------------------+" -ForegroundColor Yellow
    Write-Log "Neustart erforderlich." "WARN"

    if (Ask-User "Computer jetzt neu starten?") {
        Write-Info "Neustart in 10 Sekunden..."
        Write-Log "Benutzer bestaetigt Neustart."
        Start-Sleep -Seconds 10
        Restart-Computer -Force
    } else {
        Write-Warn "Bitte manuell neu starten."
        Write-Log "Neustart abgelehnt."
    }
}

Write-Host ""
Read-Host "  [ENTER] zum Beenden"
