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
    # --- デビルアドボケイト指摘の追加ケース ---
    (
        "洗濯機 5kg SHARP ES-GE5H-W 全自動 ホワイト",
        "シャープ 全自動洗濯機 ES-GE5H SHARP 5kg 2023年製",
        True, "シャープ型番ES-GE5H(数字1桁挟み)を捕捉",
    ),
    (
        "電子レンジ 18L Panasonic NE-FL1A 単機能",
        "パナソニック オーブンレンジ NE-FL1A 18L 美品",
        True, "電子レンジ↔オーブンレンジ同義+型番一致",
    ),
    (
        "液晶テレビ 24型 SAMKYO LT24B ハイビジョン",
        "テレビ台 24型対応 ホワイト 木製 ローボード",
        False, "テレビ↔テレビ台(周辺商品)を除外",
    ),
    (
        "冷凍庫 60L 三菱 MF-U12 ホワイト",
        "三菱 冷凍冷蔵庫 MF-U12 60L 2023年製",
        True, "冷凍庫↔冷凍冷蔵庫同義+型番一致",
    ),
    (
        "全自動洗濯機 7kg HITACHI 日立 BW-V70 ビートウォッシュ",
        "日立 洗濯機 BW-V75 7.5kg 2023年製",
        False, "型番食い違い(BW-V70↔BW-V75)を除外",
    ),
    (
        "洗濯機 8kg パナソニック NA-FA80 部屋干し 静音設計",
        "パナソニック 洗濯機 NA-FA80 8kg ジャンク 通電のみ 部品取り",
        False, "ジャンク品を除外",
    ),
    (
        "掃除機 コードレス アイリスオーヤマ IC-SLDC スティック",
        "アイリスオーヤマ スティック掃除機 IC-SLDC 美品",
        True, "数字なしハイフン型番(IC-SLDC)を捕捉",
    ),
    (
        "テレビ 32V型 ハイセンス Hisense 32A4N 4K",
        "ハイセンス 液晶テレビ 32A4N 32V型 2023年製",
        True, "数字始まり型番(32A4N)を捕捉",
    ),
    (
        "冷蔵庫 320L AQUA アクア AQR-32N STAINLESS ステンレス",
        "STAINLESS スチールラック 5段 320L収納 大容量",
        False, "材質語STAINLESSをブランド誤認しない",
    ),
    # --- 3Dプリンター（全部¥4,980別物問題）の検証 ---
    (
        "Creality K2 Plus Combo 3Dプリンター 高速 大型",
        "Creality 3Dプリンター用 PLA フィラメント 1.75mm 1kg 純正",
        False, "本体↔フィラメント(消耗品)を除外",
    ),
    (
        "Creality K2 Plus Combo 3Dプリンター 高速 大型",
        "3Dプリンター ノズル 0.4mm 互換 10個セット",
        False, "本体↔ノズル(互換部品・セット)を除外",
    ),
    (
        "Bambu Lab P2S Combo 3Dプリンター 多色造形",
        "3Dプリンター スプール ホルダー スタンド 汎用",
        False, "本体↔ホルダー(付属品)を除外",
    ),
    (
        "Creality K2 Plus Combo 3Dプリンター 高速",
        "Creality K2 Plus 3Dプリンター 美品 動作確認済",
        True, "本体↔同一本体(ブランド+型番一致)",
    ),
    (
        "ELEGOO Neptune 4 Pro 3Dプリンター 高速",
        "ELEGOO Neptune 4 Pro 3Dプリンター 中古 動作品",
        True, "本体↔同一本体(ELEGOO Neptune4)",
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
