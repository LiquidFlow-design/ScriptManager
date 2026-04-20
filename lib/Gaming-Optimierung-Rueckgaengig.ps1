#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Erweiterte Gaming-Optimierungen rueckgaengig machen
.DESCRIPTION
    Stellt alle Aenderungen aus Gaming-Optimierung-Erweitert.ps1 wieder her.
    Erstellt automatisch einen Wiederherstellungspunkt vor dem Zuruecksetzen.
.NOTES
    Getestet auf Windows 10 / Windows 11.
#>

# ============================================================
#  FARB-HELPER
# ============================================================
function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Yellow
    Write-Host "  $Text" -ForegroundColor Yellow
    Write-Host ("=" * 60) -ForegroundColor Yellow
}
function Write-OK    { param([string]$Msg) Write-Host "  [OK]  $Msg" -ForegroundColor Green   }
function Write-Skip  { param([string]$Msg) Write-Host "  [--]  $Msg" -ForegroundColor DarkGray }
function Write-Warn  { param([string]$Msg) Write-Host "  [!!]  $Msg" -ForegroundColor Yellow  }
function Write-Info  { param([string]$Msg) Write-Host "  [i]   $Msg" -ForegroundColor White   }

# ============================================================
#  WIEDERHERSTELLUNGSPUNKT
# ============================================================
function New-RestorePoint {
    Write-Header "Schritt 1/6 - Wiederherstellungspunkt erstellen"
    try {
        Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction SilentlyContinue
        Checkpoint-Computer `
            -Description "Vor Rueckgaengigmachen erweiterter Gaming-Optimierung - $(Get-Date -Format 'dd.MM.yyyy HH:mm')" `
            -RestorePointType "MODIFY_SETTINGS" -ErrorAction Stop
        Write-OK "Wiederherstellungspunkt erstellt."
    }
    catch {
        Write-Warn "Wiederherstellungspunkt fehlgeschlagen: $_"
        $c = Read-Host "  Trotzdem fortfahren? (j/N)"
        if ($c -ne "j" -and $c -ne "J") { exit 1 }
    }
}

# ============================================================
#  INTERRUPT AFFINITY ZURUECKSETZEN
# ============================================================
function Reset-InterruptAffinity {
    Write-Header "Schritt 2/6 - Interrupt Affinity zuruecksetzen"

    try {
        $gpuDevices = Get-PnpDevice -Class "Display" -Status "OK" -ErrorAction SilentlyContinue
        $count = 0

        foreach ($gpu in $gpuDevices) {
            $regPath = "HKLM:\SYSTEM\CurrentControlSet\Enum\$($gpu.InstanceId)\Device Parameters\Interrupt Management\Affinity Policy"
            if (Test-Path $regPath) {
                # DevicePolicy 0 = Standard (keine Pinning)
                Set-ItemProperty -Path $regPath -Name "DevicePolicy" -Value 0 -Type DWord -ErrorAction SilentlyContinue
                Remove-ItemProperty -Path $regPath -Name "AssignmentSetOverride" -ErrorAction SilentlyContinue
                Write-OK "Interrupt Affinity zurueckgesetzt: $($gpu.FriendlyName)"
                $count++
            } else {
                Write-Skip "Kein Affinity-Eintrag fuer: $($gpu.FriendlyName)"
            }
        }

        if ($count -eq 0) { Write-Skip "Keine GPU-Affinity-Eintraege gefunden." }
    }
    catch {
        Write-Warn "Interrupt Affinity Reset fehlgeschlagen: $_"
    }
}

# ============================================================
#  STANDBY-TASK ENTFERNEN
# ============================================================
function Remove-StandbyTask {
    Write-Header "Schritt 3/6 - Standby-Listen-Task entfernen"

    try {
        $taskName = "GamingOptimizer_EmptyStandby"
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($null -ne $task) {
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
            Write-OK "Geplanter Task '$taskName' entfernt."
        } else {
            Write-Skip "Task '$taskName' nicht gefunden (bereits entfernt oder nie erstellt)."
        }
    }
    catch {
        Write-Warn "Task konnte nicht entfernt werden: $_"
    }
}

