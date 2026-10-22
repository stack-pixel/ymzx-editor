param([Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$TargetProcessId)
$ErrorActionPreference='Stop'
$targetProcess=Get-Process -Id $TargetProcessId -ErrorAction Stop
if($targetProcess.ProcessName -ne 'LetsGoClient-Win64-Shipping'){throw 'Target process is not the game client'}
Add-Type @'
using System;using System.Text;using System.Runtime.InteropServices;using System.Collections.Generic;
public class GameOwnedWindows {
 public delegate bool Callback(IntPtr h,IntPtr l);
 [DllImport("user32.dll")]static extern bool EnumWindows(Callback c,IntPtr l);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")]static extern int GetWindowText(IntPtr h,StringBuilder b,int n);
 [DllImport("user32.dll")]static extern int GetClassName(IntPtr h,StringBuilder b,int n);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]static extern IntPtr GetWindow(IntPtr h,uint cmd);
 [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
 public class Row {public long handle,owner;public uint pid;public string title,cls;public bool visible,foreground;}
 public static Row[] List(uint target){var rows=new List<Row>();var fg=GetForegroundWindow();EnumWindows((h,l)=>{uint p;GetWindowThreadProcessId(h,out p);var owner=GetWindow(h,4);uint op;GetWindowThreadProcessId(owner,out op);var c=new StringBuilder(512);GetClassName(h,c,512);if(p==target||op==target||c.ToString()=="#32770"||h==fg){var t=new StringBuilder(512);GetWindowText(h,t,512);rows.Add(new Row{handle=h.ToInt64(),owner=owner.ToInt64(),pid=p,title=t.ToString(),cls=c.ToString(),visible=IsWindowVisible(h),foreground=h==fg});}return true;},IntPtr.Zero);return rows.ToArray();}
}
'@
ConvertTo-Json -InputObject ([GameOwnedWindows]::List($TargetProcessId)) -Depth 4
