// webclaw-upgrader 升级核心
// 数据驱动：从 software-manifest.json 加载能力，按 type 字段分发到处理器
// 所有需要 root 的子命令通过 sudo + /etc/sudoers.d/webclaw-upgrader 白名单提权

use anyhow::{anyhow, Context, Result};
use chrono::Local;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

// ─── 数据类型 ───────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct ManifestFile {
    #[allow(dead_code)]
    pub version: String,
    pub software: Vec<SoftwareEntry>,
    #[serde(default)]
    pub locked: Vec<LockedEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SoftwareEntry {
    pub id: String,
    pub name: String,
    pub category: String,
    pub risk: String,
    pub detect: DetectSpec,
    pub latest: LatestSpec,
    pub upgrade: UpgradeSpec,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LockedEntry {
    pub id: String,
    pub name: String,
    pub reason: String,
    #[serde(default)]
    pub dockerfile_line: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum DetectSpec {
    Dpkg { pkg: String },
    NpmGlobal { pkg: String },
    Shell { cmd: String, version_regex: String },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum LatestSpec {
    GithubRelease { repo: String },
    NpmRegistry { pkg: String },
    AptPolicy { pkg: String },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum UpgradeSpec {
    Apt {
        pkg: String,
        #[serde(default)]
        post_install: Vec<String>,
    },
    NpmGlobal {
        pkg: String,
        #[serde(default)]
        post_install: Vec<String>,
    },
    BinaryDownload {
        url_template: String,
        install_path: String,
        #[serde(default)]
        post_install: Vec<String>,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct SoftwareCard {
    pub id: String,
    pub name: String,
    pub category: String,
    pub risk: String,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub state: String, // up_to_date / upgradable / unknown / error / in_progress
    pub upgrade_in_progress: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub from_version: Option<String>,
    pub to_version: Option<String>,
    pub timestamp: String,
    pub status: String,
    pub command: String,
    pub stderr_tail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpgradeProgress {
    pub id: String,
    pub stage: String,
    pub percent: Option<f32>,
    pub line: Option<String>,
}

// ─── manifest 路径解析（Tauri resource → 生产 → 开发回退） ────────────

fn manifest_candidate_paths(app: &AppHandle) -> Vec<PathBuf> {
    let mut v = Vec::new();
    // 优先：Tauri bundle resource 目录（打包后的正式路径）
    // Linux 下 resource_dir 是 /usr/lib/<App Name>，资源在 _up_/ 子目录
    if let Ok(resource_dir) = app.path().resource_dir() {
        v.push(resource_dir.join("_up_/software-manifest.json"));
        v.push(resource_dir.join("software-manifest.json"));
    }
    // 生产 Linux 安装路径
    v.push(PathBuf::from("/usr/share/webclaw-upgrader/software-manifest.json"));
    // 开发期 CWD 相对路径
    v.push(PathBuf::from("../software-manifest.json"));
    v.push(PathBuf::from("software-manifest.json"));
    // 开发期：相对可执行文件（cargo run / tauri dev）
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            v.push(parent.join("../../software-manifest.json"));
            v.push(parent.join("../../../software-manifest.json"));
        }
    }
    v
}

async fn read_manifest(app: &AppHandle) -> Result<ManifestFile> {
    for p in manifest_candidate_paths(app) {
        if p.exists() {
            let content = tokio::fs::read_to_string(&p)
                .await
                .with_context(|| format!("read manifest {}", p.display()))?;
            let m: ManifestFile = serde_json::from_str(&content).context("parse manifest")?;
            return Ok(m);
        }
    }
    Err(anyhow!(
        "software-manifest.json 未找到（已尝试 Tauri resource 目录、/usr/share、相对路径、可执行文件邻近）"
    ))
}

#[tauri::command]
pub async fn load_manifest(app: AppHandle) -> Result<Vec<SoftwareEntry>, String> {
    let m = read_manifest(&app).await.map_err(|e| e.to_string())?;
    Ok(m.software)
}

// ─── 架构 ───────────────────────────────────────────

fn current_arch() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "amd64"
    }
}

// ─── 检测当前版本 ───────────────────────────────────

async fn detect_one(spec: &DetectSpec) -> Result<Option<String>> {
    match spec {
        DetectSpec::Dpkg { pkg } => detect_dpkg(pkg).await,
        DetectSpec::NpmGlobal { pkg } => detect_npm_global(pkg).await,
        DetectSpec::Shell { cmd, version_regex } => detect_shell(cmd, version_regex).await,
    }
}

async fn detect_dpkg(pkg: &str) -> Result<Option<String>> {
    let out = Command::new("dpkg-query")
        .args(["-W", "-f=${Version}", pkg])
        .output()
        .await
        .context("dpkg-query spawn failed")?;
    if !out.status.success() {
        return Ok(None);
    }
    let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if v.is_empty() {
        Ok(None)
    } else {
        Ok(Some(strip_apt_version(&v)))
    }
}

fn strip_apt_version(v: &str) -> String {
    // 把 "1.16.3-1ubuntu1" 转为 "1.16.3"
    v.split(|c: char| c == '-' || c == '+' || c == '~')
        .next()
        .unwrap_or(v)
        .to_string()
}

async fn detect_npm_global(pkg: &str) -> Result<Option<String>> {
    let out = Command::new("npm")
        .args(["ls", "-g", pkg, "--depth=0", "--json"])
        .output()
        .await
        .context("npm ls spawn failed")?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let json: serde_json::Value = serde_json::from_str(&stdout).unwrap_or(serde_json::Value::Null);
    let pointer = format!("/dependencies/{}/version", pkg.replace('/', "~1"));
    let v = json
        .pointer(&pointer)
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    Ok(v)
}

async fn detect_shell(cmd: &str, version_regex: &str) -> Result<Option<String>> {
    let out = Command::new("bash")
        .args(["-c", cmd])
        .output()
        .await
        .context("shell detect spawn failed")?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let re = Regex::new(version_regex).context("bad version_regex in manifest")?;
    Ok(re
        .captures(&stdout)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string()))
}

#[tauri::command]
pub async fn detect_all(app: AppHandle) -> Result<Vec<SoftwareCard>, String> {
    let manifest = read_manifest(&app).await.map_err(|e| e.to_string())?;
    let mut handles = Vec::new();
    for entry in manifest.software {
        let h = tokio::spawn(async move {
            let cur = detect_one(&entry.detect).await.unwrap_or(None);
            SoftwareCard {
                id: entry.id,
                name: entry.name,
                category: entry.category,
                risk: entry.risk,
                current_version: cur,
                latest_version: None,
                state: "unknown".into(),
                upgrade_in_progress: false,
                error: None,
            }
        });
        handles.push(h);
    }
    let mut cards = Vec::new();
    for h in handles {
        if let Ok(c) = h.await {
            cards.push(c);
        }
    }
    Ok(cards)
}

// ─── 查询最新版 ─────────────────────────────────────

static HTTP: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .user_agent("webclaw-upgrader/0.1")
        .timeout(Duration::from_secs(15))
        .build()
        .expect("build reqwest client")
});