# ============================================================
#  CORE ISOLATION / HVCI REAKTIVIEREN
# ============================================================
function Enable-CoreIsolation {
    Write-Header "Schritt 4/6 - Core Isolation / Memory Integrity (HVCI) reaktivieren"

    try {
        $hvciPath = "HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity"
        if (Test-Path $hvciPath) {
            $currentVal = (Get-ItemProperty -Path $hvciPath -Name "Enabled" -ErrorAction SilentlyContinue).Enabled
            if ($currentVal -eq 0) {
                Set-ItemProperty -Path $hvciPath -Name "Enabled" -Value 1 -Type DWord
                Write-OK "HVCI (Memory Integrity) reaktiviert."
            } else {
                Write-Skip "HVCI war bereits aktiv."
            }
        } else {
            Write-Skip "HVCI-Registry-Pfad nicht gefunden (Standard-Windows-Zustand)."
        }

        $miPath = "HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard"
        if (Test-Path $miPath) {
            Set-ItemProperty -Path $miPath -Name "EnableVirtualizationBasedSecurity" -Value 1 -Type DWord -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $miPath -Name "RequirePlatformSecurityFeatures"   -Value 1 -Type DWord -ErrorAction SilentlyContinue
            Write-OK "Virtualization Based Security reaktiviert."
        }
    }
    catch {
        Write-Warn "Core Isolation reaktivieren fehlgeschlagen: $_"
    }
}

# ============================================================
#  SPECTRE / MELTDOWN MITIGATIONS REAKTIVIEREN
# ============================================================
function Enable-SpectreMeltdown {
    Write-Header "Schritt 5/6 - Spectre/Meltdown CPU-Mitigations reaktivieren"

    try {
        $path = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management"

        $currentOverride = (Get-ItemProperty -Path $path -Name "FeatureSettingsOverride" -ErrorAction SilentlyContinue).FeatureSettingsOverride

        if ($currentOverride -eq 3) {
            # Werte auf Windows-Standard zuruecksetzen (Mitigations aktiv)
            Remove-ItemProperty -Path $path -Name "FeatureSettingsOverride"     -ErrorAction SilentlyContinue
            Remove-ItemProperty -Path $path -Name "FeatureSettingsOverrideMask" -ErrorAction SilentlyContinue
            Write-OK "Spectre/Meltdown Mitigations reaktiviert (Registry-Werte entfernt = Standard)."
        } else {
            Write-Skip "Spectre/Meltdown Mitigations waren nicht deaktiviert."
        }

        # Hypervisor reaktivieren
        & bcdedit /set hypervisorlaunchtype auto 2>&1 | Out-Null
        Write-OK "Hypervisor Launch Type auf 'auto' zurueckgesetzt."
    }
    catch {
        Write-Warn "Spectre/Meltdown Reaktivierung fehlgeschlagen: $_"
    }
}

