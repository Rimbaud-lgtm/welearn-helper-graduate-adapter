param([ValidateSet('OpenPopup','OpenOptions','RefreshOptions','ApplyUpdate','ReturnCourse','Calibrate','Start')][string]$Action)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;public class WeLearnActionInput{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);}
'@
function Get-EdgeRoot {
    $script:edgeProcess=Get-Process msedge | Where-Object MainWindowHandle -ne 0 | Select-Object -First 1
    if(!$script:edgeProcess){throw 'NO_EDGE_WINDOW'}
    return [System.Windows.Automation.AutomationElement]::FromHandle($script:edgeProcess.MainWindowHandle)
}
function Find-ById($root,$id){return $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,$id)))}
function Get-Address($root){return $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,'地址和搜索栏')))}
function Get-Url($root){return [Uri](Get-Address $root).GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value}
function Invoke-Control($node){if(!$node -or $node.Current.IsOffscreen -or !$node.Current.IsEnabled){throw 'CONTROL_NOT_AVAILABLE'};$node.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()}
function Open-Popup {
    $root=Get-EdgeRoot
    if(Find-ById $root 'settings'){return}
    $url=Get-Url $root
    if($url.Host -ne 'welearn.sflep.com' -or $url.AbsolutePath.ToLower() -ne '/student/studycourse.aspx'){throw 'NOT_TARGET_COURSE'}
    if([WeLearnActionInput]::GetForegroundWindow() -ne $script:edgeProcess.MainWindowHandle){(Get-Address $root).SetFocus()}
    if([WeLearnActionInput]::GetForegroundWindow() -ne $script:edgeProcess.MainWindowHandle){throw 'FOCUS_NOT_GRANTED;NO_CLICK'}
    $buttons=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)))
    $button=@($buttons | Where-Object {$_.Current.Name -match '^WeLearn 练习' -and !$_.Current.IsOffscreen})
    if($button.Count -ne 1){throw 'PINNED_ACTION_NOT_UNIQUE'}
    $point=$button[0].GetClickablePoint()
    [WeLearnActionInput]::SetCursorPos([int]$point.X,[int]$point.Y)|Out-Null
    [WeLearnActionInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
    [WeLearnActionInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
    Start-Sleep -Milliseconds 200
}
switch($Action){
    'OpenPopup'{Open-Popup}
    'OpenOptions'{Open-Popup;Invoke-Control (Find-ById (Get-EdgeRoot) 'settings')}
    'RefreshOptions'{$root=Get-EdgeRoot;$url=Get-Url $root;if($url.Scheme -ne 'chrome-extension' -or $url.AbsolutePath -ne '/options.html'){throw 'NOT_OPTIONS_PAGE'};Invoke-Control (Find-ById $root 'view_1003')}
    'ApplyUpdate'{Invoke-Control (Find-ById (Get-EdgeRoot) 'applyUpdate')}
    'ReturnCourse'{$root=Get-EdgeRoot;$tabs=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::TabItem)));$course=@($tabs | Where-Object {$_.Current.Name -match '^WE Learn(?: -|$)'});if($course.Count -ne 1){throw 'COURSE_TAB_NOT_UNIQUE'};$course[0].GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()}
    'Calibrate'{Open-Popup;Invoke-Control (Find-ById (Get-EdgeRoot) 'calibrate')}
    'Start'{Open-Popup;Invoke-Control (Find-ById (Get-EdgeRoot) 'start')}
}
Write-Output ($Action+' performed through verified controls')