async fn fetch_latest(spec: &LatestSpec) -> Result<Option<String>> {
    match spec {
        LatestSpec::GithubRelease { repo } => fetch_github(repo).await,
        LatestSpec::NpmRegistry { pkg } => fetch_npm(pkg).await,
        LatestSpec::AptPolicy { pkg } => fetch_apt_policy(pkg).await,
    }
}

async fn fetch_github(repo: &str) -> Result<Option<String>> {
    let url = format!("https://api.github.com/repos/{}/releases/latest", repo);
    let resp = HTTP.get(&url).send().await.context("github request")?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let j: serde_json::Value = resp.json().await.context("github json")?;
    Ok(j.get("tag_name")
        .and_then(|v| v.as_str())
        .map(|s| s.trim_start_matches('v').to_string()))
}

async fn fetch_npm(pkg: &str) -> Result<Option<String>> {
    // @scope/name 中的 / 需要 url-encode
    let encoded = pkg.replace('/', "%2F");
    let url = format!("https://registry.npmjs.org/{}/latest", encoded);
    let resp = HTTP.get(&url).send().await.context("npm request")?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let j: serde_json::Value = resp.json().await.context("npm json")?;
    Ok(j.get("version")
        .and_then(|v| v.as_str())
        .map(String::from))
}

