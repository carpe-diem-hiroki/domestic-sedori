"""Amazon↔ヤフオク マッチング精度の検証ハーネス

会話で実際に出た誤マッチ例・正例をラベル付きで検証する。
実行: backend で `.venv/Scripts/python.exe -m tests.test_matching`
"""
from app.services.matching import is_relevant

# (amazon_title, yahoo_title, expected_relevant, ラベル)
CASES: list[tuple[str, str, bool, str]] = [
    # --- 誤マッチ（False であるべき） ---
    (
        "洗濯機 5KG 一人暮らし 全自動洗濯機 最短11分洗濯 SAMKYO B500 ホワイト",
        "★ジャンク品★ニコン NIKON COOLPIX B500 ケース・説明書付 W0535",
        False, "別ジャンル(洗濯機↔カメラ, B500型番衝突)",
    ),
    (
        "洗濯機 5KG 全自動洗濯機 SAMKYO B500 ホワイト",
        "685(中古) シャープ 全自動電気洗濯機 ES-GE7H-T SHARP 7kg 2024年製",
        False, "別ブランド・別型番・別容量(SAMKYO5kg↔SHARP7kg)",
    ),
    (
        "アイリスオーヤマ 冷蔵庫 320L ブラック 幅63.5cm IRSN-32B-B 2ドア",
        "アイリスオーヤマ 25年製 冷蔵庫 洗濯機 2点セット 一人暮らし 新生活応援",
        False, "セット品(冷蔵庫+洗濯機2点セット)",
    ),
    (
        "ハイセンス 冷蔵庫 幅49cm 175L 一人暮らし スリム 大容量冷蔵室122L 静音",
        "【RKGRE-676】ハイセンス/124L 2ドア冷凍冷蔵庫/HR-B12HW/中古品/2024年製",
        False, "同ブランド別容量(175L↔124L)",
    ),
    (
        "ハイセンス 洗濯機 5.5kg 一人暮らし HW-T55H",
        "シャープ 洗濯機 ES-GE5H 5.5kg 2023年製",
        False, "別ブランド同容量(ハイセンス↔シャープ)",
    ),
    # --- 正しい一致（True であるべき） ---
    (
        "洗濯機 5KG 全自動洗濯機 SAMKYO B500 ホワイト",
        "動作保証 サムキョ 全自動洗濯機 SAMKYO B500 5kg 中古",
        True, "型番一致(SAMKYO B500)",
    ),
    (
        "ハイセンス 冷蔵庫 幅49cm 175L 一人暮らし スリム",
        "美品 ハイセンス 冷蔵庫 175L 2ドア HR-D1701 2023年製",
        True, "ブランド+容量一致(ハイセンス175L)",
    ),
    (
        "アイリスオーヤマ 冷蔵庫 320L IRSN-32B-B 2ドア",
        "美品 アイリスオーヤマ 冷蔵庫 IRSN-32B-B 320L 2023年製",
        True, "型番一致(IRSN-32B-B)",
    ),
    (
        "COMFEE' 洗濯機 5.5kg 全自動 コンパクト",
        "COMFEE' コンフィー 全自動洗濯機 5.5kg 2023年製 美品",
        True, "ブランド+容量一致(COMFEE 5.5kg)",
    ),
]


def run() -> int:
    passed = 0
    failed = 0
    for amazon, yahoo, expected, label in CASES:
        got = is_relevant(amazon, yahoo)
        ok = got == expected
        mark = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        else:
            failed += 1
        print(f"[{mark}] expected={expected} got={got}  {label}")
    print(f"\n=== {passed} passed / {failed} failed (total {len(CASES)}) ===")
    return failed


if __name__ == "__main__":
    import sys
    sys.exit(1 if run() else 0)
