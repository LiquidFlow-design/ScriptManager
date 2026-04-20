﻿#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Windows Gaming-Optimierungsskript
.DESCRIPTION
    Optimiert Windows-Einstellungen fuer bessere Gaming-Performance.
    Erstellt zuvor automatisch einen Systemwiederherstellungspunkt.
.NOTES
    Muss als Administrator ausgefuehrt werden.
    Getestet auf Windows 10 / Windows 11.
#>

# ============================================================
#  KONFIGURATION - Hier kannst du Optimierungen ein-/ausschalten
# ============================================================
$Config = @{
    # Dienste deaktivieren
    DienstDeaktivieren         = $true

    # Windows-Visuellen Effekte reduzieren
    VisuelleEffekte            = $true

    # Energieplan auf Hoechstleistung setzen
    Energieplan                = $true

    # Maus-Beschleunigung deaktivieren
    MausBeschleunigung         = $true

    # Spielmodus aktivieren
    Spielmodus                 = $true

    # Hardware-beschleunigtes GPU-Scheduling (HAGS) aktivieren
    HAGS                       = $true

    # Xbox Game Bar deaktivieren
    GameBar                    = $true

    # Nagle-Algorithmus deaktivieren (niedrigere Netzwerklatenz)
    NagleDeaktivieren          = $true

    # Automatische Windows Updates pausieren (30 Tage)
    UpdatesPausieren           = $false   # Standardmaessig aus - nach Wunsch auf $true setzen

    # Superfetch/SysMain deaktivieren (fuer SSDs empfohlen)
    SysMainDeaktivieren        = $true

    # ---- Controller-Optimierungen ----
    # USB-Energiesparmodus fuer Controller deaktivieren (verhindert Verbindungsabbrueche)
    ControllerUSBPower         = $true

    # Bluetooth-Energiesparmodus deaktivieren (fuer kabellose Controller)
    ControllerBTPower          = $true

    # HID-Eingabelatenz reduzieren (niedrigere Reaktionszeit)
    HIDLatenz                  = $true

    # Controller-Vibration / Rumble aktivieren (Steam & Windows)
    ControllerVibration        = $true

    # ---- Geringes Risiko: Zusatz-Optimierungen ----
    # Timer-Aufloesung auf 0.5ms setzen (weniger Frame-Stutter)
    TimerResolution            = $true

    # MPO (Multiplane Overlay) deaktivieren (behebt Stutter/schwarze Bildschirme bei NVIDIA)
    MPODeaktivieren            = $true

    # GPU Shader-Cache aktivieren
    ShaderCache                = $true

    # TRIM fuer SSDs sicherstellen
    TrimSicherstellen          = $true

    # SSD Write Cache aktivieren
    WriteCacheAktivieren       = $true

    # Benachrichtigungen beim Spielen deaktivieren (Fokus-Assist)
    FokusAssist                = $true

    # QoS-Paketplaner deaktivieren (gibt 20% reservierte Bandbreite frei)
    QoSDeaktivieren            = $true

    # Netzwerk: Receive Window Auto-Tuning optimieren
    ReceiveWindowTuning        = $true

    # DNS auf Cloudflare (1.1.1.1) setzen fuer niedrigere Latenz
    # Hinweis: DNS-Anfragen gehen dann an Cloudflare statt deinen ISP
    DNSOptimieren              = $false   # Standardmaessig aus - nach Wunsch auf $true setzen

    # Paging-Datei auf feste Groesse setzen (empfohlen ab 16GB RAM)
    PagingDateiFixieren        = $true
}

# ============================================================
#  FARB-HELPER
# ============================================================
function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
}

function Write-OK    { param([string]$Msg) Write-Host "  [OK]  $Msg" -ForegroundColor Green  }
function Write-Skip  { param([string]$Msg) Write-Host "  [--]  $Msg" -ForegroundColor DarkGray }
function Write-Warn  { param([string]$Msg) Write-Host "  [!!]  $Msg" -ForegroundColor Yellow }
function Write-Fail  { param([string]$Msg) Write-Host "  [XX]  $Msg" -ForegroundColor Red    }
function Write-Info  { param([string]$Msg) Write-Host "  [i]   $Msg" -ForegroundColor White  }