async fn fetch_apt_policy(pkg: &str) -> Result<Option<String>> {
    let out = Command::new("apt-cache")
        .args(["policy", pkg])
        .output()
        .await
        .context("apt-cache policy spawn failed")?;
    if !out.status.success() {
        return Ok(None);
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let re = Regex::new(r"Candidate:\s*(\S+)").unwrap();
    Ok(re
        .captures(&stdout)
        .and_then(|c| c.get(1))
        .map(|m| strip_apt_version(m.as_str())))
}

#[tauri::command]
pub async fn check_latest_all(app: AppHandle) -> Result<Vec<SoftwareCard>, String> {
    let manifest = read_manifest(&app).await.map_err(|e| e.to_string())?;
    let mut handles = Vec::new();
    for entry in manifest.software {
        let h = tokio::spawn(async move {
            let (cur_res, latest_res) =
                tokio::join!(detect_one(&entry.detect), fetch_latest(&entry.latest));
            let cur = cur_res.unwrap_or(None);
            let latest = latest_res.unwrap_or(None);
            let state = compute_state(cur.as_deref(), latest.as_deref());
            SoftwareCard {
                id: entry.id,
                name: entry.name,
                category: entry.category,
                risk: entry.risk,
                current_version: cur,
                latest_version: latest,
                state,
                upgrade_in_progress: false,
                error: None,
            }
        });
        handles.push(h);
    }
    let mut cards = Vec::new();
    for h in handles {
        if let Ok(c) = h.await {
            cards.push(c);
        }
    }
    Ok(cards)
}

fn compute_state(cur: Option<&str>, latest: Option<&str>) -> String {
    match (cur, latest) {
        (Some(c), Some(l)) if c == l => "up_to_date".into(),
        (Some(c), Some(l)) if version_lt(c, l) => "upgradable".into(),
        (Some(_), Some(_)) => "up_to_date".into(), // 当前 >= latest 视为最新
        (None, _) => "unknown".into(),
        (Some(_), None) => "unknown".into(),
    }
}

// 简单语义版本比较：1.2.3 < 1.2.4
// 不完整但足够区分大多数情况
fn version_lt(a: &str, b: &str) -> bool {
    let parse = |s: &str| -> Vec<u64> {
        s.split('.')
            .map(|p| p.chars().take_while(|c| c.is_ascii_digit()).collect::<String>())
            .map(|s| s.parse::<u64>().unwrap_or(0))
            .collect()
    };
    let va = parse(a);
    let vb = parse(b);
    let n = va.len().max(vb.len());
    for i in 0..n {
        let x = *va.get(i).unwrap_or(&0);
        let y = *vb.get(i).unwrap_or(&0);
        if x < y {
            return true;
        }
        if x > y {
            return false;
        }
    }
    false
}

// ─── 升级 ───────────────────────────────────────────

fn build_upgrade_command(entry: &SoftwareEntry, latest_version: &str) -> Vec<String> {
    match &entry.upgrade {
        UpgradeSpec::Apt { pkg, .. } => vec![
            "sudo".into(),
            "apt-get".into(),
            "install".into(),
            "-y".into(),
            "--only-upgrade".into(),
            pkg.clone(),
        ],
        UpgradeSpec::NpmGlobal { pkg, .. } => vec![
            "sudo".into(),
            "npm".into(),
            "install".into(),
            "-g".into(),
            format!("{}@latest", pkg),
        ],
        UpgradeSpec::BinaryDownload {
            url_template,
            install_path,
            ..
        } => {
            let arch = current_arch();
            let url = url_template
                .replace("{version}", latest_version)
                .replace("{arch}", arch);
            // 单行 shell：下载 → 解压 → 替换
            let script = format!(
                "set -euo pipefail; \
                 TMPDIR=$(mktemp -d); \
                 curl -fsSL '{url}' -o $TMPDIR/upgrade.tar.gz; \
                 sudo tar -xzf $TMPDIR/upgrade.tar.gz -C $TMPDIR/; \
                 INNER=$(tar -tzf $TMPDIR/upgrade.tar.gz | head -1 | cut -d/ -f1); \
                 sudo rm -rf '{install_path}'; \
                 sudo mv $TMPDIR/$INNER '{install_path}'; \
                 sudo rm -rf $TMPDIR"
            );
            vec!["bash".into(), "-c".into(), script]
        }
    }
}

fn post_install_of(entry: &SoftwareEntry) -> Vec<String> {
    match &entry.upgrade {
        UpgradeSpec::Apt { post_install, .. } => post_install.clone(),
        UpgradeSpec::NpmGlobal { post_install, .. } => post_install.clone(),
        UpgradeSpec::BinaryDownload { post_install, .. } => post_install.clone(),
    }
}

#[tauri::command]
pub async fn upgrade_software(
    app: AppHandle,
    id: String,
    snapshot_confirmed: bool,
) -> Result<(), String> {
    if !snapshot_confirmed {
        return Err("请先勾选「已完成卷快照」再升级".into());
    }
    let manifest = read_manifest(&app).await.map_err(|e| e.to_string())?;
    let entry = manifest
        .software
        .into_iter()
        .find(|e| e.id == id)
        .ok_or_else(|| format!("未知软件 id: {}", id))?;

    let _ = app.emit(
        "upgrade-progress",
        UpgradeProgress {
            id: id.clone(),
            stage: "checking".into(),
            percent: Some(5.0),
            line: Some("查询最新版本...".into()),
        },
    );

    let latest = fetch_latest(&entry.latest)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "无法获取最新版本号".to_string())?;
    let current = detect_one(&entry.detect).await.unwrap_or(None);

    let cmd_vec = build_upgrade_command(&entry, &latest);
    let cmd_display = cmd_vec.join(" ");

    let history_start = HistoryEntry {
        id: id.clone(),
        from_version: current.clone(),
        to_version: Some(latest.clone()),
        timestamp: Local::now().to_rfc3339(),
        status: "running".into(),
        command: cmd_display.clone(),
        stderr_tail: None,
    };
    let _ = append_history(&history_start).await;

    let _ = app.emit(
        "upgrade-progress",
        UpgradeProgress {
            id: id.clone(),
            stage: "installing".into(),
            percent: Some(15.0),
            line: Some(format!("$ {}", cmd_display)),
        },
    );

    let result = run_upgrade_cmd(&app, &id, &cmd_vec).await;

    // post_install（即使主升级失败也跳过 post_install）
    let stderr_tail_after = if let Ok(ref tail) = result {
        // 跑 post_install
        let mut post_err: Option<String> = None;
        for cmdline in post_install_of(&entry) {
            let _ = app.emit(
                "upgrade-progress",
                UpgradeProgress {
                    id: id.clone(),
                    stage: "restarting".into(),
                    percent: Some(90.0),
                    line: Some(format!("$ sudo bash -c '{}'", cmdline)),
                },
            );
            let st = Command::new("sudo")
                .args(["bash", "-c", &cmdline])
                .status()
                .await;
            match st {
                Ok(s) if s.success() => {}
                Ok(s) => {
                    post_err = Some(format!("post_install 退出码 {}: {}", s.code().unwrap_or(-1), cmdline));
                    break;
                }
                Err(e) => {
                    post_err = Some(format!("post_install spawn 失败: {}", e));
                    break;
                }
            }
        }
        if let Some(e) = post_err {
            Some(e)
        } else {
            tail.clone()
        }
    } else {
        None
    };

    let mut history_end = history_start.clone();
    match &result {
        Ok(_) if stderr_tail_after.as_ref().map(|s| s.starts_with("post_install")).unwrap_or(false) => {
            history_end.status = "failed".into();
            history_end.stderr_tail = stderr_tail_after.clone();
        }
        Ok(_) => {
            history_end.status = "success".into();
            history_end.stderr_tail = stderr_tail_after.clone();
        }
        Err(e) => {
            history_end.status = "failed".into();
            history_end.stderr_tail = Some(e.clone());
        }
    }
    let _ = append_history(&history_end).await;

    match (result, &history_end.status[..]) {
        (Ok(_), "success") => {
            let _ = app.emit(
                "upgrade-progress",
                UpgradeProgress {
                    id: id.clone(),
                    stage: "done".into(),
                    percent: Some(100.0),
                    line: Some("升级完成".into()),
                },
            );
            Ok(())
        }
        (Ok(_), _) => {
            let msg = history_end.stderr_tail.clone().unwrap_or_else(|| "post_install 失败".into());
            let _ = app.emit(
                "upgrade-progress",
                UpgradeProgress {
                    id: id.clone(),
                    stage: "error".into(),
                    percent: None,
                    line: Some(msg.clone()),
                },
            );
            Err(msg)
        }
        (Err(e), _) => {
            let _ = app.emit(
                "upgrade-progress",
                UpgradeProgress {
                    id: id.clone(),
                    stage: "error".into(),
                    percent: None,
                    line: Some(e.clone()),
                },
            );
            Err(e)
        }
    }
}

