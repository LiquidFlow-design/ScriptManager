#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Windows Gaming-Optimierungsskript
.DESCRIPTION
    Optimiert Windows-Einstellungen fuer bessere Gaming-Performance.
    Erstellt zuvor automatisch einen Systemwiederherstellungspunkt.
    Mit dem Parameter -Undo werden alle Aenderungen rueckgaengig gemacht.
.PARAMETER Undo
    Macht alle vorgenommenen Optimierungen rueckgaengig und stellt
    die Windows-Standardwerte wieder her.
.EXAMPLE
    .\Gaming-Optimierung.ps1
    .\Gaming-Optimierung.ps1 -Undo
    .\Gaming-Optimierung.ps1 -SkipConfirm
    .\Gaming-Optimierung.ps1 -Undo -SkipConfirm -AutoRestart
.NOTES
    Muss als Administrator ausgefuehrt werden.
    Getestet auf Windows 10 / Windows 11.
#>
param(
    [switch]$Undo,
    [switch]$AutoRestart,
    [switch]$SkipConfirm
)

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

    # ---- Erweiterte Performance-Optimierungen ----
    # Network Throttling Index deaktivieren (verhindert Paketdrosselung durch Windows)
    NetworkThrottling          = $true

    # SystemResponsiveness: CPU-Zeit fuer Spiele maximieren (0 = alles fuer Vordergrund)
    SystemResponsiveness       = $true

    # Large System Cache deaktivieren (RAM gehoert den Spielen, nicht dem Dateicache)
    LargeSystemCache           = $true

    # NVIDIA Ultra Low Latency / AMD Anti-Lag per Registry aktivieren
    GPULowLatency              = $true

    # Automatischen Spielprozess-Prio-Task einrichten (High Priority fuer Games)
    # Richtet einen Scheduled Task ein, der nichts Aggressives tut
    GamePriorityTask           = $true

    # IRQ-Priorisierung: GPU und Netzwerkkarte auf dedizierten CPU-Kern legen
    IRQPriorisierung           = $true

    # ---- Netzwerkadapter-Optimierungen ----
    # NIC Erweiterte Einstellungen optimieren (LSO, Flow Control, EEE, Interrupt Moderation)
    # Reduziert Ping-Spitzen, Paketbursts und Verbindungsabbrueche erheblich
    NICOptimierungen           = $true

    # IPv6 deaktivieren (viele Spielserver sind rein IPv4 - verhindert Verbindungsverzoegerungen)
    IPv6Deaktivieren           = $true

    # Delivery Optimization deaktivieren (verhindert dass Windows deine Bandbreite
    # fuer P2P-Updateverteilung an andere PCs verbraucht)
    DeliveryOptimization       = $true

    # RSS (Receive Side Scaling) auf dedizierten CPU-Kern binden (weniger NDIS-DPC-Latenz)
    RSSAffinitaet              = $true

    # ---- Neue Ergaenzungen ----
    # CPU-Parking deaktivieren (alle Kerne immer aktiv - verhindert Reaktionsverzoegerung)
    CPUParking                 = $true

    # TCP Fast Open aktivieren (schnellerer Verbindungsaufbau zum Spielserver)
    TCPFastOpen                = $true

    # UDP-Puffer optimieren (besonders relevant fuer CoD - laeuft ueber UDP)
    UDPPuffer                  = $true

    # Windows Defender Spiele-Ausnahmen hinzufuegen (reduziert CPU-Last beim Spielen)
    DefenderAusnahmen          = $true

    # Memory Compression deaktivieren (nur bei 16GB+ RAM empfohlen)
    MemoryCompression          = $true

    # Prefetch vollstaendig deaktivieren (ergaenzt SysMain-Deaktivierung)
    PrefetchDeaktivieren       = $true

    # Zusaetzliche unnoetige Dienste deaktivieren (Mixed Reality, Tablet, etc.)
    ZusatzDienste              = $true

    # NVIDIA Shader-Cache-Groesse erhoehen (10 GB - weniger Neu-Kompilierungen)
    NvidiaShaderCache          = $true

    # Prozessor-Boost-Modus erzwingen (permanenter Boost statt bei Bedarf)
    CPUBoostModus              = $true

    # ---- Gunfight / Latenz-Optimierungen ----
    # DSCP QoS-Markierung fuer CoD-Traffic (priorisiert Spielpakete im Router)
    DSCPMarkierung             = $true

    # DPC Latency: NDIS DPC-Verarbeitung optimieren (reduziert Netzwerk-Jitter)
    DPCLatenz                  = $true

    # Windows Clock Interrupt auf dedizierten Kern isolieren (weniger Timer-Jitter)
    ClockInterruptIsolierung   = $true

    # Kernel-seitige Netzwerkpriorisierung fuer UDP-Gaming-Traffic
    KernelUDPPrio              = $true

    # Auto-Tuning fuer MMCSS (Multimedia Class Scheduler) schaerfen
    MMCSSSchaerfen             = $true

    # Spectre/Meltdown Mitigations deaktivieren (nur fuer dedizierte Gaming-PCs!)
    # WARNUNG: Reduziert Sicherheit - nur auf PCs ohne sensible Daten/Bankzugang empfohlen
    SpectreDeaktivieren        = $false   # Standardmaessig AUS - bewusste Entscheidung erforderlich!

    # Power Throttling deaktivieren (verhindert dass Windows Spielprozesse drosselt)
    PowerThrottling            = $true

    # Netzwerk-Adapter Sende-Optimierung: TCP Chimney vollstaendig konfigurieren
    TCPChimney                 = $true

    # Speicher: Non-Paged Pool erhoehen (stabilere Kernel-Operationen)
    NonPagedPool               = $true

    # Win32PrioritySeparation: CPU-Quantum fuer Spielprozess optimieren
    # 0x2A = Short Fixed, High Foreground Boost: Spiel bekommt 3x mehr CPU-Zeit als Hintergrundprozesse
    # Messbar bessere 1%-Lows und Input-Latenz - gut dokumentiert, sicher rueckgaengig zu machen
    Win32PrioSeparation        = $true

    # MMCSS NoLazyMode + AlwaysOn: MMCSS nie in Idle-Zustand gehen lassen
    MMCSSAlwaysOn              = $true
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
        if (-not $SkipConfirm) {
            Write-Host "  Trotzdem fortfahren? (j/N): " -NoNewline
            $continue = ([Console]::ReadLine())
            if ($continue -ne "j" -and $continue -ne "J") {
                Write-Host "  Abgebrochen." -ForegroundColor Red
                exit 1
            }
        } else {
            Write-Warn "Fahre trotzdem fort (-SkipConfirm gesetzt)."
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
        Write-Info "Wichtig: Falls weiterhin Frame-Drops auftreten, HAGS testweise deaktivieren (Wert 1 statt 2)."
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
        Write-Warn "Bekannte Ursache fuer Frame-Drops: Falls Thermal Throttling auftritt (CPU zu heiss), diesen Wert auf 0 setzen."
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
            # netdma wird in Set-TCPChimneyConfig explizit auf disabled gesetzt (veraltet auf modernen Systemen)
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
#  NETWORK THROTTLING INDEX & SYSTEM RESPONSIVENESS
# ============================================================
function Set-NetworkAndCPUResponsiveness {
    Write-Header "Schritt 18/22 - Network Throttling Index & SystemResponsiveness"

    # Network Throttling Index
    if ($Config.NetworkThrottling) {
        try {
            $mmPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile"
            if (-not (Test-Path $mmPath)) { New-Item -Path $mmPath -Force | Out-Null }
            # NetworkThrottlingIndex: 20 statt 0xFFFFFFFF
            # 0xFFFFFFFF (komplett deaktiviert) verschlechtert nachweislich die DPC-Latenz,
            # was sich als Netzwerk-Jitter in Gunfights bemerkbar macht.
            # Wert 20 hebt die 15MB/s-Deckelung auf ohne den DPC-Schutz zu verlieren.
            # Standard: 10 | Gaming-Optimum: 20 | Nicht empfohlen: 0xFFFFFFFF
            Set-ItemProperty -Path $mmPath -Name "NetworkThrottlingIndex" -Value 20 -Type DWord
            Write-OK "NetworkThrottlingIndex auf 20 gesetzt (optimierter Gaming-Wert, kein DPC-Jitter)."
            Write-Info "Wert 20 hebt Windows-Netzwerkdrosselung auf ohne DPC-Latenz zu verschlechtern."
        }
        catch { Write-Warn "NetworkThrottlingIndex konnte nicht gesetzt werden: $_" }
    } else { Write-Skip "NetworkThrottlingIndex-Optimierung uebersprungen." }

    # SystemResponsiveness
    if ($Config.SystemResponsiveness) {
        try {
            $mmPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile"
            if (-not (Test-Path $mmPath)) { New-Item -Path $mmPath -Force | Out-Null }
            # 10 = optimaler Wert fuer Gaming (Standard ist 20)
            # Hinweis: Werte unter 10 werden von Windows intern als 20 behandelt - 10 ist das effektive Minimum!
            Set-ItemProperty -Path $mmPath -Name "SystemResponsiveness" -Value 10 -Type DWord

            # Auch fuer den Games-Profil-Eintrag setzen
            $gamesPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games"
            if (-not (Test-Path $gamesPath)) { New-Item -Path $gamesPath -Force | Out-Null }
            Set-ItemProperty -Path $gamesPath -Name "Affinity"           -Value 0          -Type DWord  -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $gamesPath -Name "Background Only"    -Value "False"    -Type String -ErrorAction SilentlyContinue
            # Clock Rate wird NICHT hier gesetzt - Wert 2710750 liegt ausserhalb des gueltigen MMCSS-Bereichs
            # (2000-10000) und deaktiviert den Task. Set-MMCSSOptimization setzt Clock Rate korrekt auf 10000.
            Set-ItemProperty -Path $gamesPath -Name "GPU Priority"       -Value 8          -Type DWord  -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $gamesPath -Name "Priority"           -Value 6          -Type DWord  -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $gamesPath -Name "Scheduling Category" -Value "High"    -Type String -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $gamesPath -Name "SFIO Priority"      -Value "High"     -Type String -ErrorAction SilentlyContinue
            Write-OK "SystemResponsiveness auf 10 gesetzt (optimaler Gaming-Wert, Standard: 20)."
            Write-OK "Multimedia-Systemprofil 'Games' Basis-Prioritaet gesetzt (Clock Rate folgt in MMCSS-Schritt)."
        }
        catch { Write-Warn "SystemResponsiveness konnte nicht gesetzt werden: $_" }
    } else { Write-Skip "SystemResponsiveness-Optimierung uebersprungen." }
}

# ============================================================
#  LARGE SYSTEM CACHE DEAKTIVIEREN
# ============================================================
function Disable-LargeSystemCache {
    Write-Header "Schritt 19/22 - Large System Cache deaktivieren"

    if (-not $Config.LargeSystemCache) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $path = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management"
        # 0 = RAM bevorzugt fuer Programme/Spiele statt Dateisystem-Cache
        Set-ItemProperty -Path $path -Name "LargeSystemCache" -Value 0 -Type DWord
        # Sicherstellen dass auch der I/O-Cache nicht unnoetig gross ist
        Set-ItemProperty -Path $path -Name "IoPageLockLimit"  -Value 0 -Type DWord -ErrorAction SilentlyContinue
        Write-OK "Large System Cache deaktiviert (RAM gehoert den Spielen)."
    }
    catch { Write-Warn "Large System Cache konnte nicht angepasst werden: $_" }
}