# ============================================================
#  ALLGEMEINE EINSTELLUNGEN AUS HAUPTSKRIPT PRUEFEN
# ============================================================
function Reset-GeneralTweaks {
    Write-Header "Schritt 6/6 - Weitere Einstellungen pruefen & zuruecksetzen"

    # Timer Resolution zuruecksetzen
    try {
        $timerPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\kernel"
        $val = (Get-ItemProperty -Path $timerPath -Name "GlobalTimerResolutionRequests" -ErrorAction SilentlyContinue).GlobalTimerResolutionRequests
        if ($val -eq 1) {
            Remove-ItemProperty -Path $timerPath -Name "GlobalTimerResolutionRequests" -ErrorAction SilentlyContinue
            Write-OK "Timer Resolution auf Windows-Standard zurueckgesetzt."
        } else {
            Write-Skip "Timer Resolution war nicht angepasst."
        }
    }
    catch { Write-Warn "Timer Resolution Reset fehlgeschlagen: $_" }

    # MPO reaktivieren
    try {
        $mpoPath = "HKLM:\SOFTWARE\Microsoft\Windows\Dwm"
        $mpoVal = (Get-ItemProperty -Path $mpoPath -Name "OverlayTestMode" -ErrorAction SilentlyContinue).OverlayTestMode
        if ($mpoVal -eq 5) {
            Remove-ItemProperty -Path $mpoPath -Name "OverlayTestMode" -ErrorAction SilentlyContinue
            Write-OK "MPO (Multiplane Overlay) reaktiviert."
        } else {
            Write-Skip "MPO war nicht deaktiviert."
        }
    }
    catch { Write-Warn "MPO Reset fehlgeschlagen: $_" }

    # QoS-Bandbreite wiederherstellen
    try {
        $qosPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Psched"
        if (Test-Path $qosPath) {
            Remove-Item -Path $qosPath -Recurse -Force -ErrorAction SilentlyContinue
            Write-OK "QoS-Paketplaner auf Standard zurueckgesetzt."
        } else {
            Write-Skip "QoS-Eintraege nicht gefunden."
        }
    }
    catch { Write-Warn "QoS Reset fehlgeschlagen: $_" }

    # TCP Einstellungen zuruecksetzen
    try {
        & netsh int tcp set global autotuninglevel=normal  2>&1 | Out-Null
        & netsh int tcp set global chimney=default         2>&1 | Out-Null
        & netsh int tcp set global ecncapability=default   2>&1 | Out-Null
        & netsh int tcp set global timestamps=default      2>&1 | Out-Null
        Write-OK "TCP-Einstellungen auf Windows-Standard zurueckgesetzt."
    }
    catch { Write-Warn "TCP Reset fehlgeschlagen: $_" }

    # Nagle-Algorithmus reaktivieren
    try {
        $basePath = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces"
        $interfaces = Get-ChildItem -Path $basePath
        foreach ($iface in $interfaces) {
            Remove-ItemProperty -Path $iface.PSPath -Name "TcpAckFrequency" -ErrorAction SilentlyContinue
            Remove-ItemProperty -Path $iface.PSPath -Name "TCPNoDelay"      -ErrorAction SilentlyContinue
        }
        Write-OK "Nagle-Algorithmus reaktiviert."
    }
    catch { Write-Warn "Nagle Reset fehlgeschlagen: $_" }

    # Energieplan zurueck auf Ausbalanciert
    try {
        & powercfg -setactive 381b4222-f694-41f0-9685-ff5bb260df2e 2>&1 | Out-Null
        Write-OK "Energieplan auf 'Ausbalanciert' zurueckgesetzt."
        Write-Info "Tipp: In der Systemsteuerung kannst du manuell deinen bevorzugten Plan waehlen."
    }
    catch { Write-Warn "Energieplan Reset fehlgeschlagen: $_" }

    # HAGS zuruecksetzen
    try {
        $hagsPath = "HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers"
        $hagsVal = (Get-ItemProperty -Path $hagsPath -Name "HwSchMode" -ErrorAction SilentlyContinue).HwSchMode
        if ($hagsVal -eq 2) {
            Set-ItemProperty -Path $hagsPath -Name "HwSchMode" -Value 1 -Type DWord
            Write-OK "HAGS (Hardware GPU Scheduling) deaktiviert."
        } else {
            Write-Skip "HAGS war nicht aktiviert."
        }
    }
    catch { Write-Warn "HAGS Reset fehlgeschlagen: $_" }

    # Paging-Datei auf automatisch zuruecksetzen
    try {
        $cs = Get-WmiObject -Class Win32_ComputerSystem
        if (-not $cs.AutomaticManagedPagefile) {
            $cs.AutomaticManagedPagefile = $true
            $cs.Put() | Out-Null
            Write-OK "Paging-Datei auf automatische Verwaltung zurueckgesetzt."
        } else {
            Write-Skip "Paging-Datei war bereits auf automatisch."
        }
    }
    catch { Write-Warn "Paging-Datei Reset fehlgeschlagen: $_" }

    # Dienste reaktivieren
    Write-Info "Reaktiviere deaktivierte Dienste auf 'Manual'..."
    $services = @(
        @{ Name = "DiagTrack";      Label = "Telemetrie";           Type = "Automatic" }
        @{ Name = "WSearch";        Label = "Windows Search";        Type = "Automatic" }
        @{ Name = "SysMain";        Label = "SysMain/Superfetch";    Type = "Automatic" }
        @{ Name = "PrintSpooler";   Label = "Druckwarteschlange";    Type = "Automatic" }
        @{ Name = "WerSvc";         Label = "Windows Fehlerbericht"; Type = "Manual"    }
        @{ Name = "XblAuthManager"; Label = "Xbox Live Auth";        Type = "Manual"    }
        @{ Name = "XblGameSave";    Label = "Xbox Live Game Save";   Type = "Manual"    }
        @{ Name = "XboxNetApiSvc";  Label = "Xbox Live Networking";  Type = "Manual"    }
        @{ Name = "TrkWks";         Label = "Link Tracking";         Type = "Automatic" }
    )
    foreach ($svc in $services) {
        try {
            $s = Get-Service -Name $svc.Name -ErrorAction SilentlyContinue
            if ($null -ne $s) {
                Set-Service -Name $svc.Name -StartupType $svc.Type -ErrorAction SilentlyContinue
                Write-OK "$($svc.Label) auf '$($svc.Type)' gesetzt."
            }
        }
        catch { Write-Warn "$($svc.Label) konnte nicht reaktiviert werden." }
    }
}

