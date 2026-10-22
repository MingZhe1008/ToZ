!include MUI2.nsh
!include nsDialogs.nsh
!include LogicLib.nsh
!include FileFunc.nsh

; Use Windows interface typography and ToZ's neutral surfaces.
SetFont "Microsoft YaHei UI" 9
!define MUI_BGCOLOR "F8F8F7"
!define MUI_TEXTCOLOR "252527"
!define MUI_FINISHPAGE_TITLE "一切就绪。"
!define MUI_FINISHPAGE_TEXT "ToZ 已准备好。为今天，做好一件小事。$\r$\n$\r$\n任务保存在当前账户的数据目录，与程序安装位置分开。卸载默认保留任务与备份。"
!define MUI_FINISHPAGE_RUN_TEXT "启动 ToZ"

!ifndef BUILD_UNINSTALLER
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "为日常，留一个位置。"
  !define MUI_WELCOMEPAGE_TEXT "ToZ 是一个离线待办工作台。$\r$\n$\r$\n接下来选择安装范围、程序目录和使用习惯。无需账户，不依赖业务服务器。$\r$\n$\r$\n升级或更换安装位置，不会清空当前账户的任务。"
  !insertmacro MUI_PAGE_WELCOME
!macroend
Var ToZDesktop
Var ToZStartMenu
Var ToZAutoStart
Var ToZDesktopCheck
Var ToZMenuCheck
Var ToZAutoCheck
Var ToZHostStartup

!macro customInit
  StrCpy $ToZHostStartup "0"
  StrCpy $ToZDesktop ${BST_CHECKED}
  StrCpy $ToZStartMenu ${BST_CHECKED}
  StrCpy $ToZAutoStart ${BST_UNCHECKED}
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ToZ"
  ${If} $0 != ""
    StrCpy $ToZAutoStart ${BST_CHECKED}
  ${EndIf}
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/HOSTSTARTUP=" $R1
  ${IfNot} ${Errors}
    StrCpy $ToZHostStartup $R1
  ${EndIf}
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
  !insertmacro MUI_HEADER_TEXT "按你的习惯开始。" "快捷方式与启动方式由你决定，以后也可以在设置中调整。"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  SetCtlColors $0 "252527" "F8F8F7"
  ${NSD_CreateLabel} 0 0 100% 25u "你的任务，留在本机。程序与数据分开保存。"
  Pop $0
  SetCtlColors $0 "64646A" "F8F8F7"
  ${NSD_CreateCheckbox} 0 38u 100% 14u "创建桌面快捷方式"
  Pop $ToZDesktopCheck
  SetCtlColors $ToZDesktopCheck "252527" "F8F8F7"
  ${NSD_SetState} $ToZDesktopCheck $ToZDesktop
  ${NSD_CreateCheckbox} 0 66u 100% 14u "添加到开始菜单"
  Pop $ToZMenuCheck
  SetCtlColors $ToZMenuCheck "252527" "F8F8F7"
  ${NSD_SetState} $ToZMenuCheck $ToZStartMenu
  ${NSD_CreateCheckbox} 0 94u 100% 14u "当前账户登录 Windows 后自动启动 ToZ"
  Pop $ToZAutoCheck
  SetCtlColors $ToZAutoCheck "252527" "F8F8F7"
  ${NSD_SetState} $ToZAutoCheck $ToZAutoStart
  ${NSD_CreateLabel} 0 130u 100% 30u "自启动默认关闭，由你选择是否开启。$\r$\n升级不清空任务；卸载时默认保留任务与备份。"
  Pop $0
  SetCtlColors $0 "64646A" "F8F8F7"
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
  ${If} $ToZHostStartup != "1"
  ${If} $ToZAutoStart == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ToZ" '$\"$INSTDIR\ToZ.exe$\" --autostart'
  ${Else}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ToZ"
  ${EndIf}
  ${EndIf}
!macroend

!endif
!macro customUnInstall
  Delete "$DESKTOP\ToZ.lnk"
  Delete "$SMPROGRAMS\ToZ.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ToZ"
!macroend