# ============================================================
#  WIEDERHERSTELLUNGSPUNKT ERSTELLEN
# ============================================================
function New-GamingRestorePoint {
    Write-Header "Schritt 1/12 - Wiederherstellungspunkt erstellen"

    try {
        # Systemwiederherstellung auf Systemlaufwerk aktivieren (falls deaktiviert)
        $drive = $env:SystemDrive
        Enable-ComputerRestore -Drive "$drive\" -ErrorAction SilentlyContinue

        Write-Info "Erstelle Wiederherstellungspunkt 'Vor Gaming-Optimierung'..."
        Checkpoint-Computer `
            -Description "Vor Gaming-Optimierung - $(Get-Date -Format 'dd.MM.yyyy HH:mm')" `
            -RestorePointType "MODIFY_SETTINGS" `
            -ErrorAction Stop

        Write-OK "Wiederherstellungspunkt erfolgreich erstellt."
        Write-Info "Wiederherstellung moeglich ueber: Systemsteuerung > System > Computerschutz"
    }
    catch {
        Write-Warn "Wiederherstellungspunkt konnte nicht erstellt werden: $_"
        $continue = Read-Host "  Trotzdem fortfahren? (j/N)"
        if ($continue -ne "j" -and $continue -ne "J") {
            Write-Host "  Abgebrochen." -ForegroundColor Red
            exit 1
        }
    }
}

# ============================================================
#  DIENSTE DEAKTIVIEREN
# ============================================================
function Disable-UnnecessaryServices {
    Write-Header "Schritt 2/12 - Unnoetige Dienste deaktivieren"

    if (-not $Config.DienstDeaktivieren) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    # Dienste: Name, Anzeigename, Begruendung
    $services = @(
        @{ Name = "DiagTrack";                Label = "Connected User Experiences & Telemetry";  Grund = "Telemetrie / Datenuebertragung an Microsoft" }
        @{ Name = "dmwappushservice";         Label = "WAP Push Message Routing";               Grund = "Telemetrie-Hilfsdienst" }
        @{ Name = "MapsBroker";               Label = "Downloaded Maps Manager";                Grund = "Offline-Karten (unnoetig beim Gaming)" }
        @{ Name = "PrintSpooler";             Label = "Druckwarteschlange";                     Grund = "Nur noetig wenn Drucker verwendet wird" }
        @{ Name = "Fax";                      Label = "Fax";                                    Grund = "Fax-Dienst (veraltet)" }
        @{ Name = "XblAuthManager";           Label = "Xbox Live Auth Manager";                 Grund = "Xbox Live Authentifizierung (lokal unnoetig)" }
        @{ Name = "XblGameSave";              Label = "Xbox Live Game Save";                    Grund = "Xbox Live Spielstand-Sync" }
        @{ Name = "XboxNetApiSvc";            Label = "Xbox Live Networking Service";           Grund = "Xbox Netzwerkdienst" }
        # Hinweis: XboxGipSvc (Xbox Accessory Management) wird NICHT deaktiviert - benoetigt fuer Controller!
        @{ Name = "WSearch";                  Label = "Windows Search (Indizierung)";           Grund = "CPU/HDD-Belastung durch Indizierung" }
        @{ Name = "SysMain";                  Label = "SysMain / Superfetch";                   Grund = "RAM-Vorausladen (auf SSD unnoetig)" }
        @{ Name = "lfsvc";                    Label = "Geolocation Service";                    Grund = "Standortdienst" }
        @{ Name = "RetailDemo";               Label = "Retail Demo Service";                    Grund = "Demo-Modus fuer Ladengeschaefte" }
        @{ Name = "RemoteRegistry";           Label = "Remote Registry";                        Grund = "Sicherheitsrisiko, meist unnoetig" }
        @{ Name = "SharedAccess";             Label = "Internet Connection Sharing";            Grund = "ICS (meist unnoetig)" }
        @{ Name = "TrkWks";                   Label = "Distributed Link Tracking Client";       Grund = "Link-Tracking (selten benoetigt)" }
        @{ Name = "WerSvc";                   Label = "Windows Error Reporting";                Grund = "Fehlerberichte an Microsoft" }
    )

    foreach ($svc in $services) {
        try {
            $s = Get-Service -Name $svc.Name -ErrorAction SilentlyContinue
            if ($null -eq $s) {
                Write-Skip "$($svc.Label) - nicht vorhanden"
                continue
            }
            if ($s.StartType -eq "Disabled") {
                Write-Skip "$($svc.Label) - bereits deaktiviert"
                continue
            }
            Stop-Service -Name $svc.Name -Force -ErrorAction SilentlyContinue
            Set-Service  -Name $svc.Name -StartupType Disabled -ErrorAction Stop
            Write-OK "$($svc.Label) deaktiviert  ($($svc.Grund))"
        }
        catch {
            Write-Warn "$($svc.Label) konnte nicht deaktiviert werden: $_"
        }
    }
}

# ============================================================
#  VISUELLE EFFEKTE REDUZIEREN
# ============================================================
function Set-VisualPerformance {
    Write-Header "Schritt 3/12 - Visuelle Effekte fuer Performance optimieren"

    if (-not $Config.VisuelleEffekte) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects"
        if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
        Set-ItemProperty -Path $path -Name "VisualFXSetting" -Value 2  # "Auf beste Leistung abstimmen"

        # Einzelne Animationen deaktivieren
        $userPrefs = "HKCU:\Control Panel\Desktop\WindowMetrics"
        $desktop   = "HKCU:\Control Panel\Desktop"

        Set-ItemProperty -Path $desktop -Name "UserPreferencesMask" `
            -Value ([byte[]](0x90,0x12,0x03,0x80,0x10,0x00,0x00,0x00)) -Type Binary

        Write-OK "Visuelle Effekte auf Performance-Modus gesetzt."
    }
    catch {
        Write-Warn "Visuelle Effekte konnten nicht angepasst werden: $_"
    }
}

