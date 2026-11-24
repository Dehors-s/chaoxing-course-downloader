// 在 Windows Release 构建中隐藏黑色控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    chaoxing_downloader_lib::run()
}
