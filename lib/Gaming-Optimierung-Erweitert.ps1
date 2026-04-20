#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Erweiterte Gaming-Optimierungen (Mittleres / Hohes Risiko)
.DESCRIPTION
    Deaktiviert Windows-Sicherheitsfeatures und CPU-Mitigations fuer maximale Performance.
    NUR fuer Heimrechner geeignet. Erstellt automatisch einen Wiederherstellungspunkt.
.NOTES
    Zum Rueckgaengigmachen: Gaming-Optimierung-Rueckgaengig.ps1 ausfuehren
    Getestet auf Windows 10 / Windows 11.
#>

# ============================================================
#  KONFIGURATION
# ============================================================
$Config = @{
    # [MITTLERES RISIKO] Interrupt Affinity: GPU-Interrupts auf CPU-Kern 2 binden
    # Vorteil: Reduziert GPU-Latenzen / Ruckler
    # Nachteil: Falsch konfiguriert = Instabilitaet; stark CPU-abhaengig
    InterruptAffinity          = $true

    # [MITTLERES RISIKO] Standby-Liste regelmaessig leeren
    # Vorteil: Mehr freies RAM fuer Spiele
    # Nachteil: Leicht erhoehte Hintergrund-CPU-Last
    StandbyListeLeeren         = $true

    # [HOHES RISIKO] Core Isolation / HVCI deaktivieren
    # Vorteil: 5-10% mehr FPS (besonders auf aelteren CPUs)
    # Nachteil: Deaktiviert Speicherisolierung gegen Rootkits/Treiber-Exploits
    #           Windows Security Center zeigt Warnung an
    CoreIsolation              = $false   # Bewusst auf $false - nur aktivieren wenn gewuenscht!

    # [HOHES RISIKO] Spectre/Meltdown CPU-Mitigations deaktivieren
    # Vorteil: 3-15% mehr Performance in CPU-lastigen Spielen
    # Nachteil: Macht bekannte CPU-Sicherheitsluecken (seit 2018) ausnutzbar
    #           Kein Risiko bei reinem Einzelspieler/Offline - Risiko bei Browsing auf gleichem PC
    SpectreMeltdown            = $false   # Bewusst auf $false - nur aktivieren wenn gewuenscht!
}

# ============================================================
#  FARB-HELPER
# ============================================================
function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Magenta
    Write-Host "  $Text" -ForegroundColor Magenta
    Write-Host ("=" * 60) -ForegroundColor Magenta
}
function Write-OK    { param([string]$Msg) Write-Host "  [OK]  $Msg" -ForegroundColor Green   }
function Write-Skip  { param([string]$Msg) Write-Host "  [--]  $Msg" -ForegroundColor DarkGray }
function Write-Warn  { param([string]$Msg) Write-Host "  [!!]  $Msg" -ForegroundColor Yellow  }
function Write-Info  { param([string]$Msg) Write-Host "  [i]   $Msg" -ForegroundColor White   }