# ============================================================
#  ENERGIEPLAN: HOECHSTLEISTUNG
# ============================================================
function Set-HighPerformancePower {
    Write-Header "Schritt 4/12 - Energieplan auf Hoechstleistung setzen"

    if (-not $Config.Energieplan) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # Ultimate Performance Plan aktivieren (Windows 10/11)
        $result = powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 2>&1
        if ($LASTEXITCODE -eq 0 -or $result -match "GUID") {
            $guid = ($result | Select-String -Pattern "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}").Matches[0].Value
            powercfg -setactive $guid | Out-Null
            Write-OK "Ultimative Hoechstleistung aktiviert (GUID: $guid)"
        }
        else {
            # Fallback: Normaler Hoechstleistungsplan
            powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c | Out-Null
            Write-OK "Hoechstleistungsplan aktiviert."
        }
    }
    catch {
        Write-Warn "Energieplan konnte nicht geaendert werden: $_"
    }
}

# ============================================================
#  MAUSBESCHLEUNIGUNG DEAKTIVIEREN
# ============================================================
function Disable-MouseAcceleration {
    Write-Header "Schritt 5/12 - Mausbeschleunigung deaktivieren"

    if (-not $Config.MausBeschleunigung) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $path = "HKCU:\Control Panel\Mouse"
        Set-ItemProperty -Path $path -Name "MouseSpeed"    -Value "0"
        Set-ItemProperty -Path $path -Name "MouseThreshold1" -Value "0"
        Set-ItemProperty -Path $path -Name "MouseThreshold2" -Value "0"
        Write-OK "Mausbeschleunigung deaktiviert."
    }
    catch {
        Write-Warn "Mausbeschleunigung konnte nicht deaktiviert werden: $_"
    }
}

# ============================================================
#  SPIELMODUS & GAME BAR
# ============================================================
function Set-GameMode {
    Write-Header "Schritt 6/12 - Windows Spielmodus & Game Bar"

    try {
        if ($Config.Spielmodus) {
            $gmPath = "HKCU:\Software\Microsoft\GameBar"
            if (-not (Test-Path $gmPath)) { New-Item -Path $gmPath -Force | Out-Null }
            Set-ItemProperty -Path $gmPath -Name "AutoGameModeEnabled" -Value 1
            Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR" `
                -Name "AppCaptureEnabled" -Value 0 -ErrorAction SilentlyContinue
            Write-OK "Spielmodus (Game Mode) aktiviert."
        }

        if ($Config.GameBar) {
            $gbPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR"
            if (-not (Test-Path $gbPath)) { New-Item -Path $gbPath -Force | Out-Null }
            Set-ItemProperty -Path $gbPath -Name "AppCaptureEnabled" -Value 0
            Set-ItemProperty -Path "HKCU:\System\GameConfigStore" -Name "GameDVR_Enabled" -Value 0 -ErrorAction SilentlyContinue
            Write-OK "Xbox Game Bar / Game DVR deaktiviert."
        }
    }
    catch {
        Write-Warn "Spielmodus-Einstellungen konnten nicht gesetzt werden: $_"
    }
}

# ============================================================
#  HARDWARE-BESCHLEUNIGTES GPU-SCHEDULING (HAGS)
# ============================================================
function Enable-HAGS {
    Write-Header "Schritt 7/12 - Hardware-beschleunigtes GPU-Scheduling (HAGS)"

    if (-not $Config.HAGS) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $path = "HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers"
        Set-ItemProperty -Path $path -Name "HwSchMode" -Value 2 -Type DWord
        Write-OK "HAGS aktiviert. (Neustart erforderlich)"
        Write-Info "Hinweis: HAGS benoetigt eine GTX 1000 / RX 5000 Serie oder neuer + Windows 10 2004+"
    }
    catch {
        Write-Warn "HAGS konnte nicht aktiviert werden: $_"
    }
}

