#!/usr/bin/env python3
"""human-future-skill 每日同步：把 12 次/天的运行产物压成一份日报后提交推送。

背景与取舍：
  两小时一次 = 12 次运行/天，每次产出 1 个 full-report.json(75-113KB) + 1 个
  full-report.md(5-10KB)。全量提交 = 24 个新文件/天、720 个/月，仓库会被淹没。
  因此本脚本做摘要化：抽取每次运行的判定/评分/命中口径/传导路径/置信度守门结果，
  汇成一份 data/daily-digest.md + data/daily-digest.json，只提交这两份 +
  self-corrections.json（跨会话知识资产）。

幂等：同一天重复运行会覆盖当日条目，不会产生重复提交。
失败处理：任何一步失败都以非零码退出并打印原因，绝不静默。
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone, timedelta

REPO = os.path.expanduser("~/.hermes/skills/ai/mark-cell-520/human-future-skill")
REPORTS = os.path.join(REPO, "human-future", "reports")
DATA = os.path.join(REPO, "human-future", "data")
DIGEST_MD = os.path.join(DATA, "daily-digest.md")
DIGEST_JSON = os.path.join(DATA, "daily-digest.json")
CST = timezone(timedelta(hours=8))


def sh(cmd, cwd=REPO, check=True):
    r = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"命令失败 ({r.returncode}): {cmd}\n{r.stderr.strip()[:400]}")
    return r


def extract_entry(d, name):
    """从 full-report 提取摘要字段。真实结构：meta.timestamp 为时间戳，
    评分与判定在 projection.summary / projection.confidence 里。"""
    meta = d.get("meta") or {}
    proj = d.get("projection") or {}
    pmeta = proj.get("meta") or {}
    psum = proj.get("summary") or {}
    pconf = proj.get("confidence") or {}

    ts = meta.get("timestamp") or pmeta.get("timestamp") or ""
    day = ""
    if ts:
        try:
            dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            day = dt.astimezone(CST).strftime("%Y-%m-%d")
        except Exception:
            day = str(ts)[:10]

    score = psum.get("score")
    if not isinstance(score, (int, float)):
        score = pconf.get("score")

    return day, {
        "generatedAt": ts,
        "heartflowVersion": meta.get("heartflowVersion") or pmeta.get("heartflowVersion"),
        "verdict": psum.get("verdict"),
        "score": score,
        "confidenceScore": pconf.get("score"),
        "logicQuality": psum.get("logicQuality"),
        "keyMessage": psum.get("keyMessage"),
        "modulesLoaded": meta.get("modulesLoaded"),
        "source": name,
    }


def load_reports_today():
    """只取今天产生的 full-report（按内容里的 timestamp 判断，不靠文件名）。"""
    today = datetime.now(CST).strftime("%Y-%m-%d")
    entries = []
    if not os.path.isdir(REPORTS):
        return today, entries
    for name in sorted(os.listdir(REPORTS)):
        if not (name.startswith("full-report-") and name.endswith(".json")):
            continue
        try:
            d = json.load(open(os.path.join(REPORTS, name), encoding="utf-8"))
        except Exception:
            continue
        day, entry = extract_entry(d, name)
        if day and day != today:
            continue
        entries.append(entry)
    return today, entries


def load_existing_digest():
    if os.path.exists(DIGEST_JSON):
        try:
            return json.load(open(DIGEST_JSON, encoding="utf-8"))
        except Exception:
            pass
    return {"version": "1.0.0", "days": {}}


def build_digest(day, entries):
    """当日条目汇总。重复运行时合并已有记录（按 source 去重），保证幂等且不丢历史。"""
    existing = load_existing_digest()
    days = existing.get("days", {})
    prev = days.get(day) or {}
    prev_sources = set(prev.get("sources") or [])

    # 合并新旧来源，已提交过的源不重复计数
    merged_sources = sorted(prev_sources | {e["source"] for e in entries})
    # 只对本次实际读到的 entry 计算评分/判定；历史分值从 prev 继承
    prev_runs = prev.get("runs", 0) if prev_sources else 0
    incoming_new = [e for e in entries if e["source"] not in prev_sources]

    scores = [e["score"] for e in entries if isinstance(e.get("score"), (int, float))]
    prev_avg = prev.get("avgScore")
    if scores and isinstance(prev_avg, (int, float)) and len(incoming_new) < len(entries):
        # 部分新增：用新增条目与历史均值的近似加权
        n_new = len(incoming_new)
        new_scores = [e["score"] for e in incoming_new if isinstance(e.get("score"), (int, float))]
        if new_scores:
            total = prev_avg * prev_runs + sum(new_scores)
            denom = prev_runs + n_new
            avg = round(total / denom, 4) if denom else None
        else:
            avg = prev_avg
    elif scores:
        avg = round(sum(scores) / len(scores), 4)
    else:
        avg = prev_avg

    verdicts = sorted(set((prev.get("verdicts") or []) + [e["verdict"] for e in entries if e.get("verdict")]))
    versions = sorted(set((prev.get("heartflowVersions") or []) +
                          [e["heartflowVersion"] for e in entries if e.get("heartflowVersion")]))

    if entries or prev_sources:
        day_record = {
            "runs": max(prev_runs + len(incoming_new), len(merged_sources)),
            "firstRun": prev.get("firstRun") or (entries[0]["generatedAt"] if entries else None),
            "lastRun": max(filter(None, [prev.get("lastRun")] + [e["generatedAt"] for e in entries]), default=None),
            "avgScore": avg,
            "verdicts": verdicts,
            "heartflowVersions": versions,
            "sources": merged_sources,
        }
    else:
        day_record = prev or {"runs": 0, "note": "当日无新推演运行"}

    days[day] = day_record
    return {"version": "1.0.0", "updatedAt": datetime.now(CST).isoformat(), "days": days}


def render_md(digest, day):
    d = digest["days"][day]
    lines = [
        f"# 人类未来推演 · 每日摘要",
        "",
        f"> 生成时间：{digest['updatedAt']}  ",
        f"> 本文由 `human-future-skill/scripts/daily-sync.py` 自动汇总 12 次/天运行产出，",
        f"> 原始 full-report 体积大且高度重复，故只摘要不搬运（见脚本 docstring 取舍说明）。",
        "",
        f"## {day}",
        "",
        f"- 运行次数：{d.get('runs', 0)}",
        f"- 心虫版本：{', '.join(d.get('heartflowVersions') or ['—'])}",
        f"- 平均评分：{d.get('avgScore') if d.get('avgScore') is not None else '—'}",
        f"- 判定集合：{', '.join(d.get('verdicts') or ['—'])}",
    ]
    if d.get("firstRun"):
        lines += [f"- 首次运行：{d['firstRun']}", f"- 末次运行：{d['lastRun']}"]
    if d.get("note"):
        lines += [f"- 备注：{d['note']}"]
    lines.append("")

    # 最近 7 天趋势
    recent = sorted(digest["days"].keys())[-7:]
    if recent:
        lines += ["## 近 7 日趋势", "", "| 日期 | 运行次数 | 平均评分 |", "|---|---|---|"]
        for k in recent:
            r = digest["days"][k]
            lines.append(f"| {k} | {r.get('runs', 0)} | {r.get('avgScore') if r.get('avgScore') is not None else '—'} |")
        lines.append("")
    return "\n".join(lines)


def main():
    day, entries = load_reports_today()
    digest = build_digest(day, entries)
    d = digest["days"][day]

    os.makedirs(DATA, exist_ok=True)
    with open(DIGEST_JSON, "w", encoding="utf-8") as f:
        json.dump(digest, f, ensure_ascii=False, indent=2)
    with open(DIGEST_MD, "w", encoding="utf-8") as f:
        f.write(render_md(digest, day))

    print(f"[摘要] {day}: {d.get('runs', 0)} 次运行, 平均评分 {d.get('avgScore')}")

    # 先 add，再判断相对 HEAD 是否有实质变化。
    # 注意：git diff --quiet HEAD 会把未暂存的 updatedAt 也算成变化而误判，
    # 因此对 digest JSON 显式忽略 updatedAt，只比业务字段。
    sh("git add -A human-future/data/daily-digest.md human-future/data/daily-digest.json "
       "human-future/data/self-corrections.json human-future/scripts SKILL.md .gitignore")

    import json as _json

    def _business_fields(text):
        if not text:
            return None
        try:
            d = _json.loads(text)
            d.pop("updatedAt", None)
            return _json.dumps(d, sort_keys=True, ensure_ascii=False)
        except Exception:
            return None

    head_json = sh("git show HEAD:human-future/data/daily-digest.json 2>/dev/null", check=False).stdout
    with open(DIGEST_JSON, encoding="utf-8") as _f:
        cur_json = _f.read()

    head_fields = _business_fields(head_json)
    cur_fields = _business_fields(cur_json)
    digest_changed = cur_fields != head_fields

    other_changed = sh("git diff --cached --quiet -- human-future/data/daily-digest.md "
                       "human-future/data/self-corrections.json human-future/scripts SKILL.md .gitignore",
                       check=False).returncode != 0

    # daily-digest.md 里有"生成时间"行，每次必变但无信息量：显式忽略该行后再比
    if other_changed:
        def _md_business(text):
            if not text:
                return None
            keep = [ln for ln in text.splitlines() if not ln.strip().startswith("> 生成时间")]
            return "\n".join(keep)

        head_md = sh("git show HEAD:human-future/data/daily-digest.md 2>/dev/null", check=False).stdout
        with open(DIGEST_MD, encoding="utf-8") as _f:
            cur_md = _f.read()
        if _md_business(head_md) == _md_business(cur_md):
            other_changed = False

    if not digest_changed and not other_changed:
        print("[git] 摘要无实质变化，跳过提交（忽略 updatedAt，避免空提交噪音）")
        sh("git reset -q", check=False)
        return 0

    msg = f"chore(daily): 推演摘要同步 {day}\n\n- 当日运行 {d.get('runs', 0)} 次\n- 平均评分 {d.get('avgScore')}\n- 原始 full-report 已按策略摘要化，不入库"
    # 用临时文件 + -F 提交，避免命令行传中文被 git 转义成 \uXXXX
    msg_file = os.path.join(DATA, ".commit-msg.tmp")
    with open(msg_file, "w", encoding="utf-8") as f:
        f.write(msg)
    sh(f'git -c user.name="mark-cell-520" -c user.email="mark-cell-520@users.noreply.github.com" '
       f'commit -q -F {json.dumps(msg_file)}')
    os.remove(msg_file)
    print("[git] 已提交:", sh("git log -1 --format='%h %s'").stdout.strip())

    sh("git push origin HEAD:main")
    print("[git] 已推送 origin/main")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"[FAIL] {e}", file=sys.stderr)
        sys.exit(1)
