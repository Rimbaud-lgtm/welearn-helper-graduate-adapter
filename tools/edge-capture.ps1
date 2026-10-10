param([Parameter(Mandatory=$true)][string]$OutputPath)
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class WeLearnCapture { [DllImport("user32.dll")]public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);[DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out Rect r);public struct Rect{public int Left,Top,Right,Bottom;} }
'@
$edgeProcess=Get-Process msedge | Where-Object MainWindowHandle -ne 0 | Select-Object -First 1
if($null -eq $edgeProcess){throw 'No visible Edge window'}
$rect=New-Object WeLearnCapture+Rect
[WeLearnCapture]::GetWindowRect($edgeProcess.MainWindowHandle,[ref]$rect)|Out-Null
$bitmap=New-Object System.Drawing.Bitmap(($rect.Right-$rect.Left),($rect.Bottom-$rect.Top))
$graphics=[System.Drawing.Graphics]::FromImage($bitmap)
$dc=$graphics.GetHdc()
$ok=[WeLearnCapture]::PrintWindow($edgeProcess.MainWindowHandle,$dc,2)
$graphics.ReleaseHdc($dc)
if($ok){$bitmap.Save($OutputPath)}
$graphics.Dispose();$bitmap.Dispose()
if(!$ok){throw 'Window capture failed'}
Write-Output $OutputPath