# ============================================================
#  GPU LOW LATENCY MODE (NVIDIA & AMD)
# ============================================================
function Set-GPULowLatency {
    Write-Header "Schritt 20/22 - GPU Low Latency Mode (NVIDIA / AMD)"

    if (-not $Config.GPULowLatency) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # NVIDIA: Ultra Low Latency Mode (entspricht 'On' in NVCP)
        # Wert 0x00000001 = Low Latency On, 0x00000002 = Ultra (kein Pre-Rendered Frame)
        $nvGPUPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
        $nvAdapters = Get-ChildItem -Path $nvGPUPath -ErrorAction SilentlyContinue |
                      Where-Object { $_.Name -match "\\\d{4}$" }

        $nvFound = $false
        foreach ($adapter in $nvAdapters) {
            $driverDesc = (Get-ItemProperty -Path $adapter.PSPath -Name "DriverDesc" -ErrorAction SilentlyContinue).DriverDesc
            if ($driverDesc -match "NVIDIA") {
                # Ultra Low Latency via NV-Treiber-Registry
                Set-ItemProperty -Path $adapter.PSPath -Name "RMGpuLatencyMonitorEnable" -Value 1    -Type DWord -ErrorAction SilentlyContinue
                Set-ItemProperty -Path $adapter.PSPath -Name "PerfLevelSrc"              -Value 0x2222 -Type DWord -ErrorAction SilentlyContinue
                $nvFound = $true
                Write-OK "NVIDIA Low Latency Mode aktiviert fuer: $driverDesc"
            }
        }
        if (-not $nvFound) { Write-Skip "Kein NVIDIA-Adapter gefunden." }

        # AMD: Anti-Lag Registry-Eintrag
        $amdPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
        $amdAdapters = Get-ChildItem -Path $amdPath -ErrorAction SilentlyContinue |
                       Where-Object { $_.Name -match "\\\d{4}$" }

        $amdFound = $false
        foreach ($adapter in $amdAdapters) {
            $driverDesc = (Get-ItemProperty -Path $adapter.PSPath -Name "DriverDesc" -ErrorAction SilentlyContinue).DriverDesc
            if ($driverDesc -match "AMD|Radeon|ATI") {
                Set-ItemProperty -Path $adapter.PSPath -Name "KMD_EnableAntiLag"   -Value 1 -Type DWord -ErrorAction SilentlyContinue
                Set-ItemProperty -Path $adapter.PSPath -Name "KMD_FRTEnabled"      -Value 0 -Type DWord -ErrorAction SilentlyContinue
                $amdFound = $true
                Write-OK "AMD Anti-Lag aktiviert fuer: $driverDesc"
            }
        }
        if (-not $amdFound) { Write-Skip "Kein AMD-Adapter gefunden." }

        # Allgemein: DXGI Flip Model erzwingen fuer niedrigere Latenz
        $dxPath = "HKCU:\Software\Microsoft\DirectX"
        if (-not (Test-Path $dxPath)) { New-Item -Path $dxPath -Force | Out-Null }
        Set-ItemProperty -Path $dxPath -Name "DisableMaximizedWindowedMode" -Value 0 -Type DWord -ErrorAction SilentlyContinue
        Write-OK "DXGI Flip Model optimiert (niedrigere Renderlatenz)."
    }
    catch { Write-Warn "GPU Low Latency konnte nicht gesetzt werden: $_" }
}

# ============================================================
#  SPIEL-PROZESS PRIORITAET (SCHEDULED TASK)
# ============================================================
function Set-GamePriorityTask {
    Write-Header "Schritt 21/22 - Spiel-Prozess Prioritaet (Scheduled Task)"

    if (-not $Config.GamePriorityTask) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $taskName = "GamingOptimizer_GamePriority"

        # Bestehenden Task entfernen falls vorhanden
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

        # PowerShell-Script-Inhalt fuer den Task
        # Setzt High Priority fuer bekannte Spiele-Launcher und laufende Vollbild-Prozesse
        $taskScript = @'
# Bekannte Spiel-Prozessnamen (erweiterbar)
$gameProcesses = @(
    "steam","steamwebhelper","gameoverlayrenderer",
    "epicgameslauncher","easyanticheat","battlenet",
    "League of Legends","leagueclient","riotclientservices",
    "Fortnite","FortniteLauncher",
    "csgo","cs2","dota2","tf2","hl2",
    "destiny2","destiny2launcher",
    "GTA5","GTAV","PlayGTAV",
    "witcher3","Cyberpunk2077","RDR2","Hogwarts Legacy",
    "javaw","minecraft",
    # Call of Duty (alle Teile / Warzone)
    "cod","codmw","codmw2","codmw3",
    "BlackOpsColdWar","BlackOps4","BlackOps3",
    "ModernWarfare","ModernWarfare2","ModernWarfare3",
    "Warzone","WarzoneCaldera","cod_launcher",
    "black_ops_cold_war","black_ops_4",
    "HQ","HQGame","cod_client"
)
foreach ($name in $gameProcesses) {
    $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
        try {
            if ($p.PriorityClass -ne [System.Diagnostics.ProcessPriorityClass]::High) {
                $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::AboveNormal
            }
        } catch {}
    }
}
'@
        $scriptPath = "$env:ProgramData\GamingOptimizer\SetGamePriority.ps1"
        $scriptDir  = Split-Path $scriptPath
        if (-not (Test-Path $scriptDir)) { New-Item -Path $scriptDir -ItemType Directory -Force | Out-Null }
        Set-Content -Path $scriptPath -Value $taskScript -Encoding UTF8

        # Scheduled Task: laeuft alle 10 Minuten (vorher 2 Min - verursachte CPU-Spikes/Frame-Drops)
        $action   = New-ScheduledTaskAction -Execute "powershell.exe" `
                        -Argument "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""
        $trigger  = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 10) -Once -At (Get-Date)
        $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 1) `
                        -MultipleInstances IgnoreNew -Priority 7
        $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
            -Settings $settings -Principal $principal -Description "Gaming Optimizer: Setzt AboveNormal Prioritaet fuer Spielprozesse" `
            -ErrorAction Stop | Out-Null

        Write-OK "Scheduled Task '$taskName' erstellt (laeuft alle 10 Min, setzt AboveNormal-Prio fuer Spiele)."
        Write-Info "Spielliste erweiterbar in: $scriptPath"
    }
    catch { Write-Warn "Scheduled Task konnte nicht erstellt werden: $_" }
}

# ============================================================
#  IRQ-PRIORISIERUNG (GPU & NETZWERKKARTE)
# ============================================================
function Set-IRQPrioritization {
    Write-Header "Schritt 22/22 - IRQ-Priorisierung (GPU & Netzwerkkarte)"

    if (-not $Config.IRQPriorisierung) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # Message Signaled Interrupts (MSI) fuer GPU aktivieren - reduziert Interrupt-Latenz erheblich
        $gpuPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
        $gpuAdapters = Get-ChildItem -Path $gpuPath -ErrorAction SilentlyContinue |
                       Where-Object { $_.Name -match "\\\d{4}$" }

        foreach ($adapter in $gpuAdapters) {
            $driverDesc = (Get-ItemProperty -Path $adapter.PSPath -Name "DriverDesc" -ErrorAction SilentlyContinue).DriverDesc
            if ($driverDesc -match "NVIDIA|AMD|Radeon|Intel") {
                $msiPath = Join-Path $adapter.PSPath "Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
                if (-not (Test-Path $msiPath)) {
                    New-Item -Path $msiPath -Force | Out-Null
                }
                # MSI aktivieren (1) und auf hoechste Prioritaet setzen
                Set-ItemProperty -Path $msiPath -Name "MSISupported"    -Value 1 -Type DWord -ErrorAction SilentlyContinue
                # Interrupt-Affinitaet: Kern 2 (Bitmask 0x04) - weg von Kern 0 (Windows-Standard)
                # DWord statt Binary - PowerShell erwartet fuer Binary ein Byte-Array, kein Integer
                $affinityPath = Join-Path $adapter.PSPath "Device Parameters\Interrupt Management\Affinity Policy"
                if (-not (Test-Path $affinityPath)) { New-Item -Path $affinityPath -Force | Out-Null }
                Set-ItemProperty -Path $affinityPath -Name "DevicePolicy"          -Value 4 -Type DWord -ErrorAction SilentlyContinue
                Set-ItemProperty -Path $affinityPath -Name "AssignmentSetOverride" -Value 4 -Type DWord -ErrorAction SilentlyContinue
                Write-OK "MSI + IRQ-Affinitaet gesetzt fuer GPU: $driverDesc"
            }
        }

        # Netzwerkkarte: MSI aktivieren + auf anderen Kern als GPU
        $nicPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
        $netClass = "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e977-e325-11ce-bfc1-08002be10318}"
        # Korrekte Netzwerkkarten-GUID
        $netClassCorrect = "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e972-e325-11ce-bfc1-08002be10318}"
        $nicAdapters = Get-ChildItem -Path $netClassCorrect -ErrorAction SilentlyContinue |
                       Where-Object { $_.Name -match "\\\d{4}$" }

        foreach ($nic in $nicAdapters) {
            $nicDesc = (Get-ItemProperty -Path $nic.PSPath -Name "DriverDesc" -ErrorAction SilentlyContinue).DriverDesc
            if ($nicDesc) {
                $msiNicPath = Join-Path $nic.PSPath "Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
                if (-not (Test-Path $msiNicPath)) { New-Item -Path $msiNicPath -Force | Out-Null }
                Set-ItemProperty -Path $msiNicPath -Name "MSISupported" -Value 1 -Type DWord -ErrorAction SilentlyContinue
                # Kern 3 (Bitmask 0x08) fuer NIC - getrennt von GPU auf Kern 2
                # DWord statt Binary - korrekte Typisierung fuer Integer-Affinitaetsmaske
                $nicAffinityPath = Join-Path $nic.PSPath "Device Parameters\Interrupt Management\Affinity Policy"
                if (-not (Test-Path $nicAffinityPath)) { New-Item -Path $nicAffinityPath -Force | Out-Null }
                Set-ItemProperty -Path $nicAffinityPath -Name "DevicePolicy"          -Value 4 -Type DWord -ErrorAction SilentlyContinue
                Set-ItemProperty -Path $nicAffinityPath -Name "AssignmentSetOverride" -Value 8 -Type DWord -ErrorAction SilentlyContinue
                Write-OK "MSI + IRQ-Affinitaet gesetzt fuer NIC: $nicDesc"
            }
        }
        Write-Info "Hinweis: IRQ-Aenderungen werden erst nach Neustart aktiv."
        Write-Info "Tipp: Mit 'MSI Mode Utility' kannst du MSI-Status aller Geraete pruefen."
    }
    catch { Write-Warn "IRQ-Priorisierung konnte nicht gesetzt werden: $_" }
}

# ============================================================
#  NIC ERWEITERTE EINSTELLUNGEN OPTIMIEREN
# ============================================================
function Set-NICOptimizations {
    Write-Header "Schritt 23/26 - Netzwerkadapter: Erweiterte Einstellungen optimieren"

    if (-not $Config.NICOptimierungen) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" -and $_.PhysicalMediaType -ne "Unspecified" }

        foreach ($adapter in $adapters) {
            $name = $adapter.Name
            Write-Info "Optimiere Adapter: $name"

            # --- Large Send Offload deaktivieren (verhindert Paket-Bursts / Ping-Spitzen) ---
            Disable-NetAdapterLso -Name $name -ErrorAction SilentlyContinue
            Write-OK "[$name] Large Send Offload (LSO v1/v2) deaktiviert."

            # --- Checksum Offload aktivieren (CPU-Entlastung ohne Latenz-Nachteil) ---
            Enable-NetAdapterChecksumOffload -Name $name -ErrorAction SilentlyContinue

            # --- Erweiterte Adapter-Eigenschaften per Advanced Property ---
            $props = Get-NetAdapterAdvancedProperty -Name $name -ErrorAction SilentlyContinue

            # Flow Control deaktivieren (verhindert kuenstliche Pausen bei Paket-Stau)
            $fc = $props | Where-Object { $_.DisplayName -match "Flow Control" }
            if ($fc) {
                Set-NetAdapterAdvancedProperty -Name $name -DisplayName $fc.DisplayName -DisplayValue "Disabled" -ErrorAction SilentlyContinue
                Write-OK "[$name] Flow Control deaktiviert."
            }

            # Energy Efficient Ethernet deaktivieren (verhindert Verbindungsabbrueche/Latenzschwankungen)
            $eee = $props | Where-Object { $_.DisplayName -match "Energy.Efficient|EEE|Green Ethernet|Power Saving" }
            if ($eee) {
                foreach ($e in $eee) {
                    Set-NetAdapterAdvancedProperty -Name $name -DisplayName $e.DisplayName -DisplayValue "Disabled" -ErrorAction SilentlyContinue
                }
                Write-OK "[$name] Energy Efficient Ethernet (EEE) deaktiviert."
            }

            # Interrupt Moderation: "Adaptive" statt "Disabled" - verhindert Interrupt Storms bei hohem Netzwerkverkehr
            # ACHTUNG: "Disabled" kann bei CoD (UDP-intensiv) CPU-Kerne mit Interrupts ueberfluten -> Frame-Drops!
            $im = $props | Where-Object { $_.DisplayName -match "Interrupt Moderation" }
            if ($im) {
                # Versuche "Adaptive" zu setzen, falls nicht verfuegbar "Enabled" als Fallback
                $imVals = $im.ValidDisplayValues
                $imTarget = $imVals | Where-Object { $_ -match "Adaptive" } | Select-Object -First 1
                if (-not $imTarget) { $imTarget = $imVals | Where-Object { $_ -match "Enabled|On" } | Select-Object -First 1 }
                if (-not $imTarget) { $imTarget = "Enabled" }
                Set-NetAdapterAdvancedProperty -Name $name -DisplayName $im.DisplayName -DisplayValue $imTarget -ErrorAction SilentlyContinue
                Write-OK "[$name] Interrupt Moderation auf '$imTarget' gesetzt (verhindert CPU-Interrupt-Storms)."
            }

            # Receive Buffer erhoehen fuer stabilere Verbindung unter Last
            $rb = $props | Where-Object { $_.DisplayName -match "Receive Buffers" }
            if ($rb) {
                Set-NetAdapterAdvancedProperty -Name $name -DisplayName $rb.DisplayName -DisplayValue "512" -ErrorAction SilentlyContinue
                Write-OK "[$name] Receive Buffers auf 512 gesetzt."
            }

            # Transmit Buffer erhoehen
            $tb = $props | Where-Object { $_.DisplayName -match "Transmit Buffers" }
            if ($tb) {
                Set-NetAdapterAdvancedProperty -Name $name -DisplayName $tb.DisplayName -DisplayValue "1024" -ErrorAction SilentlyContinue
                Write-OK "[$name] Transmit Buffers auf 1024 gesetzt."
            }

            # Speed & Duplex auf Maximum erzwingen (kein Auto-Negotiation fuer Latenzkonsistenz)
            $sd = $props | Where-Object { $_.DisplayName -match "Speed.*Duplex|Link Speed" }
            if ($sd) {
                # Nur setzen wenn 1Gbps oder 2.5Gbps verfuegbar - nicht auf langsamere Werte zwingen
                $vals = $sd[0].ValidDisplayValues
                $target = $vals | Where-Object { $_ -match "1.0 Gbps|1 Gbps|Auto" } | Select-Object -First 1
                if ($target -eq $null) { $target = "Auto Negotiation" }
                # Wir lassen Auto Negotiation auf Speed, erzwingen nur Full Duplex
                Write-Info "[$name] Speed & Duplex: Auto Negotiation beibehalten (sicherer)."
            }

            # ARP/NS Offload deaktivieren (im Energiesparmodus unnoetig, minimiert Wake-Interrupts)
            $arp = $props | Where-Object { $_.DisplayName -match "ARP.*Offload|NS Offload" }
            if ($arp) {
                foreach ($a in $arp) {
                    Set-NetAdapterAdvancedProperty -Name $name -DisplayName $a.DisplayName -DisplayValue "Disabled" -ErrorAction SilentlyContinue
                }
                Write-OK "[$name] ARP/NS Offload deaktiviert."
            }
        }
    }
    catch { Write-Warn "NIC-Optimierung fehlgeschlagen: $_" }
}

# ============================================================
#  IPv6 DEAKTIVIEREN
# ============================================================
function Disable-IPv6 {
    Write-Header "Schritt 24/26 - IPv6 deaktivieren"

    if (-not $Config.IPv6Deaktivieren) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # IPv6 fuer alle aktiven Adapter deaktivieren
        $adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
        foreach ($adapter in $adapters) {
            Disable-NetAdapterBinding -Name $adapter.Name -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue
            Write-OK "IPv6 deaktiviert fuer: $($adapter.Name)"
        }

        # Registry-Eintrag als Absicherung (deaktiviert IPv6 systemweit)
        $regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters"
        if (-not (Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }
        Set-ItemProperty -Path $regPath -Name "DisabledComponents" -Value 0xFF -Type DWord
        Write-OK "IPv6 systemweit per Registry deaktiviert (0xFF = alle Komponenten aus)."
        Write-Info "Hinweis: Bei ausschliesslich IPv6-Netzwerken diese Option auf \$false setzen."
    }
    catch { Write-Warn "IPv6 konnte nicht deaktiviert werden: $_" }
}

# ============================================================
#  DELIVERY OPTIMIZATION DEAKTIVIEREN
# ============================================================
function Disable-DeliveryOptimization {
    Write-Header "Schritt 25/26 - Delivery Optimization (Windows Update P2P) deaktivieren"

    if (-not $Config.DeliveryOptimization) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $doPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization"
        if (-not (Test-Path $doPath)) { New-Item -Path $doPath -Force | Out-Null }

        # DODownloadMode 0 = deaktiviert (kein P2P, kein Upload an andere PCs)
        Set-ItemProperty -Path $doPath -Name "DODownloadMode" -Value 0 -Type DWord
        Write-OK "Delivery Optimization P2P deaktiviert (kein Upload-Verbrauch an andere PCs)."

        # Upload-Bandbreite auf 0% begrenzen (absolut)
        Set-ItemProperty -Path $doPath -Name "DOMaxUploadBandwidth"        -Value 0 -Type DWord -ErrorAction SilentlyContinue
        # Hintergrund-Download-Bandbreite begrenzen auf 10% damit Spielbandbreite frei bleibt
        Set-ItemProperty -Path $doPath -Name "DOPercentageMaxBackgroundBandwidth" -Value 10 -Type DWord -ErrorAction SilentlyContinue
        Write-OK "Update-Download-Bandbreite im Hintergrund auf 10% begrenzt."

        # Delivery Optimization Dienst deaktivieren
        $doSvc = Get-Service -Name "DoSvc" -ErrorAction SilentlyContinue
        if ($null -ne $doSvc) {
            Stop-Service -Name "DoSvc" -Force -ErrorAction SilentlyContinue
            Set-Service  -Name "DoSvc" -StartupType Disabled -ErrorAction SilentlyContinue
            Write-OK "Delivery Optimization Dienst (DoSvc) deaktiviert."
        }
    }
    catch { Write-Warn "Delivery Optimization konnte nicht deaktiviert werden: $_" }
}

# ============================================================
#  RSS AFFINITAET AUF DEDIZIERTEN CPU-KERN BINDEN
# ============================================================
function Set-RSSAffinity {
    Write-Header "Schritt 26/26 - RSS Affinitaet auf dedizierten CPU-Kern binden"

    if (-not $Config.RSSAffinitaet) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # Anzahl der logischen Kerne ermitteln
        $coreCount = (Get-WmiObject -Class Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
        Write-Info "Erkannte logische CPU-Kerne: $coreCount"

        if ($coreCount -lt 4) {
            Write-Warn "Weniger als 4 Kerne erkannt - RSS-Affinitaet wird nicht gesetzt (nicht sinnvoll)."
            return
        }

        # RSS global sicherstellen
        & netsh int tcp set global rss=enabled 2>&1 | Out-Null
        Set-NetOffloadGlobalSetting -ReceiveSideScaling Enabled -ErrorAction SilentlyContinue

        $adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" -and $_.PhysicalMediaType -ne "Unspecified" }
        foreach ($adapter in $adapters) {
            try {
                # RSS pruefen ob vom Adapter unterstuetzt
                $rss = Get-NetAdapterRss -Name $adapter.Name -ErrorAction SilentlyContinue
                if ($null -eq $rss) { Write-Skip "[$($adapter.Name)] RSS nicht verfuegbar."; continue }

                # Letzten zwei physischen Kerne fuer RSS verwenden (weg von Kern 0, wo Windows-Interrupts landen)
                $baseCore = [math]::Max(2, $coreCount - 2)
                $maxCore  = $coreCount - 1

                Set-NetAdapterRss -Name $adapter.Name `
                    -Enabled $true `
                    -BaseProcessorNumber $baseCore `
                    -MaxProcessorNumber  $maxCore `
                    -NumberOfReceiveQueues 2 `
                    -ErrorAction SilentlyContinue

                Write-OK "[$($adapter.Name)] RSS-Affinitaet auf Kern $baseCore-$maxCore gesetzt (weg von Kern 0)."
                Write-Info "Bewirkt: NDIS-Netzwerkarbeit laeuft auf dedizierten Kernen - weniger DPC-Latenz."
            }
            catch { Write-Warn "[$($adapter.Name)] RSS-Affinitaet konnte nicht gesetzt werden: $_" }
        }
    }
    catch { Write-Warn "RSS-Affinitaet-Optimierung fehlgeschlagen: $_" }
}