# ============================================================
#  WIEDERHERSTELLUNGSPUNKT
# ============================================================
function New-RestorePoint {
    Write-Header "Schritt 1/5 - Wiederherstellungspunkt erstellen"
    try {
        Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction SilentlyContinue
        Checkpoint-Computer `
            -Description "Vor erweiterter Gaming-Optimierung - $(Get-Date -Format 'dd.MM.yyyy HH:mm')" `
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
#  INTERRUPT AFFINITY
# ============================================================
function Set-InterruptAffinity {
    Write-Header "Schritt 2/5 - Interrupt Affinity (GPU auf CPU-Kern 2)"

    if (-not $Config.InterruptAffinity) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # GPU-Geraete in der Registry finden (Display-Adapter)
        $gpuDevices = Get-PnpDevice -Class "Display" -Status "OK" -ErrorAction SilentlyContinue
        $count = 0

        foreach ($gpu in $gpuDevices) {
            $regPath = "HKLM:\SYSTEM\CurrentControlSet\Enum\$($gpu.InstanceId)\Device Parameters\Interrupt Management\Affinity Policy"
            if (-not (Test-Path $regPath)) {
                New-Item -Path $regPath -Force | Out-Null
            }
            # DevicePolicy 4 = IrqPolicySpecifiedProcessors, AffinityMask = Kern 2 (Bit 1 = 0x02)
            Set-ItemProperty -Path $regPath -Name "DevicePolicy"  -Value 4    -Type DWord -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $regPath -Name "AssignmentSetOverride" -Value ([byte[]](0x02,0x00,0x00,0x00)) -Type Binary -ErrorAction SilentlyContinue
            Write-OK "GPU Interrupt Affinity gesetzt: $($gpu.FriendlyName)"
            $count++
        }

        if ($count -eq 0) {
            Write-Warn "Keine Display-Adapter gefunden."
        } else {
            Write-Info "Neustart erforderlich damit Interrupt Affinity wirksam wird."
            Write-Info "Bei Instabilitaet: Gaming-Optimierung-Rueckgaengig.ps1 ausfuehren."
        }
    }
    catch {
        Write-Warn "Interrupt Affinity fehlgeschlagen: $_"
    }
}

# ============================================================
#  STANDBY-LISTE LEEREN (SCHEDULED TASK)
# ============================================================
function Set-StandbyListCleaner {
    Write-Header "Schritt 3/5 - Standby-Liste automatisch leeren"

    if (-not $Config.StandbyListeLeeren) { Write-Skip "Uebersprungen (Konfiguration)"; return }

    try {
        # RAMMap-Alternative: EmptyStandbyList via Windows API
        # Wir erstellen einen geplanten Task der beim Spielstart ausfuehrt
        $taskName = "GamingOptimizer_EmptyStandby"

        # Inline-Skript das die Standby-Liste leert
        $scriptBlock = @'
$signature = @"
[DllImport("ntdll.dll")]
public static extern uint NtSetSystemInformation(int InfoClass, IntPtr Info, int Length);
"@
$ntdll = Add-Type -MemberDefinition $signature -Name "NtDll" -Namespace "WinAPI" -PassThru
$ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal(4)
[System.Runtime.InteropServices.Marshal]::WriteInt32($ptr, 4)
$ntdll::NtSetSystemInformation(80, $ptr, 4) | Out-Null
[System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
'@
        $encodedScript = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($scriptBlock))

        # Geplanten Task erstellen (alle 30 Min wenn Benutzer aktiv)
        $action  = New-ScheduledTaskAction -Execute "powershell.exe" `
                       -Argument "-NonInteractive -WindowStyle Hidden -EncodedCommand $encodedScript"
        $trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 30) -Once -At (Get-Date)
        $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 1) `
                        -MultipleInstances IgnoreNew
        $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

        # Alten Task entfernen falls vorhanden
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
            -Settings $settings -Principal $principal -Description "Gaming Optimizer: Standby RAM leeren" `
            -ErrorAction Stop | Out-Null

        Write-OK "Geplanter Task '$taskName' erstellt (alle 30 Min)."
        Write-Info "Task laeert die Standby-Liste damit mehr RAM fuer Spiele verfuegbar ist."
    }
    catch {
        Write-Warn "Standby-Task konnte nicht erstellt werden: $_"
    }
}

# ============================================================
#  CORE ISOLATION / HVCI
# ============================================================
function Disable-CoreIsolation {
    Write-Header "Schritt 4/5 - Core Isolation / Memory Integrity (HVCI)"

    if (-not $Config.CoreIsolation) {
        Write-Skip "Uebersprungen (in Konfiguration deaktiviert)."
        Write-Info "Zum Aktivieren: '\$Config.CoreIsolation = \$true' setzen."
        return
    }

    Write-Warn "SICHERHEITSHINWEIS: Core Isolation schuetzt vor Rootkits und Treiber-Exploits."
    Write-Warn "Deaktivierung nur auf reinen Gaming-PCs ohne sensible Daten empfohlen."
    $confirm = Read-Host "  Wirklich deaktivieren? (j/N)"
    if ($confirm -ne "j" -and $confirm -ne "J") { Write-Skip "Vom Benutzer abgebrochen."; return }

    try {
        # HVCI (Hypervisor-Protected Code Integrity) deaktivieren
        $hvciPath = "HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity"
        if (-not (Test-Path $hvciPath)) { New-Item -Path $hvciPath -Force | Out-Null }
        Set-ItemProperty -Path $hvciPath -Name "Enabled" -Value 0 -Type DWord

        # Memory Integrity via Windows Security Registry
        $miPath = "HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard"
        Set-ItemProperty -Path $miPath -Name "EnableVirtualizationBasedSecurity" -Value 0 -Type DWord -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $miPath -Name "RequirePlatformSecurityFeatures"   -Value 0 -Type DWord -ErrorAction SilentlyContinue

        Write-OK "Core Isolation / HVCI deaktiviert. (Neustart erforderlich)"
        Write-Warn "Windows Security Center wird eine Warnung anzeigen - das ist normal."
    }
    catch {
        Write-Warn "Core Isolation konnte nicht deaktiviert werden: $_"
    }
}

# ============================================================
#  SPECTRE / MELTDOWN MITIGATIONS
# ============================================================
function Disable-SpectreMeltdown {
    Write-Header "Schritt 5/5 - Spectre/Meltdown CPU-Mitigations"

    if (-not $Config.SpectreMeltdown) {
        Write-Skip "Uebersprungen (in Konfiguration deaktiviert)."
        Write-Info "Zum Aktivieren: '\$Config.SpectreMeltdown = \$true' setzen."
        return
    }

    Write-Warn "SICHERHEITSHINWEIS: Diese Patches schuetzen vor CPU-Sicherheitsluecken seit 2018."
    Write-Warn "Risiko auf Heimrechnern gering - aber bei gleichzeitigem Webbrowser-Einsatz vorhanden."
    $confirm = Read-Host "  Wirklich deaktivieren? (j/N)"
    if ($confirm -ne "j" -and $confirm -ne "J") { Write-Skip "Vom Benutzer abgebrochen."; return }

    try {
        $path = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management"

        # Spectre Variant 2 (CVE-2017-5715) deaktivieren
        Set-ItemProperty -Path $path -Name "FeatureSettingsOverride"     -Value 3 -Type DWord
        Set-ItemProperty -Path $path -Name "FeatureSettingsOverrideMask" -Value 3 -Type DWord

        # Meltdown / Spectre Variant 1 (L1TF, MDS) via bcdedit
        & bcdedit /set hypervisorlaunchtype off 2>&1 | Out-Null

        Write-OK "Spectre/Meltdown Mitigations deaktiviert. (Neustart erforderlich)"
        Write-Warn "Zum Reaktivieren: Gaming-Optimierung-Rueckgaengig.ps1 ausfuehren."
    }
    catch {
        Write-Warn "Spectre/Meltdown Mitigations konnten nicht deaktiviert werden: $_"
    }
}

# ============================================================
#  ABSCHLUSS
# ============================================================
function Show-Summary {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Magenta
    Write-Host "  ERWEITERTE OPTIMIERUNG ABGESCHLOSSEN" -ForegroundColor Magenta
    Write-Host ("=" * 60) -ForegroundColor Magenta
    Write-Host ""
    Write-Host "  NEUSTART ERFORDERLICH fuer alle Aenderungen." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Rueckgaengig machen:" -ForegroundColor White
    Write-Host "   Gaming-Optimierung-Rueckgaengig.ps1 ausfuehren" -ForegroundColor Gray
    Write-Host "   ODER: Systemsteuerung > Computerschutz > Systemwiederherstellung" -ForegroundColor Gray
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Magenta

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
Write-Host "  +--------------------------------------------------+" -ForegroundColor Magenta
Write-Host "  |    ERWEITERTE GAMING-OPTIMIERUNG                 |" -ForegroundColor Magenta
Write-Host "  |    Mittleres / Hohes Risiko                      |" -ForegroundColor Magenta
Write-Host "  +--------------------------------------------------+" -ForegroundColor Magenta
Write-Host ""
Write-Host "  ACHTUNG: Dieses Skript deaktiviert Windows-Sicherheitsfeatures!" -ForegroundColor Yellow
Write-Host "  Nur fuer Heimrechner ohne sensible Daten empfohlen." -ForegroundColor Yellow
Write-Host "  Ein Wiederherstellungspunkt wird automatisch erstellt." -ForegroundColor White
Write-Host ""
Write-Host "  Aktivierte Optimierungen (siehe Konfiguration oben):" -ForegroundColor White
Write-Host "   Interrupt Affinity : $(if($Config.InterruptAffinity){'JA [Mittleres Risiko]'}else{'Nein'})" -ForegroundColor $(if($Config.InterruptAffinity){'Yellow'}else{'DarkGray'})
Write-Host "   Standby-Liste      : $(if($Config.StandbyListeLeeren){'JA [Mittleres Risiko]'}else{'Nein'})" -ForegroundColor $(if($Config.StandbyListeLeeren){'Yellow'}else{'DarkGray'})
Write-Host "   Core Isolation     : $(if($Config.CoreIsolation){'JA [HOHES RISIKO]'}else{'Nein (deaktiviert)'})" -ForegroundColor $(if($Config.CoreIsolation){'Red'}else{'DarkGray'})
Write-Host "   Spectre/Meltdown   : $(if($Config.SpectreMeltdown){'JA [HOHES RISIKO]'}else{'Nein (deaktiviert)'})" -ForegroundColor $(if($Config.SpectreMeltdown){'Red'}else{'DarkGray'})
Write-Host ""

$confirm = Read-Host "  Fortfahren? (j/N)"
if ($confirm -ne "j" -and $confirm -ne "J") {
    Write-Host "  Abgebrochen." -ForegroundColor Red
    exit 0
}

New-RestorePoint
Set-InterruptAffinity
Set-StandbyListCleaner
Disable-CoreIsolation
Disable-SpectreMeltdown
Show-Summary