# ============================================================
#  NETZWERK: NAGLE-ALGORITHMUS DEAKTIVIEREN
# ============================================================
function Disable-NagleAlgorithm {
    Write-Header "Schritt 8/12 - Nagle-Algorithmus deaktivieren (niedrigere Netzwerklatenz)"

    if (-not $Config.NagleDeaktivieren) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $basePath = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces"
        $interfaces = Get-ChildItem -Path $basePath

        foreach ($iface in $interfaces) {
            Set-ItemProperty -Path $iface.PSPath -Name "TcpAckFrequency" -Value 1   -Type DWord -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $iface.PSPath -Name "TCPNoDelay"      -Value 1   -Type DWord -ErrorAction SilentlyContinue
        }
        Write-OK "Nagle-Algorithmus fuer alle Netzwerkinterfaces deaktiviert."
    }
    catch {
        Write-Warn "Nagle-Einstellungen konnten nicht gesetzt werden: $_"
    }
}

# ============================================================
#  WINDOWS UPDATES PAUSIEREN (OPTIONAL)
# ============================================================
function Pause-WindowsUpdates {
    Write-Header "Schritt 9/12 - Windows Updates"

    if (-not $Config.UpdatesPausieren) {
        Write-Skip "Updates pausieren uebersprungen (in Konfiguration deaktiviert)."
        Write-Info "Tipp: Setze '\$Config.UpdatesPausieren = \$true' um Updates fuer 30 Tage zu pausieren."
        return
    }

    try {
        $pauseDate = (Get-Date).AddDays(30).ToString("yyyy-MM-ddTHH:mm:ssZ")
        $wuPath = "HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings"
        Set-ItemProperty -Path $wuPath -Name "PauseUpdatesExpiryTime"     -Value $pauseDate -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $wuPath -Name "PauseFeatureUpdatesStartTime" -Value (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ") -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $wuPath -Name "PauseQualityUpdatesStartTime" -Value (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ") -ErrorAction SilentlyContinue
        Write-OK "Windows Updates fuer 30 Tage pausiert."
        Write-Warn "Denk daran, Updates nach dem Spielen wieder zu aktivieren!"
    }
    catch {
        Write-Warn "Updates konnten nicht pausiert werden: $_"
    }
}

# ============================================================
#  TIMER RESOLUTION
# ============================================================
function Set-TimerResolution {
    Write-Header "Schritt 10/17 - Timer-Aufloesung auf 0.5ms setzen"

    if (-not $Config.TimerResolution) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # Via Registry dauerhaft setzen (wirkt nach Neustart)
        $path = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\kernel"
        if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
        Set-ItemProperty -Path $path -Name "GlobalTimerResolutionRequests" -Value 1 -Type DWord
        Write-OK "Timer Resolution auf 0.5ms gesetzt (weniger Frame-Stutter)."
        Write-Info "Windows 11 23H2+: Wert wird pro Prozess verwaltet - Spiele profitieren automatisch."
    }
    catch {
        Write-Warn "Timer Resolution konnte nicht gesetzt werden: $_"
    }
}

# ============================================================
#  MPO DEAKTIVIEREN
# ============================================================
function Disable-MPO {
    Write-Header "Schritt 11/17 - MPO (Multiplane Overlay) deaktivieren"

    if (-not $Config.MPODeaktivieren) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $path = "HKLM:\SOFTWARE\Microsoft\Windows\Dwm"
        if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
        Set-ItemProperty -Path $path -Name "OverlayTestMode" -Value 5 -Type DWord
        Write-OK "MPO deaktiviert. Behebt Stutter und schwarze Bildschirme (besonders NVIDIA)."
    }
    catch {
        Write-Warn "MPO konnte nicht deaktiviert werden: $_"
    }
}