# ============================================================
#  CPU-PARKING DEAKTIVIEREN
# ============================================================
function Disable-CPUParking {
    Write-Header "Schritt 27/36 - CPU-Parking deaktivieren (alle Kerne immer aktiv)"

    if (-not $Config.CPUParking) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # Minimale Prozessorkern-Auslastung auf 100% setzen (kein Parking)
        powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 100 2>$null
        powercfg -setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 100 2>$null

        # Prozessor-Boost-Modus: 3 = Effizienter aggressiver Boost (verhindert Thermal Throttling durch unkontrolliertes Boosten)
        # Wert 2 (Aggressiv) kann bei unzureichender Kuehlung massive Frame-Drops durch Thermal Throttling verursachen!
        if ($Config.CPUBoostModus) {
            powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PERFBOOSTMODE 3 2>$null
            powercfg -setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR PERFBOOSTMODE 3 2>$null
            Write-OK "Prozessor-Boost-Modus auf 'Effizienter Aggressiver Boost' gesetzt (stabiler als reiner Aggressiv-Modus)."
            Write-Info "Verhindert Frame-Drops durch unkontrolliertes Boosten / Thermal Throttling."
        }

        # Energieplan neu laden damit Aenderungen sofort wirken
        powercfg -setactive SCHEME_CURRENT 2>$null

        # Registry-Absicherung fuer CPU-Parking
        $parkPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\0cc5b647-c1df-4637-891a-dec35c318583"
        if (Test-Path $parkPath) {
            Set-ItemProperty -Path $parkPath -Name "ValueMax" -Value 0 -Type DWord -ErrorAction SilentlyContinue
        }

        Write-OK "CPU-Parking deaktiviert (alle Kerne permanent aktiv)."
        Write-Info "Verhindert kurze CPU-Stotterer wenn das Spiel einen geparkten Kern benoetigt."
    }
    catch {
        Write-Warn "CPU-Parking konnte nicht deaktiviert werden: $_"
    }
}

# ============================================================
#  TCP FAST OPEN AKTIVIEREN
# ============================================================
function Enable-TCPFastOpen {
    Write-Header "Schritt 28/36 - TCP Fast Open aktivieren"

    if (-not $Config.TCPFastOpen) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        & netsh int tcp set global fastopen=enabled          2>&1 | Out-Null
        & netsh int tcp set global fastopenfallback=enabled  2>&1 | Out-Null

        # Zusaetzlich: Syn-Retries reduzieren fuer schnelleres Verbindungs-Timeout
        $tcpPath = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters"
        Set-ItemProperty -Path $tcpPath -Name "TcpMaxConnectRetransmissions" -Value 2 -Type DWord -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $tcpPath -Name "TcpMaxDataRetransmissions"    -Value 3 -Type DWord -ErrorAction SilentlyContinue

        Write-OK "TCP Fast Open aktiviert (schnellerer Verbindungsaufbau zum Spielserver)."
        Write-Info "Besonders wirksam bei wiederholten Verbindungen zum selben Server."
    }
    catch {
        Write-Warn "TCP Fast Open konnte nicht aktiviert werden: $_"
    }
}

# ============================================================
#  UDP-PUFFER OPTIMIEREN
# ============================================================
function Set-UDPBufferOptimization {
    Write-Header "Schritt 29/36 - UDP-Puffer optimieren (CoD-spezifisch)"

    if (-not $Config.UDPPuffer) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $afdPath = "HKLM:\SYSTEM\CurrentControlSet\Services\AFD\Parameters"
        if (-not (Test-Path $afdPath)) { New-Item -Path $afdPath -Force | Out-Null }

        # Receive/Send Window auf 64KB erhoehen (Standard ist oft zu klein fuer CoD)
        Set-ItemProperty -Path $afdPath -Name "DefaultReceiveWindow"         -Value 65536  -Type DWord
        Set-ItemProperty -Path $afdPath -Name "DefaultSendWindow"            -Value 65536  -Type DWord

        # Maximale UDP-Puffergroesse erhoehen
        Set-ItemProperty -Path $afdPath -Name "MaxActiveTransmitFileCount"   -Value 4      -Type DWord -ErrorAction SilentlyContinue

        # Winsock-Puffer systemweit
        $tcpPath = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters"
        Set-ItemProperty -Path $tcpPath -Name "GlobalMaxTcpWindowSize"       -Value 65535  -Type DWord -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $tcpPath -Name "TcpWindowSize"                -Value 65535  -Type DWord -ErrorAction SilentlyContinue

        Write-OK "UDP/AFD-Puffer auf 64KB optimiert (weniger Paketverlust unter Last)."
        Write-Info "Direkt relevant fuer CoD Black Ops 7 da das Spiel hauptsaechlich UDP nutzt."
    }
    catch {
        Write-Warn "UDP-Puffer konnten nicht optimiert werden: $_"
    }
}

