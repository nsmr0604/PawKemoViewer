; Tauri NSIS installer hooks
; https://v2.tauri.app/distribute/windows-installer/#installer-hooks
;
; このマシン群では Windows ファイアウォールが「外向き既定 = 拒否」の設定の
; 場合があり、未署名 exe は明示的な送信許可ルールが無いと通信できない
; (os error 10013 / WSAEACCES)。
; インストール時に app.exe の外向き許可ルールを登録する。
; (管理者権限が無い場合は失敗するが無視され、インストール自体は続行する)

!macro NSIS_HOOK_POSTINSTALL
  nsExec::Exec 'netsh advfirewall firewall add rule name="PawKemoViewer (outbound allow)" dir=out action=allow program="$INSTDIR\app.exe" enable=yes'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  nsExec::Exec 'netsh advfirewall firewall delete rule name="PawKemoViewer (outbound allow)"'
!macroend