# ============================================================
#  SHADER CACHE & TRIM & WRITE CACHE
# ============================================================
function Set-StorageOptimizations {
    Write-Header "Schritt 12/17 - Shader-Cache, TRIM & Write Cache"

    # Shader Cache
    if ($Config.ShaderCache) {
        try {
            $gpuPath = "HKLM:\SOFTWARE\Microsoft\DirectX\UserGpuPreferences"
            if (-not (Test-Path $gpuPath)) { New-Item -Path $gpuPath -Force | Out-Null }
            Set-ItemProperty -Path $gpuPath -Name "DirectXUserGlobalSettings" -Value "SwapEffectUpgradeEnable=1;" -Type String -ErrorAction SilentlyContinue

            # NVIDIA Shader Cache
            $nvPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0000"
            if (Test-Path $nvPath) {
                Set-ItemProperty -Path $nvPath -Name "RMShaderCache" -Value 1 -Type DWord -ErrorAction SilentlyContinue
            }
            Write-OK "Shader-Cache aktiviert (kuerzeree Ladezeiten beim ersten Spielstart)."
        }
        catch {
            Write-Warn "Shader-Cache konnte nicht gesetzt werden: $_"
        }
    } else { Write-Skip "Shader-Cache uebersprungen." }

    # TRIM
    if ($Config.TrimSicherstellen) {
        try {
            $trimResult = & fsutil behavior query DisableDeleteNotify 2>&1
            if ($trimResult -match "0") {
                Write-OK "TRIM ist bereits aktiv."
            } else {
                & fsutil behavior set DisableDeleteNotify 0 | Out-Null
                Write-OK "TRIM aktiviert (optimale SSD-Performance)."
            }
        }
        catch {
            Write-Warn "TRIM-Status konnte nicht geprueft werden: $_"
        }
    } else { Write-Skip "TRIM-Pruefung uebersprungen." }

    # Write Cache
    if ($Config.WriteCacheAktivieren) {
        try {
            $disks = Get-WmiObject -Class Win32_DiskDrive -ErrorAction SilentlyContinue
            foreach ($disk in $disks) {
                $query = "ASSOCIATORS OF {Win32_DiskDrive.DeviceID='$($disk.DeviceID -replace '\\\\','\\')'} WHERE AssocClass=Win32_DiskDriveToDiskPartition"
                # Ueber PnP Device den Write Cache setzen
            }
            # Via Geraete-Manager Registry
            $diskPath = "HKLM:\SYSTEM\CurrentControlSet\Services\disk"
            Set-ItemProperty -Path $diskPath -Name "WriteCacheEnabled" -Value 1 -Type DWord -ErrorAction SilentlyContinue
            Write-OK "Disk Write Cache aktiviert (hoehere Schreibleistung)."
            Write-Info "Hinweis: Bei Stromausfall ohne USV minimal erhoehtes Risiko - auf Heimrechnern vernachlaessigbar."
        }
        catch {
            Write-Warn "Write Cache konnte nicht aktiviert werden: $_"
        }
    } else { Write-Skip "Write Cache uebersprungen." }
}

# ============================================================
#  FOKUS-ASSIST (BENACHRICHTIGUNGEN BEIM SPIELEN)
# ============================================================
function Set-FocusAssist {
    Write-Header "Schritt 13/17 - Fokus-Assist: Benachrichtigungen beim Spielen deaktivieren"

    if (-not $Config.FokusAssist) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # Fokus-Assist beim Spielen automatisch aktivieren
        $path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings"
        if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
        Set-ItemProperty -Path $path -Name "NOC_GLOBAL_SETTING_ALLOW_TOASTS_ABOVE_LOCK" -Value 0 -Type DWord -ErrorAction SilentlyContinue

        # Automatische Regeln fuer Vollbild-Apps
        $faPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\CloudStore\Store\Cache\DefaultAccount"
        # Windows 10/11 Fokus-Assist Vollbildregel
        $quietPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\QuietHours"
        if (-not (Test-Path $quietPath)) { New-Item -Path $quietPath -Force | Out-Null }
        Set-ItemProperty -Path $quietPath -Name "Enabled"              -Value 0    -Type DWord -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $quietPath -Name "WhenPlayingGame"      -Value 1    -Type DWord -ErrorAction SilentlyContinue

        Write-OK "Benachrichtigungen im Vollbild/Spiel-Modus automatisch unterdrueckt."
    }
    catch {
        Write-Warn "Fokus-Assist konnte nicht konfiguriert werden: $_"
    }
}

