param([Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$TargetProcessId,[ValidateSet('inspect','choose')][string]$Action='inspect',[string]$FilesJson='')
$ErrorActionPreference='Stop'
$targetProcess=Get-Process -Id $TargetProcessId -ErrorAction Stop
if($targetProcess.ProcessName -ne 'LetsGoClient-Win64-Shipping'){throw 'Target process is not the game client'}
$inventory=(& (Join-Path $PSScriptRoot 'game-owned-windows.ps1') -TargetProcessId $TargetProcessId | ConvertFrom-Json)
$dialogs=@($inventory|Where-Object {$_.pid -eq $TargetProcessId -and $_.cls -eq '#32770' -and $_.visible -and $_.title -match '选择图片|打开'})
if($dialogs.Count -ne 1){throw 'Expected one live game-owned image picker'}
Add-Type @'
using System;using System.Text;using System.Collections.Generic;using System.Runtime.InteropServices;
public class NativeImagePicker {
 public delegate bool CB(IntPtr h,IntPtr l);
 [DllImport("user32.dll")]static extern bool EnumChildWindows(IntPtr h,CB c,IntPtr l);
 [DllImport("user32.dll")]static extern int GetClassName(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")]static extern int GetDlgCtrlID(IntPtr h);
 [DllImport("user32.dll")]static extern IntPtr GetParent(IntPtr h);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,string s);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="SendMessageW")]static extern IntPtr ReadMessage(IntPtr h,uint m,IntPtr w,StringBuilder s);
 public static string ReadEdit(IntPtr h){var s=new StringBuilder(8192);ReadMessage(h,13,(IntPtr)8192,s);return s.ToString();}
 [DllImport("user32.dll")]public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 public class Item{public long handle,parent;public int id;public string cls,text;public bool visible;}
 public static Item[] Children(IntPtr h){var list=new List<Item>();EnumChildWindows(h,(w,l)=>{var c=new StringBuilder(256);var t=new StringBuilder(8192);GetClassName(w,c,256);GetWindowText(w,t,8192);list.Add(new Item{handle=w.ToInt64(),parent=GetParent(w).ToInt64(),id=GetDlgCtrlID(w),cls=c.ToString(),text=t.ToString(),visible=IsWindowVisible(w)});return true;},IntPtr.Zero);return list.ToArray();}
}
'@
$dialog=$dialogs[0];$items=[NativeImagePicker]::Children([IntPtr]$dialog.handle)
if($Action -eq 'inspect'){ConvertTo-Json -InputObject @($items|Where-Object {$_.cls -match 'Edit|Combo|Button'}) -Depth 4;exit}
$files=@(Get-Content -LiteralPath $FilesJson -Raw -Encoding UTF8|ConvertFrom-Json)
if($files.Count -lt 1 -or $files.Count -gt 10){throw 'Expected 1..10 image files'}
$paths=@();foreach($f in $files){$p=(Resolve-Path -LiteralPath $f).ProviderPath;$isEntry=([IO.Path]::GetFileName($p) -eq 'GameEntry.lua' -and $dialog.title -eq '打开GameEntry.lua文件' -and $files.Count -eq 1);if([IO.Path]::GetExtension($p) -notin @('.png','.jpg','.jpeg','.bmp') -and -not $isEntry){throw 'Unsupported file type for the observed dialog'};$paths+=$p}
$combo=@($items|Where-Object {$_.cls -eq 'ComboBoxEx32' -and $_.id -eq 1148 -and $_.visible})
if($combo.Count -ne 1){throw 'Observed filename host 1148 differs'}
$sub=@($items|Where-Object {$_.cls -eq 'ComboBox' -and $_.parent -eq $combo[0].handle})
$edit=@($items|Where-Object {$_.cls -eq 'Edit' -and $_.parent -eq $sub[0].handle -and $_.visible})
$open=@($items|Where-Object {$_.cls -eq 'Button' -and $_.id -eq 1 -and $_.text -match '打开' -and $_.visible})
if($sub.Count -ne 1 -or $edit.Count -ne 1 -or $open.Count -ne 1){throw 'Filename edit / Open button missing or ambiguous'}
$value=($paths|ForEach-Object {'"'+$_+'"'}) -join ' '
[NativeImagePicker]::SendMessage([IntPtr]$edit[0].handle,12,[IntPtr]::Zero,$value)|Out-Null
$after=[NativeImagePicker]::ReadEdit([IntPtr]$edit[0].handle)
if($after -ne $value){throw 'Filename field readback failed'}
if(-not [NativeImagePicker]::PostMessage([IntPtr]$open[0].handle,245,[IntPtr]::Zero,[IntPtr]::Zero)){throw 'Open button dispatch failed'}
@{selected=$paths;dialogHandle=$dialog.handle;method='Game-owned standard file dialog, verified native filename control and Open button';uploadVerified=$false}|ConvertTo-Json -Depth 4
