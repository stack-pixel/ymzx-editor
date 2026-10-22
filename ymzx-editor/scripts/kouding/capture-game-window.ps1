param([int]$GameProcessId = 0, [string]$OutputPath = '', [switch]$Screen)
if (-not $OutputPath) { $OutputPath = Join-Path (Get-Location) 'game-window.png' }
if ($GameProcessId -eq 0) {
  $gameCandidates = @(Get-Process -Name 'LetsGoClient-Win64-Shipping' -ErrorAction SilentlyContinue)
  if ($gameCandidates.Count -ne 1) { throw 'Expected exactly one running Yuanmeng game' }
  $GameProcessId = $gameCandidates[0].Id
}
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class InspectGameWindow {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X,Y; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref POINT p);
}
'@
[InspectGameWindow]::SetProcessDPIAware() | Out-Null
$window=(Get-Process -Id $GameProcessId).MainWindowHandle
$rect=New-Object InspectGameWindow+RECT
if(-not [InspectGameWindow]::GetWindowRect($window,[ref]$rect)){throw 'Cannot inspect game window'}
$width=$rect.Right-$rect.Left
$height=$rect.Bottom-$rect.Top
if($width -le 0 -or $height -le 0 -or $width -gt 10000 -or $height -gt 10000){throw 'Invalid window dimensions'}
$bmp=New-Object Drawing.Bitmap($width,$height)
$gfx=[Drawing.Graphics]::FromImage($bmp)
if($Screen){
 if([InspectGameWindow]::GetForegroundWindow() -ne $window){$gfx.Dispose();$bmp.Dispose();throw 'Screen capture requires target foreground'}
 $gfx.CopyFromScreen($rect.Left,$rect.Top,0,0,$bmp.Size)
 $ok=$true
}else{
 $dc=$gfx.GetHdc()
 try{$ok=[InspectGameWindow]::PrintWindow($window,$dc,2)}finally{$gfx.ReleaseHdc($dc)}
}
try{if(-not $ok){throw 'Window capture failed'}; $bmp.Save($OutputPath)}finally{$gfx.Dispose();$bmp.Dispose()}
$clientRect=New-Object InspectGameWindow+RECT
$clientOrigin=New-Object InspectGameWindow+POINT
if(-not [InspectGameWindow]::GetClientRect($window,[ref]$clientRect) -or -not [InspectGameWindow]::ClientToScreen($window,[ref]$clientOrigin)){throw 'Cannot read client bounds'}
[pscustomobject]@{path=$OutputPath;processId=$GameProcessId;processName=(Get-Process -Id $GameProcessId).ProcessName;width=$width;height=$height;left=$rect.Left;top=$rect.Top;clientLeft=$clientOrigin.X;clientTop=$clientOrigin.Y;clientWidth=$clientRect.Right;clientHeight=$clientRect.Bottom;source=$(if($Screen){'screen'}else{'PrintWindow'})}|ConvertTo-Json