# ============================================================
#  ABSCHLUSS
# ============================================================
function Show-Summary {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Green
    Write-Host "  ZURUECKSETZEN ABGESCHLOSSEN" -ForegroundColor Green
    Write-Host ("=" * 60) -ForegroundColor Green
    Write-Host ""
    Write-Host "  Was wurde zurueckgesetzt:" -ForegroundColor White
    Write-Host "   - Interrupt Affinity (GPU-Standard)" -ForegroundColor Gray
    Write-Host "   - Standby-Task entfernt" -ForegroundColor Gray
    Write-Host "   - Core Isolation / HVCI reaktiviert" -ForegroundColor Gray
    Write-Host "   - Spectre/Meltdown Mitigations reaktiviert" -ForegroundColor Gray
    Write-Host "   - Timer Resolution, MPO, QoS, TCP zurueck" -ForegroundColor Gray
    Write-Host "   - Energieplan auf Ausbalanciert" -ForegroundColor Gray
    Write-Host "   - HAGS deaktiviert" -ForegroundColor Gray
    Write-Host "   - Paging-Datei automatisch" -ForegroundColor Gray
    Write-Host "   - Dienste reaktiviert" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  NEUSTART ERFORDERLICH." -ForegroundColor Yellow
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Green

    $restart = Read-Host "  Jetzt neu starten? (j/N)"
    if ($restart -eq "j" -or $restart -eq "J") {
        Start-Sleep -Seconds 5
        Restart-Computer -Force
    }
}

# ============================================================
#  HAUPTPROGRAMM
# ============================================================
Clear-Host
Write-Host ""
Write-Host "  +--------------------------------------------------+" -ForegroundColor Yellow
Write-Host "  |    GAMING-OPTIMIERUNGEN RUECKGAENGIG MACHEN      |" -ForegroundColor Yellow
Write-Host "  |    Stellt Windows-Standardeinstellungen wieder   |" -ForegroundColor Yellow
Write-Host "  |    her (aus Gaming-Optimierung-Erweitert.ps1)    |" -ForegroundColor Yellow
Write-Host "  +--------------------------------------------------+" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Alle Aenderungen aus Gaming-Optimierung-Erweitert.ps1" -ForegroundColor White
Write-Host "  werden zurueckgesetzt. Ein Wiederherstellungspunkt" -ForegroundColor White
Write-Host "  wird automatisch erstellt." -ForegroundColor White
Write-Host ""

$confirm = Read-Host "  Fortfahren? (j/N)"
if ($confirm -ne "j" -and $confirm -ne "J") {
    Write-Host "  Abgebrochen." -ForegroundColor Red
    exit 0
}

New-RestorePoint
Reset-InterruptAffinity
Remove-StandbyTask
Enable-CoreIsolation
Enable-SpectreMeltdown
Reset-GeneralTweaks
Show-Summary
