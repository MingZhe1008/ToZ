!include MUI2.nsh
!include nsDialogs.nsh
!include LogicLib.nsh
!include FileFunc.nsh

!ifndef BUILD_UNINSTALLER
Var ToZDesktop
Var ToZStartMenu
Var ToZAutoStart
Var ToZDesktopCheck
Var ToZMenuCheck
Var ToZAutoCheck

!macro customInit
  StrCpy $ToZDesktop ${BST_CHECKED}
  StrCpy $ToZStartMenu ${BST_CHECKED}
  StrCpy $ToZAutoStart ${BST_UNCHECKED}
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ToZ"
  ${If} $0 != ""
    StrCpy $ToZAutoStart ${BST_CHECKED}
  ${EndIf}
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/DESKTOP=" $R1
  ${IfNot} ${Errors}
    StrCpy $ToZDesktop $R1
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/STARTMENU=" $R1
  ${IfNot} ${Errors}
    StrCpy $ToZStartMenu $R1
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/AUTOSTART=" $R1
  ${IfNot} ${Errors}
    StrCpy $ToZAutoStart $R1
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom ToZOptionsPage ToZOptionsLeave
!macroend

Function ToZOptionsPage
  !insertmacro MUI_HEADER_TEXT "安装选项" "选择快捷方式和开机启动方式。"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 25u "ToZ 将离线保存您的任务。您可以在客户端设置中随时更改启动选项。"
  Pop $0
  ${NSD_CreateCheckbox} 0 38u 100% 14u "创建桌面快捷方式"
  Pop $ToZDesktopCheck
  ${NSD_SetState} $ToZDesktopCheck $ToZDesktop
  ${NSD_CreateCheckbox} 0 66u 100% 14u "创建开始菜单快捷方式"
  Pop $ToZMenuCheck
  ${NSD_SetState} $ToZMenuCheck $ToZStartMenu
  ${NSD_CreateCheckbox} 0 94u 100% 14u "当前账户登录 Windows 后自动启动 ToZ"
  Pop $ToZAutoCheck
  ${NSD_SetState} $ToZAutoCheck $ToZAutoStart
  ${NSD_CreateLabel} 0 130u 100% 30u "数据保存在当前用户的应用数据目录，升级或更改安装位置不会清空任务。卸载时默认保留任务与备份。"
  Pop $0
  nsDialogs::Show
FunctionEnd

Function ToZOptionsLeave
  ${NSD_GetState} $ToZDesktopCheck $ToZDesktop
  ${NSD_GetState} $ToZMenuCheck $ToZStartMenu
  ${NSD_GetState} $ToZAutoCheck $ToZAutoStart
FunctionEnd

!macro customInstall
  ${If} $ToZDesktop == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\ToZ.lnk" "$INSTDIR\ToZ.exe" "" "$INSTDIR\ToZ.exe" 0
  ${Else}
    Delete "$DESKTOP\ToZ.lnk"
  ${EndIf}
  ${If} $ToZStartMenu == ${BST_CHECKED}
    CreateShortCut "$SMPROGRAMS\ToZ.lnk" "$INSTDIR\ToZ.exe" "" "$INSTDIR\ToZ.exe" 0
  ${Else}
    Delete "$SMPROGRAMS\ToZ.lnk"
  ${EndIf}
  ${If} $ToZAutoStart == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ToZ" '$\"$INSTDIR\ToZ.exe$\" --autostart'
  ${Else}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ToZ"
  ${EndIf}
!macroend

!endif
!macro customUnInstall
  Delete "$DESKTOP\ToZ.lnk"
  Delete "$SMPROGRAMS\ToZ.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ToZ"
!macroend
