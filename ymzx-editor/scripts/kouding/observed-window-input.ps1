param(
 [Parameter(Mandatory=$true)][int]$TargetProcessId,
 [Parameter(Mandatory=$true)][string]$ExpectedProcessName,
 [Parameter(Mandatory=$true)][int]$ExpectedWidth,
 [Parameter(Mandatory=$true)][int]$ExpectedHeight,
 [Parameter(Mandatory=$true)][ValidateSet('click','rightclick','drag','key','text','scroll','hold')][string]$Action,
 [int]$X=0,[int]$Y=0,[int]$ToX=0,[int]$ToY=0,[string]$Value='',[int]$DurationMs=500
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;using System.Runtime.InteropServices;
public class ObservedWindowInput {
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)] public struct POINT {public int X,Y;}
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h,uint message,UIntPtr wParam,IntPtr lParam,uint flags,uint timeout,out UIntPtr result);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,IntPtr p);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a,uint b,bool attach);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr extra);
 [DllImport("user32.dll")] public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
 [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk,wScan;public uint dwFlags,time;public UIntPtr extra; }
 [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx,dy;public uint data,flags,time;public UIntPtr extra; }
 [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public KEYBDINPUT key;[FieldOffset(0)] public MOUSEINPUT mouse; }
 [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type;public INPUTUNION u; }
 [DllImport("user32.dll",SetLastError=true)] public static extern uint SendInput(uint count,INPUT[] inputs,int size);
 public static bool SendUnicode(char c) {
  INPUT[] events=new INPUT[2];
  events[0].type=1;events[0].u.key.wScan=c;events[0].u.key.dwFlags=4;
  events[1].type=1;events[1].u.key.wScan=c;events[1].u.key.dwFlags=6;
  return SendInput(2,events,Marshal.SizeOf(typeof(INPUT)))==2;
 }
}
'@
[ObservedWindowInput]::SetProcessDPIAware() | Out-Null
$taskWindowProcess=Get-Process -Id $TargetProcessId -ErrorAction Stop
if($taskWindowProcess.ProcessName -ne $ExpectedProcessName){throw 'Target process changed'}
$taskWindow=$taskWindowProcess.MainWindowHandle
if($taskWindow -eq [IntPtr]::Zero){throw 'Target has no active window'}
if($ExpectedProcessName -eq 'browser' -and $taskWindowProcess.MainWindowTitle -ne 'WeGame'){throw 'Expected WeGame launcher window'}
function Guard-TaskWindow {
 $taskRect=New-Object ObservedWindowInput+RECT
 if(-not [ObservedWindowInput]::GetWindowRect($taskWindow,[ref]$taskRect)){throw 'Cannot read target window'}
 if(($taskRect.Right-$taskRect.Left) -ne $ExpectedWidth -or ($taskRect.Bottom-$taskRect.Top) -ne $ExpectedHeight){throw 'Window differs from inspected capture'}
 return $taskRect
}
$taskRect=Guard-TaskWindow
if($Action -in @('click','rightclick','drag','scroll') -and ($X -lt 0 -or $Y -lt 30 -or $X -ge $ExpectedWidth -or $Y -ge $ExpectedHeight)){throw 'Pointer start outside inspected client area'}
if($Action -eq 'scroll' -and ($Value -notmatch '^-?[1-9][0-9]?$' -or [Math]::Abs([int]$Value) -gt 30)){throw 'Bounded scroll ticks required'}
if($Action -eq 'drag' -and ($ToX -lt 0 -or $ToY -lt 30 -or $ToX -ge $ExpectedWidth -or $ToY -ge $ExpectedHeight)){throw 'Pointer end outside inspected client area'}
if($Action -eq 'key' -and $Value -notin @('{ENTER}','{ESC}','{TAB}','{BACKSPACE}','^a','^s','^c','^v','^{ENTER}')){throw 'Unsupported key'}
if($Action -eq 'hold' -and ($Value -notin @('W','A','S','D','SPACE') -or $DurationMs -lt 1 -or $DurationMs -gt 5000)){throw 'Bounded movement key hold required'}
[ObservedWindowInput]::SetForegroundWindow($taskWindow)|Out-Null
Start-Sleep -Milliseconds 200
if([ObservedWindowInput]::GetForegroundWindow() -ne $taskWindow){
 $taskForeground=[ObservedWindowInput]::GetForegroundWindow()
 $taskThread=[ObservedWindowInput]::GetWindowThreadProcessId($taskForeground,[IntPtr]::Zero)
 $taskCurrentThread=[ObservedWindowInput]::GetCurrentThreadId()
 $taskAttached=$false
 try {
  if($taskThread -ne $taskCurrentThread){$taskAttached=[ObservedWindowInput]::AttachThreadInput($taskCurrentThread,$taskThread,$true)}
  [ObservedWindowInput]::SetForegroundWindow($taskWindow)|Out-Null
 }finally{if($taskAttached){[ObservedWindowInput]::AttachThreadInput($taskCurrentThread,$taskThread,$false)|Out-Null}}
 Start-Sleep -Milliseconds 200
}
if([ObservedWindowInput]::GetForegroundWindow() -ne $taskWindow){
 # A visible, uncovered standard caption can receive a normal activation click.
 # Never click another window, a client control, or a title-bar system button.
 $taskRect=Guard-TaskWindow
 $taskCaptionPoint=New-Object ObservedWindowInput+POINT
 $taskCaptionPoint.X=$taskRect.Left+[int]($ExpectedWidth/2)
 $taskCaptionPoint.Y=$taskRect.Top+16
 $taskAtPoint=[ObservedWindowInput]::WindowFromPoint($taskCaptionPoint)
 $taskCaptionRoot=[ObservedWindowInput]::GetAncestor($taskAtPoint,2)
 [UIntPtr]$taskCaptionHit=[UIntPtr]::Zero
 $taskCaptionPacked=[IntPtr](($taskCaptionPoint.Y -shl 16) -bor ($taskCaptionPoint.X -band 65535))
 $taskCaptionResponse=[ObservedWindowInput]::SendMessageTimeout($taskWindow,0x0084,[UIntPtr]::Zero,$taskCaptionPacked,2,500,[ref]$taskCaptionHit)
 if($taskCaptionRoot -ne $taskWindow -or $taskCaptionResponse -eq [IntPtr]::Zero -or $taskCaptionHit.ToUInt64() -ne 2){throw 'Target did not receive foreground and its caption is not available; no input sent'}
 if(-not [ObservedWindowInput]::SetCursorPos($taskCaptionPoint.X,$taskCaptionPoint.Y)){throw 'Caption activation cursor move failed'}
 [ObservedWindowInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 try{Start-Sleep -Milliseconds 60}finally{[ObservedWindowInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}
 Start-Sleep -Milliseconds 200
 if([ObservedWindowInput]::GetForegroundWindow() -ne $taskWindow){throw 'Caption activation did not focus target; requested input not sent'}
}
$taskRect=Guard-TaskWindow
switch($Action){
 'rightclick' {
  if(-not [ObservedWindowInput]::SetCursorPos($taskRect.Left+$X,$taskRect.Top+$Y)){throw 'Cursor move failed'}
  [ObservedWindowInput]::mouse_event(8,0,0,0,[UIntPtr]::Zero)
  try{Start-Sleep -Milliseconds 60}finally{[ObservedWindowInput]::mouse_event(16,0,0,0,[UIntPtr]::Zero)}
 }
 'hold' {
  $taskVirtualKey=if($Value -eq 'SPACE'){[byte]32}else{[byte][char]$Value}
  [ObservedWindowInput]::keybd_event($taskVirtualKey,0,0,[UIntPtr]::Zero)
  try {
   $taskHeldMs=0
   while($taskHeldMs -lt $DurationMs){
    if([ObservedWindowInput]::GetForegroundWindow() -ne $taskWindow){throw 'Target lost foreground; movement stopped'}
    $taskRect=Guard-TaskWindow
    $taskSlice=[Math]::Min(50,$DurationMs-$taskHeldMs)
    Start-Sleep -Milliseconds $taskSlice
    $taskHeldMs+=$taskSlice
   }
  }finally{[ObservedWindowInput]::keybd_event($taskVirtualKey,0,2,[UIntPtr]::Zero)}
 }
 'scroll' {
  if(-not [ObservedWindowInput]::SetCursorPos($taskRect.Left+$X,$taskRect.Top+$Y)){throw 'Cursor move failed'}
  $taskTicks=[int]$Value
  for($taskStep=0;$taskStep -lt [Math]::Abs($taskTicks);$taskStep++){
   if([ObservedWindowInput]::GetForegroundWindow() -ne $taskWindow){throw 'Target lost foreground; scroll stopped'}
   $taskRect=Guard-TaskWindow
   $taskDelta=[int32](-120*[Math]::Sign($taskTicks))
   $taskData=[BitConverter]::ToUInt32([BitConverter]::GetBytes($taskDelta),0)
   [ObservedWindowInput]::mouse_event(0x0800,0,0,$taskData,[UIntPtr]::Zero)
   Start-Sleep -Milliseconds 45
  }
 }
 'click' {
  if(-not [ObservedWindowInput]::SetCursorPos($taskRect.Left+$X,$taskRect.Top+$Y)){throw 'Cursor move failed'}
  [ObservedWindowInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
  try{Start-Sleep -Milliseconds 60}finally{[ObservedWindowInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}
 }
 'drag' {
  if(-not [ObservedWindowInput]::SetCursorPos($taskRect.Left+$X,$taskRect.Top+$Y)){throw 'Cursor move failed'}
  [ObservedWindowInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
  try{
   Start-Sleep -Milliseconds 100
   for($taskStep=1;$taskStep -le 24;$taskStep++){
    if([ObservedWindowInput]::GetForegroundWindow() -ne $taskWindow){throw 'Target lost foreground; drag stopped'}
    $taskRect=Guard-TaskWindow
    [ObservedWindowInput]::SetCursorPos($taskRect.Left+$X+[int](($ToX-$X)*$taskStep/24),$taskRect.Top+$Y+[int](($ToY-$Y)*$taskStep/24))|Out-Null
    Start-Sleep -Milliseconds 25
   }
  }finally{[ObservedWindowInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}
 }
 'key' {[System.Windows.Forms.SendKeys]::SendWait($Value)}
 'text' {
  if($Value.Length -gt 4096){throw 'Text too long'}
  foreach($taskChar in $Value.ToCharArray()){
   if([ObservedWindowInput]::GetForegroundWindow() -ne $taskWindow){throw 'Target lost foreground; text entry stopped'}
   if(-not [ObservedWindowInput]::SendUnicode($taskChar)){throw 'Unicode text input failed'}
   Start-Sleep -Milliseconds 15
  }
 }
}
[pscustomobject]@{sent=$true;verified=$false;action=$Action;processId=$TargetProcessId;width=$ExpectedWidth;height=$ExpectedHeight}|ConvertTo-Json -Compress