async fn run_upgrade_cmd(
    app: &AppHandle,
    id: &str,
    cmd_vec: &[String],
) -> Result<Option<String>, String> {
    let mut child = Command::new(&cmd_vec[0])
        .args(&cmd_vec[1..])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("spawn failed: {}", e))?;

    let stdout = child.stdout.take().expect("piped");
    let stderr = child.stderr.take().expect("piped");

    let app_a = app.clone();
    let id_a = id.to_string();
    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_a.emit(
                "upgrade-progress",
                UpgradeProgress {
                    id: id_a.clone(),
                    stage: "installing".into(),
                    percent: Some(50.0),
                    line: Some(line),
                },
            );
        }
    });

    let app_b = app.clone();
    let id_b = id.to_string();
    let stderr_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let stderr_buf_clone = stderr_buf.clone();
    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            {
                let mut buf = stderr_buf_clone.lock().await;
                buf.push_str(&line);
                buf.push('\n');
                if buf.len() > 4096 {
                    let n = buf.len() - 4000;
                    *buf = buf.split_off(n);
                }
            }
            let _ = app_b.emit(
                "upgrade-progress",
                UpgradeProgress {
                    id: id_b.clone(),
                    stage: "installing".into(),
                    percent: Some(50.0),
                    line: Some(format!("[stderr] {}", line)),
                },
            );
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("wait failed: {}", e))?;
    let _ = stdout_task.await;
    let _ = stderr_task.await;
    let err_buf = stderr_buf.lock().await.clone();

    if !status.success() {
        return Err(format!(
            "升级命令退出码 {}（详见输出）\n{}",
            status.code().unwrap_or(-1),
            err_buf
        ));
    }

    Ok(if err_buf.is_empty() { None } else { Some(err_buf) })
}