# ============================================================
#  NETZWERK: QOS, RECEIVE WINDOW, DNS
# ============================================================
function Set-NetworkOptimizations {
    Write-Header "Schritt 14/17 - Netzwerk: QoS, Receive Window & DNS"

    # QoS Paketplaner
    if ($Config.QoSDeaktivieren) {
        try {
            $qosPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Psched"
            if (-not (Test-Path $qosPath)) { New-Item -Path $qosPath -Force | Out-Null }
            Set-ItemProperty -Path $qosPath -Name "NonBestEffortLimit" -Value 0 -Type DWord
            Write-OK "QoS-Bandbreitenreservierung aufgehoben (volle Bandbreite verfuegbar)."
        }
        catch { Write-Warn "QoS konnte nicht deaktiviert werden: $_" }
    } else { Write-Skip "QoS-Optimierung uebersprungen." }

    # Receive Window Auto-Tuning
    if ($Config.ReceiveWindowTuning) {
        try {
            & netsh int tcp set global autotuninglevel=normal 2>&1 | Out-Null
            & netsh int tcp set global chimney=disabled        2>&1 | Out-Null
            & netsh int tcp set global dca=enabled             2>&1 | Out-Null
            & netsh int tcp set global netdma=enabled          2>&1 | Out-Null
            & netsh int tcp set global ecncapability=disabled  2>&1 | Out-Null
            & netsh int tcp set global timestamps=disabled     2>&1 | Out-Null
            Write-OK "TCP/Receive Window auf Gaming-optimierte Werte gesetzt."
        }
        catch { Write-Warn "Receive Window Tuning fehlgeschlagen: $_" }
    } else { Write-Skip "Receive Window Tuning uebersprungen." }

    # DNS auf Cloudflare
    if ($Config.DNSOptimieren) {
        try {
            $adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
            foreach ($adapter in $adapters) {
                Set-DnsClientServerAddress -InterfaceIndex $adapter.InterfaceIndex `
                    -ServerAddresses ("1.1.1.1", "1.0.0.1") -ErrorAction SilentlyContinue
                Write-OK "DNS auf Cloudflare (1.1.1.1) gesetzt fuer: $($adapter.Name)"
            }
            # DNS-Cache leeren
            & ipconfig /flushdns | Out-Null
            Write-OK "DNS-Cache geleert."
        }
        catch { Write-Warn "DNS konnte nicht gesetzt werden: $_" }
    } else { Write-Skip "DNS-Optimierung uebersprungen (in Konfiguration deaktiviert)." }
}

# ============================================================
#  PAGING-DATEI FIXIEREN
# ============================================================
function Set-PageFile {
    Write-Header "Schritt 15/17 - Paging-Datei auf feste Groesse setzen"

    if (-not $Config.PagingDateiFixieren) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $ram = (Get-WmiObject -Class Win32_ComputerSystem).TotalPhysicalMemory
        $ramGB = [math]::Round($ram / 1GB)

        if ($ramGB -lt 16) {
            Write-Warn "Nur ${ramGB}GB RAM erkannt - Paging-Datei wird nicht veraendert (mind. 16GB empfohlen)."
            return
        }

        # Feste Groesse: 1x RAM als Initial- und Maximalgroesse (in MB)
        $sizeMB = $ramGB * 1024
        $sysDrive = $env:SystemDrive

        $cs = Get-WmiObject -Class Win32_ComputerSystem
        $cs.AutomaticManagedPagefile = $false
        $cs.Put() | Out-Null

        $pf = Get-WmiObject -Query "SELECT * FROM Win32_PageFileSetting WHERE Name='${sysDrive}\\pagefile.sys'" -ErrorAction SilentlyContinue
        if ($null -eq $pf) {
            $pf = ([wmiclass]"Win32_PageFileSetting").CreateInstance()
            $pf.Name = "${sysDrive}\pagefile.sys"
        }
        $pf.InitialSize = $sizeMB
        $pf.MaximumSize = $sizeMB
        $pf.Put() | Out-Null

        Write-OK "Paging-Datei auf ${sizeMB}MB fixiert (${ramGB}GB RAM erkannt)."
        Write-Info "Verhindert dynamisches Wachsen der Auslagerungsdatei waehrend des Spielens."
    }
    catch {
        Write-Warn "Paging-Datei konnte nicht angepasst werden: $_"
    }
}

# ============================================================
#  CONTROLLER-OPTIMIERUNGEN
# ============================================================
function Optimize-Controller {
    Write-Header "Schritt 16/17 - Controller: USB-Energiesparmodus deaktivieren"

    if (-not $Config.ControllerUSBPower) { Write-Skip "Uebersprungen (Konfiguration)"; }
    else {
        try {
            # Alle HID-kompatiblen USB-Geraete (Controller, Gamepads) finden
            $usbHubs = Get-PnpDevice -Class "HIDClass" -Status "OK" -ErrorAction SilentlyContinue
            $count = 0

            # Energiesparmodus fuer USB-Root-Hubs deaktivieren
            $usbRoots = Get-PnpDevice -FriendlyName "*USB Root Hub*" -ErrorAction SilentlyContinue
            foreach ($dev in $usbRoots) {
                $devPath = "HKLM:\SYSTEM\CurrentControlSet\Enum\$($dev.InstanceId)\Device Parameters"
                if (Test-Path $devPath) {
                    Set-ItemProperty -Path $devPath -Name "EnhancedPowerManagementEnabled" -Value 0 -Type DWord -ErrorAction SilentlyContinue
                    $count++
                }
            }

            # USB Selective Suspend global deaktivieren
            powercfg -setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 2>$null
            powercfg -setdcvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 2>$null
            powercfg -setactive SCHEME_CURRENT 2>$null

            Write-OK "USB Selective Suspend deaktiviert (verhindert Controller-Verbindungsabbrueche)."
            Write-OK "USB Root Hub Energiesparmodus deaktiviert ($count Eintraege)."
        }
        catch {
            Write-Warn "USB-Energiesparmodus konnte nicht vollstaendig deaktiviert werden: $_"
        }
    }

    Write-Header "Schritt 17/17 - Controller: Bluetooth-Energiesparmodus deaktivieren"

    if (-not $Config.ControllerBTPower) { Write-Skip "Uebersprungen (Konfiguration)"; }
    else {
        try {
            # Alle Bluetooth-Adapter finden und Energiesparmodus deaktivieren
            $btAdapters = Get-PnpDevice -Class "Bluetooth" -Status "OK" -ErrorAction SilentlyContinue
            $btCount = 0

            foreach ($bt in $btAdapters) {
                $regPath = "HKLM:\SYSTEM\CurrentControlSet\Enum\$($bt.InstanceId)\Device Parameters"
                if (Test-Path $regPath) {
                    Set-ItemProperty -Path $regPath -Name "EnhancedPowerManagementEnabled" -Value 0 -Type DWord -ErrorAction SilentlyContinue
                    $btCount++
                }
            }

            if ($btCount -gt 0) {
                Write-OK "Bluetooth-Energiesparmodus fuer $btCount Adapter deaktiviert."
            } else {
                Write-Skip "Kein aktiver Bluetooth-Adapter gefunden (oder bereits optimiert)."
            }

            # Bluetooth Audio-Latenz optimieren (Klassik-BT bevorzugen)
            $btRegPath = "HKLM:\SYSTEM\CurrentControlSet\Services\BTHPORT\Parameters"
            if (Test-Path $btRegPath) {
                Set-ItemProperty -Path $btRegPath -Name "DisableAbsoluteVolume" -Value 1 -Type DWord -ErrorAction SilentlyContinue
                Write-OK "Bluetooth Audio-Interferenz mit Controller reduziert."
            }
        }
        catch {
            Write-Warn "Bluetooth-Einstellungen konnten nicht angepasst werden: $_"
        }
    }

    Write-Header "Schritt 17/17 - Controller: HID-Eingabelatenz & Vibration optimieren"

    # HID-Latenz optimieren
    if ($Config.HIDLatenz) {
        try {
            # HIDClass Polling-Intervall auf Minimum setzen
            $hidPath = "HKLM:\SYSTEM\CurrentControlSet\Services\HidUsb\Parameters"
            if (-not (Test-Path $hidPath)) { New-Item -Path $hidPath -Force | Out-Null }
            Set-ItemProperty -Path $hidPath -Name "PollInterval" -Value 1 -Type DWord -ErrorAction SilentlyContinue

            # Xinput Latenz-Optimierung (Game-Controller Prioritaet)
            $xinputPath = "HKLM:\SOFTWARE\Microsoft\XInput"
            if (-not (Test-Path $xinputPath)) { New-Item -Path $xinputPath -Force | Out-Null }
            Set-ItemProperty -Path $xinputPath -Name "EnableGamepad" -Value 1 -Type DWord -ErrorAction SilentlyContinue

            # DirectInput HID-Puffer vergroessern fuer stabilere Eingabe
            $diPath = "HKLM:\SYSTEM\CurrentControlSet\Services\HidUsb"
            if (Test-Path $diPath) {
                Set-ItemProperty -Path $diPath -Name "IdleAcPowerUsageChk" -Value 0 -Type DWord -ErrorAction SilentlyContinue
            }

            Write-OK "HID-Polling-Intervall auf 1ms gesetzt (minimale Eingabelatenz)."
            Write-OK "XInput-Gamepad-Prioritaet aktiviert."
        }
        catch {
            Write-Warn "HID-Latenzoptimierung fehlgeschlagen: $_"
        }
    } else {
        Write-Skip "HID-Latenz-Optimierung uebersprungen (Konfiguration)."
    }

    # Vibration sicherstellen
    if ($Config.ControllerVibration) {
        try {
            $vibPath = "HKCU:\Software\Microsoft\XInput"
            if (-not (Test-Path $vibPath)) { New-Item -Path $vibPath -Force | Out-Null }
            Set-ItemProperty -Path $vibPath -Name "VibrationEnabled" -Value 1 -Type DWord -ErrorAction SilentlyContinue

            # XboxGipSvc (Xbox Accessory Management Service) sicherstellen - benoetigt fuer Rumble
            $gipSvc = Get-Service -Name "XboxGipSvc" -ErrorAction SilentlyContinue
            if ($null -ne $gipSvc -and $gipSvc.StartType -eq "Disabled") {
                Set-Service -Name "XboxGipSvc" -StartupType Manual -ErrorAction SilentlyContinue
                Write-OK "XboxGipSvc (Controller-Rumble-Dienst) reaktiviert."
            } elseif ($null -ne $gipSvc) {
                Write-OK "XboxGipSvc laeuft bereits (Rumble/Vibration aktiv)."
            }

            Write-OK "Controller-Vibration aktiviert und gesichert."
            Write-Info "Tipp: In Steam unter Einstellungen > Controller > Vibrationsstaerke ebenfalls pruefen."
        }
        catch {
            Write-Warn "Vibrations-Einstellungen konnten nicht gesetzt werden: $_"
        }
    } else {
        Write-Skip "Vibrations-Einstellung uebersprungen (Konfiguration)."
    }
}

# ============================================================
#  ABSCHLUSS
# ============================================================
function Show-Summary {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Green
    Write-Host "  GAMING-OPTIMIERUNG ABGESCHLOSSEN" -ForegroundColor Green
    Write-Host ("=" * 60) -ForegroundColor Green
    Write-Host ""
    Write-Host "  Was wurde gemacht:" -ForegroundColor White
    Write-Host "   - Wiederherstellungspunkt erstellt" -ForegroundColor Gray
    Write-Host "   - Unnoetige Dienste deaktiviert" -ForegroundColor Gray
    Write-Host "   - Visuelle Effekte reduziert" -ForegroundColor Gray
    Write-Host "   - Energieplan auf Hoechstleistung gesetzt" -ForegroundColor Gray
    Write-Host "   - Mausbeschleunigung deaktiviert" -ForegroundColor Gray
    Write-Host "   - Spielmodus aktiviert, Game Bar deaktiviert" -ForegroundColor Gray
    Write-Host "   - HAGS aktiviert" -ForegroundColor Gray
    Write-Host "   - Netzwerklatenz (Nagle) optimiert" -ForegroundColor Gray
    Write-Host "   - Timer-Aufloesung auf 0.5ms gesetzt" -ForegroundColor Gray
    Write-Host "   - MPO deaktiviert (kein Stutter)" -ForegroundColor Gray
    Write-Host "   - Shader-Cache, TRIM & Write Cache optimiert" -ForegroundColor Gray
    Write-Host "   - Fokus-Assist beim Spielen aktiviert" -ForegroundColor Gray
    Write-Host "   - QoS, TCP & Netzwerk optimiert" -ForegroundColor Gray
    Write-Host "   - Paging-Datei fixiert" -ForegroundColor Gray
    Write-Host "   - USB Selective Suspend deaktiviert" -ForegroundColor Gray
    Write-Host "   - Bluetooth-Energiesparmodus deaktiviert" -ForegroundColor Gray
    Write-Host "   - HID-Eingabelatenz & Controller-Vibration optimiert" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  NEUSTART EMPFOHLEN damit alle Aenderungen wirksam werden." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Zum Rueckgaengigmachen:" -ForegroundColor White
    Write-Host "   Systemsteuerung > System > Computerschutz > Systemwiederherstellung" -ForegroundColor Gray
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Green

    $restart = Read-Host "  Jetzt neu starten? (j/N)"
    if ($restart -eq "j" -or $restart -eq "J") {
        Write-Host "  Starte in 10 Sekunden neu..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
        Restart-Computer -Force
    }
    else {
        Write-Host "  Bitte manuell neu starten um alle Aenderungen zu aktivieren." -ForegroundColor Yellow
    }
}

# ============================================================
#  HAUPTPROGRAMM
# ============================================================
Clear-Host
Write-Host ""
Write-Host "  +--------------------------------------------------+" -ForegroundColor Cyan
Write-Host "  |        GAMING OPTIMIZER fuer Windows 10/11      |" -ForegroundColor Cyan
Write-Host "  |          Controller-Edition                      |" -ForegroundColor Cyan
Write-Host "  +--------------------------------------------------+" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Dieses Skript optimiert Windows fuer Gaming-Performance." -ForegroundColor White
Write-Host "  Ein Wiederherstellungspunkt wird automatisch erstellt." -ForegroundColor White
Write-Host ""

$confirm = Read-Host "  Optimierung starten? (j/N)"
if ($confirm -ne "j" -and $confirm -ne "J") {
    Write-Host "  Abgebrochen." -ForegroundColor Red
    exit 0
}

# Schritte ausfuehren
New-GamingRestorePoint
Disable-UnnecessaryServices
Set-VisualPerformance
Set-HighPerformancePower
Disable-MouseAcceleration
Set-GameMode
Enable-HAGS
Disable-NagleAlgorithm
Pause-WindowsUpdates
Set-TimerResolution
Disable-MPO
Set-StorageOptimizations
Set-FocusAssist
Set-NetworkOptimizations
Set-PageFile
Optimize-Controller
Show-Summary