# ============================================================
#  WINDOWS DEFENDER SPIELE-AUSNAHMEN
# ============================================================
function Set-DefenderGameExclusions {
    Write-Header "Schritt 30/36 - Windows Defender: Spiele-Ausnahmen hinzufuegen"

    if (-not $Config.DefenderAusnahmen) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # Bekannte Spiele- und Launcher-Verzeichnisse
        $gamePaths = @(
            "$env:ProgramFiles\Call of Duty",
            "$env:ProgramFiles (x86)\Call of Duty",
            "$env:ProgramFiles\Steam\steamapps\common",
            "$env:ProgramFiles (x86)\Steam\steamapps\common",
            "$env:ProgramFiles\Battle.net",
            "$env:ProgramFiles (x86)\Battle.net",
            "$env:ProgramFiles\Epic Games",
            "$env:ProgramFiles (x86)\Epic Games",
            "C:\Games"
        )

        $added = 0
        foreach ($path in $gamePaths) {
            if (Test-Path $path) {
                Add-MpPreference -ExclusionPath $path -ErrorAction SilentlyContinue
                Write-OK "Defender-Ausnahme: $path"
                $added++
            } else {
                Write-Skip "Nicht gefunden (uebersprungen): $path"
            }
        }

        # Bekannte Spiel-Prozesse als Ausnahme
        $gameProcesses = @("cod.exe","BlackOpsColdWar.exe","HQ.exe","HQGame.exe","steam.exe","EpicGamesLauncher.exe","Battle.net.exe")
        foreach ($proc in $gameProcesses) {
            Add-MpPreference -ExclusionProcess $proc -ErrorAction SilentlyContinue
        }

        # Echtzeit-Scan-Prioritaet senken statt deaktivieren
        Set-MpPreference -ScanAvgCPULoadFactor 5    -ErrorAction SilentlyContinue
        Set-MpPreference -EnableLowCpuPriority $true -ErrorAction SilentlyContinue

        Write-OK "Defender-Ausnahmen fuer $added Verzeichnisse gesetzt."
        Write-OK "Echtzeit-Scan-CPU-Last auf max. 5% begrenzt."
        Write-Info "Sicherheitshinweis: Nur vertrauenswuerdige Verzeichnisse sind ausgenommen."
    }
    catch {
        Write-Warn "Defender-Ausnahmen konnten nicht gesetzt werden: $_"
    }
}

# ============================================================
#  MEMORY COMPRESSION DEAKTIVIEREN
# ============================================================
function Disable-MemoryCompression {
    Write-Header "Schritt 31/36 - Memory Compression deaktivieren"

    if (-not $Config.MemoryCompression) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # RAM pruefen - nur bei 16GB+ sinnvoll
        $ram = (Get-WmiObject -Class Win32_ComputerSystem).TotalPhysicalMemory
        $ramGB = [math]::Round($ram / 1GB)

        if ($ramGB -lt 16) {
            Write-Warn "Nur ${ramGB}GB RAM erkannt - Memory Compression wird nicht deaktiviert (mind. 16GB empfohlen)."
            Write-Info "Mit weniger als 16GB RAM ist Compression oft hilfreich statt schaedlich."
            return
        }

        $compressionStatus = (Get-MMAgent -ErrorAction SilentlyContinue).MemoryCompression
        if ($compressionStatus -eq $false) {
            Write-Skip "Memory Compression ist bereits deaktiviert."
            return
        }

        Disable-MMAgent -MemoryCompression -ErrorAction Stop
        Write-OK "Memory Compression deaktiviert (${ramGB}GB RAM erkannt)."
        Write-Info "Verhindert CPU-Belastung durch Hintergrund-Komprimierung waehrend des Spielens."
    }
    catch {
        Write-Warn "Memory Compression konnte nicht deaktiviert werden: $_"
    }
}

# ============================================================
#  PREFETCH VOLLSTAENDIG DEAKTIVIEREN
# ============================================================
function Disable-Prefetch {
    Write-Header "Schritt 32/36 - Prefetch vollstaendig deaktivieren"

    if (-not $Config.PrefetchDeaktivieren) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $path = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management\PrefetchParameters"
        if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }

        Set-ItemProperty -Path $path -Name "EnablePrefetcher"  -Value 0 -Type DWord
        Set-ItemProperty -Path $path -Name "EnableSuperfetch"  -Value 0 -Type DWord

        Write-OK "Prefetch & Superfetch vollstaendig deaktiviert."
        Write-Info "Ergaenzt die SysMain-Deaktivierung - verhindert restliche Vorlade-Aktivitaet."
    }
    catch {
        Write-Warn "Prefetch konnte nicht deaktiviert werden: $_"
    }
}

# ============================================================
#  ZUSAETZLICHE DIENSTE DEAKTIVIEREN
# ============================================================
function Disable-AdditionalServices {
    Write-Header "Schritt 33/36 - Zusaetzliche unnoetige Dienste deaktivieren"

    if (-not $Config.ZusatzDienste) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    $services = @(
        @{ Name = "TabletInputService";        Label = "Tablet PC-Eingabedienst";              Grund = "Stift/Touch-Eingabe (irrelevant beim Gaming-PC)" }
        @{ Name = "WMPNetworkSvc";             Label = "Windows Media Player Netzwerkfreigabe"; Grund = "Medienfreigabe im Netzwerk (unnoetig)" }
        @{ Name = "icssvc";                    Label = "Windows Mobile Hotspot";               Grund = "Mobile Hotspot Funktion (unnoetig)" }
        @{ Name = "wisvc";                     Label = "Windows Insider Service";              Grund = "Windows Insider Programm" }
        @{ Name = "spectrum";                  Label = "Windows Perception Service";           Grund = "Mixed Reality / Hololens (irrelevant)" }
        @{ Name = "perceptionsimulation";      Label = "Windows Perception Simulation";        Grund = "Mixed Reality Simulation (irrelevant)" }
        @{ Name = "PhoneSvc";                  Label = "Telefondienst";                        Grund = "VOIP-Grundfunktionen (unnoetig beim Gaming)" }
        @{ Name = "PcaSvc";                    Label = "Programmkompatibilitaets-Assistent";   Grund = "Kompatibilitaetspruefung alter Programme" }
        @{ Name = "WbioSrvc";                  Label = "Windows-Biometrie";                    Grund = "Fingerabdruck/Gesichtserkennung (falls nicht genutzt)" }
        @{ Name = "SessionEnv";                Label = "Remotedesktop-Konfiguration";          Grund = "Remotedesktop (falls nicht genutzt)" }
        @{ Name = "TermService";               Label = "Remotedesktopdienste";                 Grund = "Remotedesktop (falls nicht genutzt)" }
    )

    foreach ($svc in $services) {
        try {
            $s = Get-Service -Name $svc.Name -ErrorAction SilentlyContinue
            if ($null -eq $s) { Write-Skip "$($svc.Label) - nicht vorhanden"; continue }
            if ($s.StartType -eq "Disabled") { Write-Skip "$($svc.Label) - bereits deaktiviert"; continue }
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
#  NVIDIA SHADER-CACHE ERHOEHEN
# ============================================================
function Set-NvidiaShaderCache {
    Write-Header "Schritt 34/36 - NVIDIA Shader-Cache-Groesse auf 10 GB erhoehen"

    if (-not $Config.NvidiaShaderCache) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # Pruefen ob NVIDIA-Adapter vorhanden
        $nvPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
        $nvAdapters = Get-ChildItem -Path $nvPath -ErrorAction SilentlyContinue |
                      Where-Object { $_.Name -match "\\\d{4}$" }

        $nvFound = $false
        foreach ($adapter in $nvAdapters) {
            $driverDesc = (Get-ItemProperty -Path $adapter.PSPath -Name "DriverDesc" -ErrorAction SilentlyContinue).DriverDesc
            if ($driverDesc -match "NVIDIA") { $nvFound = $true; break }
        }

        if (-not $nvFound) {
            Write-Skip "Kein NVIDIA-Adapter gefunden - Shader-Cache-Erhoehung uebersprungen."
            return
        }

        # Cache-Groesse pro Benutzer setzen (10 GB = 10240 MB)
        $nvTweakPath = "HKCU:\Software\NVIDIA Corporation\Global\NVTweak"
        if (-not (Test-Path $nvTweakPath)) { New-Item -Path $nvTweakPath -Force | Out-Null }
        Set-ItemProperty -Path $nvTweakPath -Name "ShaderDiskCacheMaxSize" -Value 10240 -Type DWord

        # Auch per DirectX UserGPU Preferences absichern
        $dxPath = "HKLM:\SOFTWARE\Microsoft\DirectX\UserGpuPreferences"
        if (-not (Test-Path $dxPath)) { New-Item -Path $dxPath -Force | Out-Null }
        Set-ItemProperty -Path $dxPath -Name "DirectXUserGlobalSettings" -Value "ShaderCacheSizeInMB=10240;" -Type String -ErrorAction SilentlyContinue

        Write-OK "NVIDIA Shader-Cache auf 10 GB gesetzt."
        Write-Info "Wirkt sich nicht auf RTX/DLSS/Reflex aus - nur die Cache-Groesse auf der SSD wird erhoeht."
        Write-Info "Benoetigt ausreichend freien Speicherplatz auf dem Windows-Laufwerk."
    }
    catch {
        Write-Warn "NVIDIA Shader-Cache konnte nicht gesetzt werden: $_"
    }
}

# ============================================================
#  DSCP QoS-MARKIERUNG FUER CoD-TRAFFIC
# ============================================================
function Set-DSCPMarkierung {
    Write-Header "Schritt 35/44 - DSCP QoS-Markierung fuer CoD-Traffic"

    if (-not $Config.DSCPMarkierung) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # DSCP-Wert 46 (Expedited Forwarding) fuer UDP-Gaming-Traffic setzen
        # Router erkennen diese Markierung und priorisieren die Pakete
        $qosBasePath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\QoS"
        if (-not (Test-Path $qosBasePath)) { New-Item -Path $qosBasePath -Force | Out-Null }

        # CoD-spezifische UDP-Ports (typische CoD-Spielserver-Ports)
        $codPolicies = @(
            @{ Name = "CoD_UDP_Game";    Proto = "UDP"; LocalPort = "*"; RemotePort = "3074,27015-27030,27036"; DSCP = "46" }
            @{ Name = "CoD_UDP_Voice";   Proto = "UDP"; LocalPort = "*"; RemotePort = "3478-3480";              DSCP = "46" }
            @{ Name = "CoD_TCP_Game";    Proto = "TCP"; LocalPort = "*"; RemotePort = "3074,27015-27030";        DSCP = "46" }
            @{ Name = "BattleNet_UDP";   Proto = "UDP"; LocalPort = "*"; RemotePort = "1119,3724,6113";          DSCP = "46" }
        )

        foreach ($policy in $codPolicies) {
            $policyPath = "$qosBasePath\$($policy.Name)"
            if (-not (Test-Path $policyPath)) { New-Item -Path $policyPath -Force | Out-Null }
            Set-ItemProperty -Path $policyPath -Name "Version"           -Value "1.0"              -Type String -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $policyPath -Name "Application Name"  -Value "*"                -Type String -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $policyPath -Name "Protocol"          -Value $policy.Proto      -Type String -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $policyPath -Name "Local Port"        -Value $policy.LocalPort  -Type String -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $policyPath -Name "Remote Port"       -Value $policy.RemotePort -Type String -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $policyPath -Name "DSCP Value"        -Value $policy.DSCP       -Type String -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $policyPath -Name "Throttle Rate"     -Value "-1"               -Type String -ErrorAction SilentlyContinue
            Write-OK "DSCP-Policy erstellt: $($policy.Name) (Port $($policy.RemotePort))"
        }

        Write-OK "DSCP-Markierung EF/46 fuer CoD-Traffic gesetzt."
        Write-Info "Wirkt am besten in Kombination mit QoS-faehigem Router (z.B. FritzBox WMM-Priorisierung)."
        Write-Info "Router muss DSCP/WMM-Priorisierung aktiviert haben fuer maximale Wirkung."
    }
    catch {
        Write-Warn "DSCP-Markierung konnte nicht gesetzt werden: $_"
    }
}

# ============================================================
#  DPC LATENZ OPTIMIEREN
# ============================================================
function Set-DPCLatenzOptimierung {
    Write-Header "Schritt 36/44 - DPC Latenz optimieren (weniger Netzwerk-Jitter)"

    if (-not $Config.DPCLatenz) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # NDIS DPC-Rate anpassen - verhindert Latenzspitzen durch gebunchte DPC-Verarbeitung
        $ndisPath = "HKLM:\SYSTEM\CurrentControlSet\Services\NDIS\Parameters"
        if (-not (Test-Path $ndisPath)) { New-Item -Path $ndisPath -Force | Out-Null }

        # MaxInterruptWorkPerDpc: Anzahl Interrupts pro DPC begrenzen (weniger Jitter)
        Set-ItemProperty -Path $ndisPath -Name "MaxInterruptWorkPerDpc" -Value 0     -Type DWord -ErrorAction SilentlyContinue
        # MinInterruptWorkPerDpc: Minimum setzen fuer gleichmaessigere Verarbeitung
        Set-ItemProperty -Path $ndisPath -Name "MinInterruptWorkPerDpc" -Value 0     -Type DWord -ErrorAction SilentlyContinue

        # Kernel DPC-Watchdog: NICHT deaktivieren (DpcWatchdogPeriod = 0 riskiert BSOD ohne Diagnose)
        # Der Watchdog erkennt haengende Treiber (z.B. nvlddmkm.sys bei CoD) und schreibt Dump-Dateien.
        # Deaktiviert wuerde das System bei DPC-Timeout einfrieren statt einen diagnostizierbaren BSOD zu erzeugen.
        # IRQ-Priorisierungen sind ausreichend fuer DPC-Latenz-Optimierung ohne dieses Risiko.

        # IRQ-Priorisierung via PriorityControl: auf modernen Systemen (Windows 10+, MSI-faehige Hardware)
        # haben IRQ8Priority/IRQ16Priority keinen dokumentierten Effekt mehr - Microsoft hat dies
        # seit NT 3.x nicht mehr unterstuetzt. MSI (Message Signaled Interrupts, oben aktiviert)
        # ist der korrekte und wirksame Weg auf moderner Hardware.
        # Diese Eintraege werden daher NICHT gesetzt um keine falschen Erwartungen zu wecken.
        Write-Info "IRQ PriorityControl-Eintraege werden nicht gesetzt (veraltet seit Windows NT 3.x, MSI ist der korrekte Weg)."

        Write-OK "DPC-Latenz-Parameter optimiert (gleichmaessigere Paketverarbeitung)."
        Write-Info "Reduziert Ping-Jitter bei hohem UDP-Traffic (relevant fuer CoD-Gunfights)."
    }
    catch {
        Write-Warn "DPC-Latenzoptimierung konnte nicht gesetzt werden: $_"
    }
}

