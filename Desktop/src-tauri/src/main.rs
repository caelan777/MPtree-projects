// No console window behind the app in a release build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mptree_desktop_lib::run()
}
