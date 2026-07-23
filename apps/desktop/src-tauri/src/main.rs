// Evita o console extra do Windows em release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    orkai_desktop_lib::run()
}