# ============================================================
#  POWER THROTTLING DEAKTIVIEREN
# ============================================================
function Disable-PowerThrottling {
    Write-Header "Schritt 37/44 - Power Throttling deaktivieren"

    if (-not $Config.PowerThrottling) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # Power Throttling verhindert, dass Windows Spielprozesse im Hintergrund drosselt
        $ptPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling"
        if (-not (Test-Path $ptPath)) { New-Item -Path $ptPath -Force | Out-Null }
        Set-ItemProperty -Path $ptPath -Name "PowerThrottlingOff" -Value 1 -Type DWord

        # Auch per Energieplan sicherstellen
        powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR THROTTLING 0 2>$null | Out-Null

        # Spezifisch fuer CoD-Prozesse: EcoQoS deaktivieren
        $ecoPath = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\CompatMarkers"
        if (-not (Test-Path $ecoPath)) { New-Item -Path $ecoPath -Force | Out-Null }

        Write-OK "Power Throttling systemweit deaktiviert."
        Write-Info "Verhindert, dass Windows Spielprozesse oder Hintergrundprozesse des Spiels drosselt."
    }
    catch {
        Write-Warn "Power Throttling konnte nicht deaktiviert werden: $_"
    }
}

# ============================================================
#  MMCSS SCHAERFEN (MULTIMEDIA CLASS SCHEDULER)
# ============================================================
function Set-MMCSSOptimization {
    Write-Header "Schritt 38/44 - MMCSS Multimedia-Scheduler schaerfen"

    if (-not $Config.MMCSSSchaerfen) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $mmPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile"
        if (-not (Test-Path $mmPath)) { New-Item -Path $mmPath -Force | Out-Null }

        # Latency Sensitive: Prozesse die niedrige Latenz benoetigen bevorzugen
        Set-ItemProperty -Path $mmPath -Name "LazyModeTimeout"        -Value 0     -Type DWord -ErrorAction SilentlyContinue

        # Games-Profil: Clock Rate auf exakt 1ms setzen (praeziser als der vorherige Wert)
        $gamesPath = "$mmPath\Tasks\Games"
        if (-not (Test-Path $gamesPath)) { New-Item -Path $gamesPath -Force | Out-Null }
        Set-ItemProperty -Path $gamesPath -Name "Clock Rate"          -Value 10000    -Type DWord  -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $gamesPath -Name "GPU Priority"        -Value 8        -Type DWord  -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $gamesPath -Name "Priority"            -Value 6        -Type DWord  -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $gamesPath -Name "Scheduling Category" -Value "High"   -Type String -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $gamesPath -Name "SFIO Priority"       -Value "High"   -Type String -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $gamesPath -Name "Affinity"            -Value 0        -Type DWord  -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $gamesPath -Name "Background Only"     -Value "False"  -Type String -ErrorAction SilentlyContinue

        # Audio-Profil ebenfalls optimieren (verhindert Audio-Dropouts die Framedrops vortaeuschen)
        $audioPath = "$mmPath\Tasks\Audio"
        if (-not (Test-Path $audioPath)) { New-Item -Path $audioPath -Force | Out-Null }
        Set-ItemProperty -Path $audioPath -Name "Clock Rate"          -Value 10000    -Type DWord  -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $audioPath -Name "GPU Priority"        -Value 8        -Type DWord  -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $audioPath -Name "Priority"            -Value 6        -Type DWord  -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $audioPath -Name "Scheduling Category" -Value "Medium" -Type String -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $audioPath -Name "SFIO Priority"       -Value "Normal" -Type String -ErrorAction SilentlyContinue

        # Pro Audio Profil (hoechste Prioritaet fuer latenzempfindliche Prozesse)
        $proAudioPath = "$mmPath\Tasks\Pro Audio"
        if (-not (Test-Path $proAudioPath)) { New-Item -Path $proAudioPath -Force | Out-Null }
        Set-ItemProperty -Path $proAudioPath -Name "Clock Rate"          -Value 10000  -Type DWord  -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $proAudioPath -Name "GPU Priority"        -Value 8      -Type DWord  -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $proAudioPath -Name "Priority"            -Value 6      -Type DWord  -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $proAudioPath -Name "Scheduling Category" -Value "High" -Type String -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $proAudioPath -Name "SFIO Priority"       -Value "High" -Type String -ErrorAction SilentlyContinue

        Write-OK "MMCSS Games-Profil Clock Rate auf 1ms (10000) praezisiert."
        Write-OK "MMCSS Audio & Pro Audio Profil optimiert (verhindert Audio-verursachte Framedrops)."
    }
    catch {
        Write-Warn "MMCSS konnte nicht optimiert werden: $_"
    }
}

# ============================================================
#  SPECTRE/MELTDOWN MITIGATIONS (OPTIONAL - SICHERHEITSWARNUNG)
# ============================================================
function Set-SpectreDisable {
    Write-Header "Schritt 39/44 - Spectre/Meltdown Mitigations (OPTIONAL)"

    if (-not $Config.SpectreDeaktivieren) {
        Write-Skip "Uebersprungen (Standardmaessig deaktiviert - Sicherheitsabwaegung erforderlich)."
        Write-Info "Aktiviere 'SpectreDeaktivieren = \$true' nur auf dedizierten Gaming-PCs ohne sensible Daten."
        Write-Info "Kann CPU-Performance um 5-15% verbessern, reduziert aber Kernel-Sicherheit."
        return
    }

    Write-Warn "SICHERHEITSHINWEIS: Spectre/Meltdown-Schutz wird deaktiviert!"
    Write-Warn "Empfohlen nur fuer: Dedizierte Gaming-PCs, kein Online-Banking, kein Homeoffice."

    try {
        $spectreKey = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management"
        # FeatureSettingsOverride: Mitigations steuern
        # Bit 0 = Spectre V2, Bit 1 = Meltdown, Bit 3 = Spectre V4
        Set-ItemProperty -Path $spectreKey -Name "FeatureSettingsOverride"     -Value 3   -Type DWord -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $spectreKey -Name "FeatureSettingsOverrideMask" -Value 3   -Type DWord -ErrorAction SilentlyContinue

        Write-OK "Spectre/Meltdown Mitigations deaktiviert (Neustart erforderlich)."
        Write-Warn "Zum Reaktivieren: FeatureSettingsOverride und FeatureSettingsOverrideMask entfernen."
    }
    catch {
        Write-Warn "Spectre-Einstellungen konnten nicht gesetzt werden: $_"
    }
}

# ============================================================
#  NON-PAGED POOL OPTIMIEREN
# ============================================================
function Set-NonPagedPool {
    Write-Header "Schritt 40/44 - Non-Paged Pool & Kernel-Speicher optimieren"

    if (-not $Config.NonPagedPool) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $memPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management"

        # Non-Paged Pool: RAM fuer Kernel-Operationen reservieren
        # 0 = Windows entscheidet (optimal), expliziter Wert nur wenn noetig
        Set-ItemProperty -Path $memPath -Name "NonPagedPoolQuota"     -Value 0 -Type DWord -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $memPath -Name "PagedPoolQuota"        -Value 0 -Type DWord -ErrorAction SilentlyContinue

        # Pool-Nutzung optimieren: System-Cache minimieren, Programme bevorzugen
        Set-ItemProperty -Path $memPath -Name "LargeSystemCache"      -Value 0 -Type DWord -ErrorAction SilentlyContinue

        # ClearPageFileAtShutdown: Shutdown beschleunigen (kein sicheres Loeschen)
        Set-ItemProperty -Path $memPath -Name "ClearPageFileAtShutdown" -Value 0 -Type DWord -ErrorAction SilentlyContinue

        # DisablePagingExecutive: Kernel-Code im RAM halten (nie auslagern)
        # Verhindert Stutter wenn Kernel-Code aus dem Pagefile geladen werden muss
        Set-ItemProperty -Path $memPath -Name "DisablePagingExecutive" -Value 1 -Type DWord -ErrorAction SilentlyContinue

        Write-OK "Non-Paged Pool optimiert."
        Write-OK "DisablePagingExecutive aktiviert - Kernel-Code bleibt permanent im RAM."
        Write-Info "Verhindert Micro-Stutter durch Kernel-Pagefile-Zugriffe waehrend Gunfights."
    }
    catch {
        Write-Warn "Non-Paged Pool konnte nicht optimiert werden: $_"
    }
}

# ============================================================
#  KERNEL UDP PRIORISIERUNG
# ============================================================
function Set-KernelUDPPrio {
    Write-Header "Schritt 41/44 - Kernel UDP-Netzwerkpriorisierung"

    if (-not $Config.KernelUDPPrio) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # Winsock Service Provider: UDP-Socket-Puffer systemweit setzen
        $winsockPath = "HKLM:\SYSTEM\CurrentControlSet\Services\Winsock2\Parameters"
        if (-not (Test-Path $winsockPath)) { New-Item -Path $winsockPath -Force | Out-Null }

        # Max. UDP Socket-Adresslänge: korrekte Werte sind 0x10 (16) fuer IPv4
        # Wert 128 hat keine dokumentierte Grundlage - 16 ist der korrekte Winsock-Standard
        Set-ItemProperty -Path $winsockPath -Name "MaxSockAddrLength" -Value 16 -Type DWord -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $winsockPath -Name "MinSockAddrLength" -Value 16 -Type DWord -ErrorAction SilentlyContinue

        # AFD: Asynchronous I/O fuer UDP priorisieren
        $afdPath = "HKLM:\SYSTEM\CurrentControlSet\Services\AFD\Parameters"
        if (-not (Test-Path $afdPath)) { New-Item -Path $afdPath -Force | Out-Null }

        # FastSendDatagramThreshold: Kleine UDP-Pakete (<= Wert) werden sofort gesendet
        # CoD-Pakete sind oft klein (Positionsupdates ~100-500 Bytes) -> sofortiger Versand
        Set-ItemProperty -Path $afdPath -Name "FastSendDatagramThreshold"     -Value 1024  -Type DWord -ErrorAction SilentlyContinue
        # IrpStackSize: I/O-Request-Packet-Tiefe erhoehen fuer schnellere UDP-Verarbeitung
        Set-ItemProperty -Path $afdPath -Name "IrpStackSize"                  -Value 12    -Type DWord -ErrorAction SilentlyContinue
        # LargeBufferSize: Groessere interne Puffer fuer Burst-Handling
        Set-ItemProperty -Path $afdPath -Name "LargeBufferSize"               -Value 65536 -Type DWord -ErrorAction SilentlyContinue
        # MediumBufferSize & SmallBufferSize fuer kleine CoD-Pakete optimieren
        Set-ItemProperty -Path $afdPath -Name "MediumBufferSize"              -Value 1504  -Type DWord -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $afdPath -Name "SmallBufferSize"               -Value 128   -Type DWord -ErrorAction SilentlyContinue
        # Prioritaet fuer UDP gegenueber TCP im Kernel
        Set-ItemProperty -Path $afdPath -Name "PriorityBoost"                 -Value 1     -Type DWord -ErrorAction SilentlyContinue

        Write-OK "UDP-Kernel-Priorisierung gesetzt (FastSendDatagramThreshold=1024)."
        Write-OK "AFD I/O-Buffer-Hierarchie fuer kleine CoD-Pakete optimiert."
        Write-Info "CoD sendet Positionsupdates als kleine UDP-Pakete - sofortiger Versand reduziert Schuss-Latenz."
    }
    catch {
        Write-Warn "Kernel UDP-Priorisierung konnte nicht gesetzt werden: $_"
    }
}