#[tauri::command]
pub async fn cancel_upgrade(_id: String) -> Result<(), String> {
    // v0.1：暂不支持取消正在运行的升级（kill_on_drop 会在 Tauri 退出时清理）
    // v0.2 计划：维护 PID 表 + libc::kill(pid, SIGTERM)
    Err("v0.1 暂不支持取消运行中的升级；如必要请关闭窗口（子进程会自动终止）".into())
}

// ─── upgrade history ──────────────────────────────────

fn history_path() -> PathBuf {
    if let Some(d) = dirs::data_local_dir() {
        d.join("webclaw-upgrader").join("history.json")
    } else {
        PathBuf::from("/tmp/webclaw-upgrader-history.json")
    }
}

async fn append_history(entry: &HistoryEntry) -> Result<()> {
    let path = history_path();
    if let Some(parent) = path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    let mut list: Vec<HistoryEntry> = if path.exists() {
        let content = tokio::fs::read_to_string(&path).await.unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };
    list.push(entry.clone());
    if list.len() > 100 {
        let cut = list.len() - 100;
        list.drain(0..cut);
    }
    let json = serde_json::to_string_pretty(&list)?;
    tokio::fs::write(&path, json).await?;
    Ok(())
}

#[tauri::command]
pub async fn get_upgrade_history() -> Result<Vec<HistoryEntry>, String> {
    let path = history_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| e.to_string())?;
    let list: Vec<HistoryEntry> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(list.into_iter().rev().take(20).collect())
}

// ─── locked entries 暴露 ─────────────────────────────

#[tauri::command]
pub async fn list_locked(app: AppHandle) -> Result<Vec<LockedEntry>, String> {
    let m = read_manifest(&app).await.map_err(|e| e.to_string())?;
    Ok(m.locked)
}
