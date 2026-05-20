mod commands;

use commands::software::*;
use commands::supervisor::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_manifest,
            detect_all,
            check_latest_all,
            upgrade_software,
            cancel_upgrade,
            get_upgrade_history,
            list_locked,
            supervisor_status,
            supervisor_restart,
            supervisor_tail_log,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}