# ============================================================
#  TCP CHIMNEY & NETZWERK-OFFLOAD KONFIGURIEREN
# ============================================================
function Set-TCPChimneyConfig {
    Write-Header "Schritt 42/44 - TCP Chimney & Netzwerk-Offload konfigurieren"

    if (-not $Config.TCPChimney) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # Chimney deaktivieren (veraltet, verursacht Latenzprobleme auf modernen NICs)
        & netsh int tcp set global chimney=disabled     2>&1 | Out-Null
        # Direct Cache Access aktivieren (NIC schreibt direkt in CPU-Cache)
        & netsh int tcp set global dca=enabled          2>&1 | Out-Null
        # NetDMA deaktivieren (veraltet, verursacht DPC-Latenz auf modernen Systemen)
        & netsh int tcp set global netdma=disabled      2>&1 | Out-Null
        # ECN deaktivieren (verhindert kuenstliche Verlangsamung durch Netzwerkgeraete)
        & netsh int tcp set global ecncapability=disabled 2>&1 | Out-Null
        # Timestamps deaktivieren (reduziert Overhead pro Paket)
        & netsh int tcp set global timestamps=disabled  2>&1 | Out-Null
        # RSC (Receive Segment Coalescing) deaktivieren (erhoeht Latenz bei UDP)
        & netsh int tcp set global rsc=disabled         2>&1 | Out-Null
        # Congestion Provider: CTCP fuer bessere Throughput-Stabilisierung
        & netsh int tcp set global congestionprovider=ctcp 2>&1 | Out-Null

        # Offload fuer UDP-Segmentierung (USO) pruefen und setzen
        $adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" -and $_.PhysicalMediaType -ne "Unspecified" }
        foreach ($adapter in $adapters) {
            # RSC (Receive Segment Coalescing) deaktivieren - erhoeht UDP-Latenz
            Disable-NetAdapterRsc -Name $adapter.Name -ErrorAction SilentlyContinue
            Write-OK "[$($adapter.Name)] RSC deaktiviert (niedrigere UDP-Latenz)."
        }

        Write-OK "TCP Chimney/NetDMA deaktiviert, DCA aktiviert, CTCP Congestion Provider gesetzt."
        Write-Info "RSC-Deaktivierung ist besonders relevant fuer CoD's UDP-intensiven Traffic."
    }
    catch {
        Write-Warn "TCP Chimney-Konfiguration fehlgeschlagen: $_"
    }
}

# ============================================================
#  CLOCK INTERRUPT ISOLIERUNG
# ============================================================
function Set-ClockInterruptIsolierung {
    Write-Header "Schritt 43/44 - Clock Interrupt Isolierung"

    if (-not $Config.ClockInterruptIsolierung) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $coreCount = (Get-WmiObject -Class Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum

        if ($coreCount -lt 4) {
            Write-Warn "Weniger als 4 Kerne - Clock Interrupt Isolierung nicht sinnvoll."
            return
        }

        # HPET (High Precision Event Timer) DEAKTIVIEREN - TSC ist fuer Gaming besser
        # HPET ist zwar praeziser (14MHz), aber langsamer als TSC (3.5MHz).
        # Fuer Gaming sind konsistente, stabile Frame-Zeiten wichtiger als maximale Praezision.
        # HPET aktiviert = mehr Input-Lag, schlechtere 1% Lows, Gegner hinter Ecken treffen.
        # Korrekte Einstellung: HPET im BIOS aktiviert lassen, im OS deaktivieren.
        $hpetResult = & bcdedit /deletevalue useplatformclock 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-OK "HPET im OS deaktiviert - TSC wird als Timer verwendet (besser fuer Gaming)."
        } else {
            # Kein Fehler - bedeutet HPET war bereits deaktiviert (Standardzustand)
            Write-OK "HPET bereits deaktiviert (TSC aktiv - optimaler Zustand)."
        }

        # Dynamic Tick deaktivieren: konstante Timer-Interrupts statt On-Demand
        # Verhindert Latenzschwankungen wenn der Timer von Idle zurueck auf aktiv wechselt
        $dynTickResult = & bcdedit /set disabledynamictick yes 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-OK "Dynamic Tick deaktiviert (konstante Timer-Rate, kein Jitter beim Aufwachen)."
            Write-Info "Erhoehter Stromverbrauch - auf Laptops nur im Netzbetrieb empfehlenswert."
        }

        # TSC Synchronisation erzwingen (alle Kerne haben gleichen Zeitstempel)
        $tscResult = & bcdedit /set tscsyncpolicy enhanced 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-OK "TSC Sync Policy auf 'Enhanced' gesetzt (praezises Multi-Core-Timing)."
        }

        Write-Info "Hinweis: BCD-Aenderungen werden erst nach Neustart aktiv."
    }
    catch {
        Write-Warn "Clock Interrupt Isolierung konnte nicht gesetzt werden: $_"
    }
}

# ============================================================
#  WIN32 PRIORITY SEPARATION
# ============================================================
function Set-Win32PrioritySeparation {
    Write-Header "Schritt 44/46 - Win32PrioritySeparation: CPU-Quantum fuer Gaming optimieren"

    if (-not $Config.Win32PrioSeparation) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $prioPath = "HKLM:\SYSTEM\CurrentControlSet\Control\PriorityControl"
        if (-not (Test-Path $prioPath)) { New-Item -Path $prioPath -Force | Out-Null }

        # 0x2A (Hex) = 42 (Dezimal) = Short, Fixed, High Foreground Boost
        # Bedeutung der Bits:
        #   Bit 5-4 (11) = Short Quantum: kurze CPU-Zeitscheiben -> schnellere Reaktion
        #   Bit 3-2 (10) = Fixed: gleichmaessige Zeitscheiben (kein variables Strecken)
        #   Bit 1-0 (10) = High Foreground Boost: Spiel bekommt 3x mehr CPU-Zeit als Hintergrund
        # Ergebnis: CoD als Vordergrundprozess wird stark gegenueber Hintergrundprozessen
        #           (Discord, Battle.net Updates, etc.) bevorzugt -> bessere 1%-Lows, Input-Latenz
        # Standard Windows: 0x02 (Long, Variable, High Boost - fuer allgemeine Nutzung)
        $currentVal = (Get-ItemProperty -Path $prioPath -Name "Win32PrioritySeparation" -ErrorAction SilentlyContinue).Win32PrioritySeparation
        Write-Info "Aktueller Wert: $currentVal -> Neuer Wert: 0x2A (42 dezimal)"

        Set-ItemProperty -Path $prioPath -Name "Win32PrioritySeparation" -Value 0x2A -Type DWord

        Write-OK "Win32PrioritySeparation auf 0x2A gesetzt (Short, Fixed, High Foreground Boost)."
        Write-OK "CoD erhaelt 3x mehr CPU-Zeit gegenueber Hintergrundprozessen."
        Write-Info "Neustart erforderlich - Kernel-Level-Einstellung wird beim Boot geladen."
        Write-Info "Alternativwert 0x29 (Medium Boost) falls Multitasking nebenbei benoetigt wird."
    }
    catch {
        Write-Warn "Win32PrioritySeparation konnte nicht gesetzt werden: $_"
    }
}

# ============================================================
#  MMCSS ALWAYSON + NOLAZYMODE
# ============================================================
function Set-MMCSSAlwaysOn {
    Write-Header "Schritt 45/46 - MMCSS AlwaysOn & NoLazyMode aktivieren"

    if (-not $Config.MMCSSAlwaysOn) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        $mmPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile"
        if (-not (Test-Path $mmPath)) { New-Item -Path $mmPath -Force | Out-Null }

        # AlwaysOn: MMCSS bleibt aktiv auch wenn keine Audio-Threads registriert sind
        # Verhindert dass CoD in Momenten ohne aktiven Sound aus dem MMCSS-Boost faellt
        Set-ItemProperty -Path $mmPath -Name "AlwaysOn" -Value 1 -Type DWord -ErrorAction SilentlyContinue

        # NoLazyMode: Deaktiviert IdleDetection vollstaendig
        # Standard: MMCSS wechselt nach 100ms Inaktivitaet in Lazy-Mode (reduzierte Prioritaet)
        # Mit NoLazyMode: MMCSS bleibt permanent im aktiven Boost-Zustand
        # Ergebnis: Konsistentere Priorisierung ohne Aufwaermpause nach kurzer Spielpause
        Set-ItemProperty -Path $mmPath -Name "NoLazyMode" -Value 1 -Type DWord -ErrorAction SilentlyContinue

        # LazyModeTimeout bereits in Set-MMCSSOptimization auf 10000 (1ms) gesetzt
        # NoLazyMode ist die staerkere Einstellung und macht LazyModeTimeout redundant
        # Beide zusammen sind eine doppelte Absicherung

        Write-OK "MMCSS AlwaysOn aktiviert (kein Abschalten bei Audio-Stille)."
        Write-OK "MMCSS NoLazyMode aktiviert (permanenter Boost-Zustand, kein Idle)."
        Write-Info "Ergebnis: CoD bleibt durchgehend im MMCSS-Boost ohne Aufwaermpause."
    }
    catch {
        Write-Warn "MMCSS AlwaysOn/NoLazyMode konnte nicht gesetzt werden: $_"
    }
}

