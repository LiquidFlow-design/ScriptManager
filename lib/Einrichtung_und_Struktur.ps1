# ============================================================
# PS Script Manager — Struktur & Einrichtung
# ============================================================

# ── ORDNERSTRUKTUR ──────────────────────────────────────────
# C:\Scripte\
# │   *.ps1                  ← Deine PowerShell-Scripte
# ├── Configs\
# │       scripts.csv        ← Konfiguration (s.u.)
# └── Logs\
#         YYYY-MM-DD.log     ← Tägliche Logdateien


# ── CSV-FORMAT: C:\Scripte\Configs\scripts.csv ──────────────
# Trennzeichen: Semikolon (;)
# Encoding: UTF-8

# SPALTEN:
# ID               Eindeutige Nummer (1, 2, 3…)
# Name             Anzeigename im Manager
# Dateiname        .ps1-Dateiname (z.B. Check-Network.ps1)
# Kategorie        Netzwerk | System | Wartung | Sicherheit | User | Sonstige
# Beschreibung     Kurze Beschreibung (ein Satz)
# Autor            Name/Team des Erstellers
# Parameter        Optionale PS-Parameter (z.B. -Verbose -Server PC01)
# Aktiviert        1 = aktiv, 0 = deaktiviert
# LetztesAusfuehren  Wird automatisch befüllt (leer lassen)

# BEISPIEL-CSV:
$csvBeispiel = @"
ID;Name;Dateiname;Kategorie;Beschreibung;Autor;Parameter;Aktiviert;LetztesAusfuehren
1;Netzwerk-Check;Check-Network.ps1;Netzwerk;Prüft Netzwerkverbindungen und DNS;Admin;-Verbose;1;
2;Dienste-Übersicht;Get-Services.ps1;System;Listet laufende Windows-Dienste auf;Admin;;1;
3;Datenträger-Analyse;Disk-Analysis.ps1;Wartung;Analysiert Festplattenbelegung;IT-Team;-Drive C;1;
4;AD-User-Export;Export-ADUsers.ps1;User;Exportiert AD-Benutzer in CSV;Admin;-OU "OU=Users,DC=firma,DC=de";1;
5;Firewall-Status;Get-FirewallStatus.ps1;Sicherheit;Zeigt Windows Firewall Status;Security;-All;1;
"@


# ── POWERSHELL LAUNCHER (optional für echte Ausführung) ─────
# Speichere dieses Script als: C:\Scripte\Start-Manager.ps1
# Öffnet den HTML-Manager im Standard-Browser

$htmlPath = Join-Path $PSScriptRoot "ScriptManager.html"
Start-Process $htmlPath


# ── SCRIPT-AUSFÜHRUNGS-WRAPPER ───────────────────────────────
# Für echte PS-Ausführung: Invoke-Script.ps1
# Wird vom Manager per WebView2 / Electron aufgerufen

param(
    [string]$ScriptId,
    [string]$Dateiname,
    [string]$Parameter = ""
)

$scriptPath = "C:\Scripte\$Dateiname"
$logDir     = "C:\Scripte\Logs"
$logFile    = Join-Path $logDir ("$(Get-Date -Format 'yyyy-MM-dd').log")
$timestamp  = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Log-Ordner anlegen falls nicht vorhanden
if(-not (Test-Path $logDir)){ New-Item -ItemType Directory -Path $logDir | Out-Null }

# Script ausführen
try {
    $output = & powershell.exe -NonInteractive -File $scriptPath $Parameter 2>&1
    $status = "OK"
    Add-Content -Path $logFile -Value "[$timestamp] [OK]    ID=$ScriptId | $Dateiname | $($output -join ' | ')"
} catch {
    $status = "FEHLER"
    Add-Content -Path $logFile -Value "[$timestamp] [ERR]   ID=$ScriptId | $Dateiname | $($_.Exception.Message)"
}

# CSV aktualisieren (LetztesAusfuehren)
$csvPath = "C:\Scripte\Configs\scripts.csv"
$csv = Import-Csv -Path $csvPath -Delimiter ";"
$csv | Where-Object { $_.ID -eq $ScriptId } | ForEach-Object {
    $_.LetztesAusfuehren = $timestamp
}
$csv | Export-Csv -Path $csvPath -Delimiter ";" -NoTypeInformation -Encoding UTF8

return $status