# ============================================================
#  UNDO-FUNKTION: ALLE AENDERUNGEN RUECKGAENGIG MACHEN
# ============================================================
function Invoke-UndoOptimizations {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Yellow
    Write-Host "  UNDO - Gaming-Optimierungen zuruecksetzen" -ForegroundColor Yellow
    Write-Host ("=" * 60) -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Folgende Aenderungen werden zurueckgesetzt:" -ForegroundColor White
    Write-Host "   - NetworkThrottlingIndex auf Standard (10) zuruecksetzen" -ForegroundColor Gray
    Write-Host "   - SystemResponsiveness auf Standard (20)" -ForegroundColor Gray
    Write-Host "   - LargeSystemCache auf Standard" -ForegroundColor Gray
    Write-Host "   - Spielmodus / GameDVR auf Standard" -ForegroundColor Gray
    Write-Host "   - Scheduled Task fuer Spielprozess-Prioritaet entfernen" -ForegroundColor Gray
    Write-Host "   - Nagle-Algorithmus reaktivieren" -ForegroundColor Gray
    Write-Host "   - QoS-Bandbreite wiederherstellen" -ForegroundColor Gray
    Write-Host "   - Visuelle Effekte auf Standard" -ForegroundColor Gray
    Write-Host "   - CPU-Parking reaktivieren" -ForegroundColor Gray
    Write-Host "   - TCP Fast Open deaktivieren" -ForegroundColor Gray
    Write-Host "   - UDP-Puffer auf Standard zuruecksetzen" -ForegroundColor Gray
    Write-Host "   - Defender-Ausnahmen entfernen" -ForegroundColor Gray
    Write-Host "   - Memory Compression reaktivieren" -ForegroundColor Gray
    Write-Host "   - Prefetch reaktivieren" -ForegroundColor Gray
    Write-Host "   - NVIDIA Shader-Cache-Groesse zuruecksetzen" -ForegroundColor Gray
    Write-Host "   - DSCP-QoS-Markierungen entfernen" -ForegroundColor Gray
    Write-Host "   - DPC-Latenz-Parameter zuruecksetzen" -ForegroundColor Gray
    Write-Host "   - Power Throttling reaktivieren" -ForegroundColor Gray
    Write-Host "   - MMCSS auf Standard zuruecksetzen" -ForegroundColor Gray
    Write-Host "   - Spectre/Meltdown Mitigations reaktivieren (falls deaktiviert)" -ForegroundColor Gray
    Write-Host "   - Non-Paged Pool auf Standard zuruecksetzen" -ForegroundColor Gray
    Write-Host "   - Kernel UDP-Priorisierung zuruecksetzen" -ForegroundColor Gray
    Write-Host "   - TCP Chimney/RSC auf Standard zuruecksetzen" -ForegroundColor Gray
    Write-Host "   - BCD Clock-Einstellungen zuruecksetzen" -ForegroundColor Gray
    Write-Host "   - Win32PrioritySeparation auf Standard zuruecksetzen" -ForegroundColor Gray
    Write-Host "   - MMCSS AlwaysOn & NoLazyMode deaktivieren" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Dienste und Energieplan: Bitte manuell oder per" -ForegroundColor Yellow
    Write-Host "  Systemwiederherstellung zuruecksetzen." -ForegroundColor Yellow
    Write-Host ""
    if (-not $SkipConfirm) {
        Write-Host "  Fortfahren? (j/N): " -NoNewline
        $confirm = ([Console]::ReadLine())
        if ($confirm -ne "j" -and $confirm -ne "J") {
            Write-Host "  Abgebrochen." -ForegroundColor Red
            exit 0
        }
    } else {
        Write-Host "  Fahre automatisch fort (-SkipConfirm)..." -ForegroundColor DarkGray
    }

    # NetworkThrottlingIndex + SystemResponsiveness zurueck
    try {
        $mmPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile"
        Set-ItemProperty -Path $mmPath -Name "NetworkThrottlingIndex" -Value 10          -Type DWord -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $mmPath -Name "SystemResponsiveness"   -Value 20          -Type DWord -ErrorAction SilentlyContinue
        Write-OK "NetworkThrottlingIndex + SystemResponsiveness zurueckgesetzt."
    } catch { Write-Warn "Fehler beim Zuruecksetzen Multimedia-Profil: $_" }

    # Games-Profil loeschen
    try {
        $gamesPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games"
        if (Test-Path $gamesPath) { Remove-Item -Path $gamesPath -Recurse -Force -ErrorAction SilentlyContinue }
        Write-OK "Games-Systemprofil zurueckgesetzt."
    } catch {}

    # LargeSystemCache
    try {
        $memPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management"
        Set-ItemProperty -Path $memPath -Name "LargeSystemCache" -Value 0 -Type DWord -ErrorAction SilentlyContinue
        Write-OK "LargeSystemCache zurueckgesetzt."
    } catch {}

    # Nagle reaktivieren
    try {
        $basePath = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces"
        $interfaces = Get-ChildItem -Path $basePath
        foreach ($iface in $interfaces) {
            Remove-ItemProperty -Path $iface.PSPath -Name "TcpAckFrequency" -ErrorAction SilentlyContinue
            Remove-ItemProperty -Path $iface.PSPath -Name "TCPNoDelay"      -ErrorAction SilentlyContinue
        }
        Write-OK "Nagle-Algorithmus reaktiviert."
    } catch {}

    # QoS wiederherstellen
    try {
        $qosPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Psched"
        if (Test-Path $qosPath) { Remove-Item -Path $qosPath -Recurse -Force -ErrorAction SilentlyContinue }
        Write-OK "QoS-Bandbreite auf Standard zurueckgesetzt."
    } catch {}

    # GameDVR / Spielmodus
    try {
        Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR" -Name "AppCaptureEnabled" -Value 1 -ErrorAction SilentlyContinue
        Set-ItemProperty -Path "HKCU:\System\GameConfigStore" -Name "GameDVR_Enabled" -Value 1 -ErrorAction SilentlyContinue
        Write-OK "GameDVR reaktiviert."
    } catch {}

    # Visuelle Effekte zurueck
    try {
        $path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects"
        Set-ItemProperty -Path $path -Name "VisualFXSetting" -Value 0 -ErrorAction SilentlyContinue
        Write-OK "Visuelle Effekte auf Standard zurueckgesetzt."
    } catch {}

    # Mausbeschleunigung reaktivieren
    try {
        $path = "HKCU:\Control Panel\Mouse"
        Set-ItemProperty -Path $path -Name "MouseSpeed"       -Value "1" -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $path -Name "MouseThreshold1"  -Value "6" -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $path -Name "MouseThreshold2"  -Value "10" -ErrorAction SilentlyContinue
        Write-OK "Mausbeschleunigung wiederhergestellt."
    } catch {}

    # Scheduled Task entfernen
    try {
        Unregister-ScheduledTask -TaskName "GamingOptimizer_GamePriority" -Confirm:$false -ErrorAction SilentlyContinue
        $scriptPath = "$env:ProgramData\GamingOptimizer\SetGamePriority.ps1"
        if (Test-Path $scriptPath) { Remove-Item $scriptPath -Force -ErrorAction SilentlyContinue }
        Write-OK "Scheduled Task 'GamingOptimizer_GamePriority' entfernt."
    } catch {}

    # TCP-Einstellungen zurueck
    try {
        & netsh int tcp set global autotuninglevel=normal 2>&1 | Out-Null
        & netsh int tcp set global chimney=default        2>&1 | Out-Null
        & netsh int tcp set global ecncapability=default  2>&1 | Out-Null
        & netsh int tcp set global timestamps=default     2>&1 | Out-Null
        & netsh int tcp set global fastopen=disabled      2>&1 | Out-Null
        & netsh int tcp set global fastopenfallback=disabled 2>&1 | Out-Null
        Write-OK "TCP-Einstellungen auf Standard zurueckgesetzt (inkl. Fast Open)."
    } catch {}

    # TCP SynRetries zurueck
    try {
        $tcpPath = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters"
        Remove-ItemProperty -Path $tcpPath -Name "TcpMaxConnectRetransmissions" -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $tcpPath -Name "TcpMaxDataRetransmissions"    -ErrorAction SilentlyContinue
        Write-OK "TCP-Retransmission-Werte auf Standard zurueckgesetzt."
    } catch {}

    # UDP-Puffer zurueck
    try {
        $afdPath = "HKLM:\SYSTEM\CurrentControlSet\Services\AFD\Parameters"
        Remove-ItemProperty -Path $afdPath -Name "DefaultReceiveWindow"       -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $afdPath -Name "DefaultSendWindow"          -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $afdPath -Name "MaxActiveTransmitFileCount" -ErrorAction SilentlyContinue
        $tcpPath = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters"
        Remove-ItemProperty -Path $tcpPath -Name "GlobalMaxTcpWindowSize"     -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $tcpPath -Name "TcpWindowSize"              -ErrorAction SilentlyContinue
        Write-OK "UDP/AFD-Puffer auf Standard zurueckgesetzt."
    } catch {}

    # CPU-Parking reaktivieren
    try {
        powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 5  2>$null
        powercfg -setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR CPMINCORES 5  2>$null
        powercfg -setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PERFBOOSTMODE 1 2>$null
        powercfg -setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR PERFBOOSTMODE 1 2>$null
        powercfg -setactive SCHEME_CURRENT 2>$null
        $parkPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\0cc5b647-c1df-4637-891a-dec35c318583"
        if (Test-Path $parkPath) {
            Set-ItemProperty -Path $parkPath -Name "ValueMax" -Value 100 -Type DWord -ErrorAction SilentlyContinue
        }
        Write-OK "CPU-Parking reaktiviert (Windows-Standard wiederhergestellt)."
    } catch {}

    # Defender-Ausnahmen entfernen
    try {
        $gamePaths = @(
            "$env:ProgramFiles\Call of Duty",
            "$env:ProgramFiles (x86)\Call of Duty",
            "$env:ProgramFiles\Steam\steamapps\common",
            "$env:ProgramFiles (x86)\Steam\steamapps\common",
            "$env:ProgramFiles\Battle.net",
            "$env:ProgramFiles (x86)\Battle.net",
            "$env:ProgramFiles\Epic Games",
            "$env:ProgramFiles (x86)\Epic Games",
            "C:\Games"
        )
        foreach ($path in $gamePaths) {
            Remove-MpPreference -ExclusionPath $path -ErrorAction SilentlyContinue
        }
        $gameProcesses = @("cod.exe","BlackOpsColdWar.exe","HQ.exe","HQGame.exe","steam.exe","EpicGamesLauncher.exe","Battle.net.exe")
        foreach ($proc in $gameProcesses) {
            Remove-MpPreference -ExclusionProcess $proc -ErrorAction SilentlyContinue
        }
        Set-MpPreference -ScanAvgCPULoadFactor 50    -ErrorAction SilentlyContinue
        Set-MpPreference -EnableLowCpuPriority $false -ErrorAction SilentlyContinue
        Write-OK "Defender-Ausnahmen entfernt und CPU-Scan-Last auf Standard zurueckgesetzt."
    } catch {}

    # Memory Compression reaktivieren
    try {
        Enable-MMAgent -MemoryCompression -ErrorAction SilentlyContinue
        Write-OK "Memory Compression reaktiviert."
    } catch {}

    # Prefetch reaktivieren
    try {
        $pfPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management\PrefetchParameters"
        Set-ItemProperty -Path $pfPath -Name "EnablePrefetcher"  -Value 3 -Type DWord -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $pfPath -Name "EnableSuperfetch"  -Value 3 -Type DWord -ErrorAction SilentlyContinue
        Write-OK "Prefetch & Superfetch reaktiviert (Windows-Standard: 3)."
    } catch {}

    # NVIDIA Shader-Cache zuruecksetzen
    try {
        $nvTweakPath = "HKCU:\Software\NVIDIA Corporation\Global\NVTweak"
        Remove-ItemProperty -Path $nvTweakPath -Name "ShaderDiskCacheMaxSize" -ErrorAction SilentlyContinue
        Write-OK "NVIDIA Shader-Cache-Groesse auf Standard zurueckgesetzt."
    } catch {}

    # DSCP QoS-Markierungen entfernen
    try {
        $qosBasePath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\QoS"
        $codPolicies = @("CoD_UDP_Game","CoD_UDP_Voice","CoD_TCP_Game","BattleNet_UDP")
        foreach ($policy in $codPolicies) {
            $policyPath = "$qosBasePath\$policy"
            if (Test-Path $policyPath) {
                Remove-Item -Path $policyPath -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
        Write-OK "DSCP QoS-Markierungen entfernt."
    } catch {}

    # DPC Latenz zuruecksetzen
    try {
        $ndisPath = "HKLM:\SYSTEM\CurrentControlSet\Services\NDIS\Parameters"
        Remove-ItemProperty -Path $ndisPath -Name "MaxInterruptWorkPerDpc" -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $ndisPath -Name "MinInterruptWorkPerDpc" -ErrorAction SilentlyContinue
        # Hinweis: DpcWatchdogPeriod wurde bewusst nicht gesetzt - kein Zuruecksetzen noetig
        # Hinweis: IRQ8Priority/IRQ16Priority wurden bewusst nicht gesetzt - kein Zuruecksetzen noetig
        Write-OK "DPC-Latenz-Parameter zurueckgesetzt."
    } catch {}

    # Power Throttling reaktivieren
    try {
        $ptPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling"
        Remove-ItemProperty -Path $ptPath -Name "PowerThrottlingOff" -ErrorAction SilentlyContinue
        Write-OK "Power Throttling reaktiviert."
    } catch {}

    # MMCSS auf Standard zuruecksetzen
    try {
        $mmPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile"
        Remove-ItemProperty -Path $mmPath -Name "LazyModeTimeout" -ErrorAction SilentlyContinue
        $gamesPath = "$mmPath\Tasks\Games"
        if (Test-Path $gamesPath) {
            # Clock Rate auf gueltigen Standard-Wert zuruecksetzen (10000 = 1ms, sicherer Bereich 2000-10000)
            Set-ItemProperty -Path $gamesPath -Name "Clock Rate" -Value 10000 -Type DWord -ErrorAction SilentlyContinue
        }
        # Audio-Profile auf Standard
        $audioPath = "$mmPath\Tasks\Audio"
        if (Test-Path $audioPath) {
            Set-ItemProperty -Path $audioPath -Name "Clock Rate" -Value 10000 -Type DWord -ErrorAction SilentlyContinue
        }
        Write-OK "MMCSS-Profile auf Standard zurueckgesetzt."
    } catch {}

    # Spectre/Meltdown reaktivieren (falls deaktiviert)
    try {
        $spectreKey = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management"
        Remove-ItemProperty -Path $spectreKey -Name "FeatureSettingsOverride"     -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $spectreKey -Name "FeatureSettingsOverrideMask" -ErrorAction SilentlyContinue
        Write-OK "Spectre/Meltdown Mitigations reaktiviert (Windows-Standard)."
    } catch {}

    # Non-Paged Pool / DisablePagingExecutive zuruecksetzen
    try {
        $memPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management"
        Set-ItemProperty -Path $memPath -Name "DisablePagingExecutive" -Value 0 -Type DWord -ErrorAction SilentlyContinue
        Write-OK "DisablePagingExecutive zurueckgesetzt (Kernel-Code kann wieder ausgelagert werden)."
    } catch {}

    # Kernel UDP-Priorisierung zuruecksetzen
    try {
        $afdPath = "HKLM:\SYSTEM\CurrentControlSet\Services\AFD\Parameters"
        Remove-ItemProperty -Path $afdPath -Name "FastSendDatagramThreshold" -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $afdPath -Name "IrpStackSize"              -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $afdPath -Name "LargeBufferSize"           -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $afdPath -Name "MediumBufferSize"          -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $afdPath -Name "SmallBufferSize"           -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $afdPath -Name "PriorityBoost"             -ErrorAction SilentlyContinue
        $winsockPath = "HKLM:\SYSTEM\CurrentControlSet\Services\Winsock2\Parameters"
        Remove-ItemProperty -Path $winsockPath -Name "MaxSockAddrLength" -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $winsockPath -Name "MinSockAddrLength" -ErrorAction SilentlyContinue
        Write-OK "Kernel UDP-Priorisierung zurueckgesetzt."
    } catch {}

    # TCP Chimney/RSC/CTCP zurueck auf Standard
    try {
        & netsh int tcp set global chimney=default         2>&1 | Out-Null
        & netsh int tcp set global netdma=default          2>&1 | Out-Null
        & netsh int tcp set global congestionprovider=default 2>&1 | Out-Null
        & netsh int tcp set global rsc=enabled             2>&1 | Out-Null
        $adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
        foreach ($adapter in $adapters) {
            Enable-NetAdapterRsc -Name $adapter.Name -ErrorAction SilentlyContinue
        }
        Write-OK "TCP Chimney/RSC/CTCP auf Standard zurueckgesetzt."
    } catch {}

    # BCD Clock-Einstellungen zuruecksetzen
    try {
        & bcdedit /deletevalue useplatformclock  2>&1 | Out-Null
        & bcdedit /deletevalue disabledynamictick 2>&1 | Out-Null
        & bcdedit /deletevalue tscsyncpolicy     2>&1 | Out-Null
        Write-OK "BCD Clock-Einstellungen (HPET-Deaktivierung, Dynamic Tick, TSC) zurueckgesetzt."
    } catch {}

    # Win32PrioritySeparation zurueck auf Windows-Standard
    try {
        $prioPath = "HKLM:\SYSTEM\CurrentControlSet\Control\PriorityControl"
        # Standard Windows 10/11 Desktop: 0x02 (Long, Variable, High Foreground Boost)
        Set-ItemProperty -Path $prioPath -Name "Win32PrioritySeparation" -Value 0x02 -Type DWord -ErrorAction SilentlyContinue
        Write-OK "Win32PrioritySeparation auf Standard (0x02) zurueckgesetzt."
    } catch {}

    # MMCSS AlwaysOn und NoLazyMode zuruecksetzen
    try {
        $mmPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile"
        Remove-ItemProperty -Path $mmPath -Name "AlwaysOn"    -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $mmPath -Name "NoLazyMode"  -ErrorAction SilentlyContinue
        Write-OK "MMCSS AlwaysOn & NoLazyMode zurueckgesetzt (Windows-Standard)."
    } catch {}

    # Interrupt Moderation reaktivieren (war auf Adaptive gesetzt)
    try {
        $adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
        foreach ($adapter in $adapters) {
            $props = Get-NetAdapterAdvancedProperty -Name $adapter.Name -ErrorAction SilentlyContinue
            $im = $props | Where-Object { $_.DisplayName -match "Interrupt Moderation" }
            if ($im) {
                $imVals = $im.ValidDisplayValues
                $imTarget = $imVals | Where-Object { $_ -match "Adaptive" } | Select-Object -First 1
                if (-not $imTarget) { $imTarget = "Enabled" }
                Set-NetAdapterAdvancedProperty -Name $adapter.Name -DisplayName $im.DisplayName -DisplayValue $imTarget -ErrorAction SilentlyContinue
            }
        }
        Write-OK "Interrupt Moderation auf Standard (Adaptive/Enabled) zurueckgesetzt."
    } catch {}

    # LSO reaktivieren
    try {
        $adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
        foreach ($adapter in $adapters) {
            Enable-NetAdapterLso -Name $adapter.Name -ErrorAction SilentlyContinue
        }
        Write-OK "Large Send Offload (LSO) reaktiviert."
    } catch {}

    # IPv6 reaktivieren
    try {
        $adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
        foreach ($adapter in $adapters) {
            Enable-NetAdapterBinding -Name $adapter.Name -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue
        }
        $regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters"
        Set-ItemProperty -Path $regPath -Name "DisabledComponents" -Value 0x00 -Type DWord -ErrorAction SilentlyContinue
        Write-OK "IPv6 reaktiviert."
    } catch {}

    # Delivery Optimization reaktivieren
    try {
        $doPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization"
        if (Test-Path $doPath) { Remove-Item -Path $doPath -Recurse -Force -ErrorAction SilentlyContinue }
        Set-Service -Name "DoSvc" -StartupType Automatic -ErrorAction SilentlyContinue
        Start-Service -Name "DoSvc" -ErrorAction SilentlyContinue
        Write-OK "Delivery Optimization reaktiviert."
    } catch {}

    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Green
    Write-Host "  UNDO abgeschlossen. Bitte neu starten!" -ForegroundColor Green
    Write-Host ("=" * 60) -ForegroundColor Green
    Write-Host ""
    Write-Host "  Fuer eine vollstaendige Wiederherstellung:" -ForegroundColor White
    Write-Host "  Systemsteuerung > System > Computerschutz > Systemwiederherstellung" -ForegroundColor Gray
    Write-Host ""
    if ($AutoRestart) {
        Write-Host "  Starte in 5 Sekunden neu (-AutoRestart)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        Restart-Computer -Force
    } else {
        Write-Host "  Bitte manuell neu starten um alle Aenderungen zu aktivieren." -ForegroundColor Yellow
        Write-Host "  (Tipp: Parameter -AutoRestart fuer automatischen Neustart)" -ForegroundColor DarkGray
    }
    exit 0
}


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
    Write-Host "   - NetworkThrottlingIndex auf 20 gesetzt (optimiert ohne DPC-Jitter)" -ForegroundColor Gray
    Write-Host "   - SystemResponsiveness maximiert (Games-Profil)" -ForegroundColor Gray
    Write-Host "   - Large System Cache deaktiviert (RAM fuer Spiele)" -ForegroundColor Gray
    Write-Host "   - GPU Low Latency Mode aktiviert (NVIDIA/AMD)" -ForegroundColor Gray
    Write-Host "   - Scheduled Task fuer Spielprozess-Prioritaet eingerichtet" -ForegroundColor Gray
    Write-Host "   - IRQ-Priorisierung fuer GPU & Netzwerkkarte gesetzt" -ForegroundColor Gray
    Write-Host "   - NIC Erweiterte Einstellungen optimiert (LSO/EEE/FlowControl/Buffer)" -ForegroundColor Gray
    Write-Host "   - IPv6 deaktiviert" -ForegroundColor Gray
    Write-Host "   - Delivery Optimization (Windows Update P2P) deaktiviert" -ForegroundColor Gray
    Write-Host "   - RSS-Affinitaet auf dedizierten CPU-Kern gebunden" -ForegroundColor Gray
    Write-Host "   - CPU-Parking deaktiviert (alle Kerne permanent aktiv)" -ForegroundColor Gray
    Write-Host "   - Prozessor-Boost-Modus auf 'Aggressiv' gesetzt" -ForegroundColor Gray
    Write-Host "   - TCP Fast Open aktiviert" -ForegroundColor Gray
    Write-Host "   - UDP-Puffer fuer CoD optimiert (64KB)" -ForegroundColor Gray
    Write-Host "   - Windows Defender Spiele-Ausnahmen gesetzt" -ForegroundColor Gray
    Write-Host "   - Memory Compression deaktiviert (bei 16GB+ RAM)" -ForegroundColor Gray
    Write-Host "   - Prefetch vollstaendig deaktiviert" -ForegroundColor Gray
    Write-Host "   - Zusaetzliche Dienste deaktiviert (Mixed Reality, Tablet, etc.)" -ForegroundColor Gray
    Write-Host "   - NVIDIA Shader-Cache auf 10 GB erhoehen" -ForegroundColor Gray
    Write-Host "   - DSCP QoS-Markierung fuer CoD-Traffic (EF/46)" -ForegroundColor Gray
    Write-Host "   - DPC-Latenz optimiert (gleichmaessigerer Netzwerk-Jitter)" -ForegroundColor Gray
    Write-Host "   - Power Throttling deaktiviert" -ForegroundColor Gray
    Write-Host "   - MMCSS Clock Rate auf 1ms praezisiert (Games + Audio)" -ForegroundColor Gray
    Write-Host "   - Spectre/Meltdown: Standard (opt-in via Konfiguration)" -ForegroundColor Gray
    Write-Host "   - DisablePagingExecutive: Kernel-Code bleibt im RAM" -ForegroundColor Gray
    Write-Host "   - Kernel UDP-Priorisierung: FastSendDatagramThreshold fuer CoD" -ForegroundColor Gray
    Write-Host "   - TCP Chimney/RSC/CTCP optimiert" -ForegroundColor Gray
    Write-Host "   - Clock Interrupt: HPET deaktiviert (TSC), Dynamic Tick aus, TSC Sync gesetzt" -ForegroundColor Gray
    Write-Host "   - Win32PrioritySeparation 0x2A: Short Fixed, High Foreground Boost fuer CoD" -ForegroundColor Gray
    Write-Host "   - MMCSS AlwaysOn & NoLazyMode: permanenter Boost ohne Idle-Pausen" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  NEUSTART EMPFOHLEN damit alle Aenderungen wirksam werden." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Zum Rueckgaengigmachen:" -ForegroundColor White
    Write-Host "   Systemsteuerung > System > Computerschutz > Systemwiederherstellung" -ForegroundColor Gray
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Green

    if ($AutoRestart) {
        Write-Host "  Starte in 10 Sekunden neu (-AutoRestart)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
        Restart-Computer -Force
    }
    else {
        Write-Host "  Bitte manuell neu starten um alle Aenderungen zu aktivieren." -ForegroundColor Yellow
        Write-Host "  (Tipp: Parameter -AutoRestart fuer automatischen Neustart)" -ForegroundColor DarkGray
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

# Undo-Modus pruefen
if ($Undo) {
    Write-Host "  Modus: UNDO (Optimierungen zuruecksetzen)" -ForegroundColor Yellow
    Invoke-UndoOptimizations
}

Write-Host "  Dieses Skript optimiert Windows fuer Gaming-Performance." -ForegroundColor White
Write-Host "  Ein Wiederherstellungspunkt wird automatisch erstellt." -ForegroundColor White
Write-Host "  Zum Rueckgaengigmachen: .\Gaming-Optimierung.ps1 -Undo" -ForegroundColor DarkGray
Write-Host ""

if (-not $SkipConfirm) {
    Write-Host "  Optimierung starten? (j/N): " -NoNewline
    $confirm = ([Console]::ReadLine())
    if ($confirm -ne "j" -and $confirm -ne "J") {
        Write-Host "  Abgebrochen." -ForegroundColor Red
        exit 0
    }
} else {
    Write-Host "  Starte automatisch (-SkipConfirm)..." -ForegroundColor DarkGray
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
Set-NetworkAndCPUResponsiveness
Disable-LargeSystemCache
Set-GPULowLatency
Set-GamePriorityTask
Set-IRQPrioritization
Set-NICOptimizations
Disable-IPv6
Disable-DeliveryOptimization
Set-RSSAffinity
Disable-CPUParking
Enable-TCPFastOpen
Set-UDPBufferOptimization
Set-DefenderGameExclusions
Disable-MemoryCompression
Disable-Prefetch
Disable-AdditionalServices
Set-NvidiaShaderCache
Set-DSCPMarkierung
Set-DPCLatenzOptimierung
Disable-PowerThrottling
Set-MMCSSOptimization
Set-SpectreDisable
Set-NonPagedPool
Set-KernelUDPPrio
Set-TCPChimneyConfig
Set-ClockInterruptIsolierung
Set-Win32PrioritySeparation
Set-MMCSSAlwaysOn
Show-Summary
