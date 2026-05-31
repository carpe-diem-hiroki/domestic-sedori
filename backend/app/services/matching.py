"""商品マッチング: Amazon商品タイトルとヤフオク出品の関連性を判定する

無関係な商品（別ジャンル/別ブランド/別容量/別型番/セット品/ジャンク）を
価格差候補から除外し、同一商品レベルの精度で照合するためのユーティリティ。

デビルアドボケイト・レビューの指摘を反映:
 - 型番正規表現を日本の主要型番（ES-GE7H-T, 32A4N, IC-SLDC 等）に対応
 - ブランド誤爆対策（材質/色/機能語をブロック、既知ブランド拡充）
 - カテゴリを同義クラス化＋周辺商品（テレビ台等）を除外
 - 容量はカテゴリ別の単位で抽出（洗濯機=kg / 冷蔵庫等=L / 炊飯器=合）
 - ジャンク品は相場を汚すため除外
"""
import re
import statistics

# ===== カテゴリ（同義語は同一クラスにまとめる） =====
CATEGORY_CLASSES: list[set[str]] = [
    {"電子レンジ", "オーブンレンジ", "スチームオーブンレンジ", "単機能レンジ", "レンジ"},
    {"冷蔵庫", "冷凍冷蔵庫", "冷蔵冷凍庫", "冷凍庫", "ワインセラー"},
    {"洗濯機", "全自動洗濯機", "ドラム式洗濯機", "二槽式洗濯機", "洗濯乾燥機"},
    {"衣類乾燥機", "乾燥機"},
    {"テレビ", "液晶テレビ", "有機ELテレビ"},
    {"扇風機", "サーキュレーター"},
    {"掃除機", "ロボット掃除機", "スティック掃除機", "コードレス掃除機"},
    {"モニター", "ディスプレイ"},
    {"電気ケトル", "ケトル"},
    {"食洗機", "食器洗い乾燥機", "食器洗い機"},
    {"時計", "腕時計"},
    # 単独カテゴリ
    {"炊飯器"}, {"エアコン"}, {"ドライヤー"}, {"加湿器"}, {"除湿機"},
    {"空気清浄機"}, {"トースター"}, {"コーヒーメーカー"}, {"ヒーター"},
    {"ストーブ"}, {"こたつ"}, {"アイロン"}, {"ミシン"}, {"カメラ"},
    {"スピーカー"}, {"イヤホン"}, {"ヘッドホン"},
    {"3Dプリンター", "3Dプリンタ", "光造形", "FDMプリンター"},
    {"プリンター", "プリンタ", "インクジェットプリンター", "レーザープリンター", "複合機"},
    {"ホットプレート"}, {"コンロ"}, {"グリル"},
]
# 全カテゴリ語（最長一致用）
CATEGORY_WORDS = sorted(
    {w for c in CATEGORY_CLASSES for w in c}, key=len, reverse=True
)

# カテゴリ語に付くと「周辺商品（本体ではない）」になる接尾辞
_PERIPHERAL_SUFFIXES = [
    "台", "ボード", "スタンド", "ラック", "カバー", "マット", "フード",
    "用", "シート", "ケース", "収納", "掛け", "置き", "パッド",
]


def extract_category(title: str) -> str | None:
    """タイトルから商品カテゴリ語を抽出（最長一致）"""
    if not title:
        return None
    for w in CATEGORY_WORDS:
        if w in title:
            return w
    return None


def _category_class(word: str | None) -> set[str]:
    if not word:
        return set()
    for c in CATEGORY_CLASSES:
        if word in c:
            return c
    return {word}


def _strip_peripherals(text: str) -> str:
    """周辺商品の複合語（テレビ台/レンジ台/冷蔵庫マット等）を除去"""
    for c in CATEGORY_WORDS:
        for suf in _PERIPHERAL_SUFFIXES:
            text = text.replace(c + suf, "")
    return text


def category_in(amazon_category: str | None, yahoo_title: str) -> bool:
    """同義クラスのいずれかが（周辺商品を除いた）ヤフオク側に含まれるか"""
    if not amazon_category:
        return True
    cleaned = _strip_peripherals(yahoo_title or "")
    return any(w in cleaned for w in _category_class(amazon_category))


# ===== ブランド =====
KNOWN_BRANDS = [
    "パナソニック", "Panasonic", "日立", "HITACHI", "東芝", "TOSHIBA",
    "シャープ", "SHARP", "三菱", "MITSUBISHI", "ハイセンス", "Hisense",
    "ハイアール", "Haier", "アイリスオーヤマ", "アイリス", "IRIS", "山善", "YAMAZEN",
    "アクア", "AQUA", "COMFEE", "コンフィー", "ニトリ", "無印良品",
    "ツインバード", "TWINBIRD", "コイズミ", "KOIZUMI", "ソニー", "SONY",
    "シャオミ", "Xiaomi", "バルミューダ", "BALMUDA", "デロンギ", "DeLonghi",
    "ダイソン", "Dyson", "象印", "ZOJIRUSHI", "タイガー", "TIGER",
    "ニコン", "Nikon", "キヤノン", "Canon", "フィリップス", "PHILIPS",
    # 追加（家電せどり頻出ブランド）
    "ダイキン", "DAIKIN", "コロナ", "CORONA", "富士通", "FUJITSU",
    "リンナイ", "RINNAI", "ノーリツ", "NORITZ", "マクスゼン", "MAXZEN",
    "船井", "FUNAI", "オリオン", "ORION", "エプソン", "EPSON",
    "ブラザー", "BROTHER", "ジャノメ", "JANOME", "リコー", "RICOH",
    "アンカー", "Anker", "サムスン", "Samsung", "Apple", "LG",
    "アイロボット", "iRobot", "ルンバ", "Roomba", "シャーク", "Shark",
    "ロボロック", "Roborock", "JVC", "ビクター", "Victor", "マクセル", "MAXELL",
    "エレクトロラックス", "Electrolux", "moosoo", "Levoit", "アラジン", "Aladdin",
    "ヤマダ", "MOOSOO", "ティファール", "T-fal",
    # 3Dプリンター系ブランド
    "Creality", "クリアリティ", "Bambu Lab", "Bambu", "バンブー", "Anycubic", "エニキュービック",
    "ELEGOO", "エレゴー", "Voxelab", "FLASHFORGE", "フラッシュフォージュ", "QIDI",
    "Phrozen", "Sovol", "Kingroon", "Artillery", "Snapmaker", "Prusa",
]

# ブランド候補から除外する一般英大文字語（材質/色/機能/規格/汎用）
_BRAND_BLOCKLIST = {
    # 既存
    "FULL", "HD", "HDMI", "LED", "LCD", "USB", "PSE", "PSU", "DC", "AC",
    "PRO", "MAX", "MINI", "NEW", "SET", "KG", "CM", "LL", "XL", "WIFI",
    # 色・材質
    "WHITE", "BLACK", "SILVER", "GRAY", "GREY", "BEIGE", "BROWN", "NAVY",
    "STAINLESS", "STEEL", "GLASS", "PLASTIC", "WOOD", "ALUMI",
    # 機能・状態
    "INVERTER", "AUTO", "ECO", "TURBO", "SMART", "TIMER", "SLIM", "DUAL",
    "POWER", "SILENT", "QUIET", "COMPACT", "PORTABLE", "WIRELESS", "DIGITAL",
    # 規格・汎用
    "TYPE", "FHD", "UHD", "BLUETOOTH", "MODEL", "JAPAN", "MADE", "SERIES",
    "STYLE", "DESIGN", "PREMIUM", "STANDARD", "VERSION", "SIZE", "COLOR",
}


def _ascii_word_present(needle: str, haystack_lower: str) -> bool:
    """ASCII語を語境界付きで含有判定（部分一致の誤爆を防ぐ）"""
    return re.search(r"(?<![a-z0-9])" + re.escape(needle.lower()) + r"(?![a-z0-9])", haystack_lower) is not None


def extract_brand(title: str) -> str | None:
    """ブランド推定（既知ブランド優先、無ければ英大文字語を候補に）"""
    if not title:
        return None
    low = title.lower()
    for b in KNOWN_BRANDS:
        if re.search(r"[a-z]", b.lower()):
            if _ascii_word_present(b, low):
                return b
        elif b in title:  # 日本語ブランドは部分一致でOK
            return b
    # 既知に無ければ、4文字以上の英大文字トークンをブランド候補に（例: SAMKYO, ASUMU）
    for tok in re.findall(r"(?<![A-Za-z])[A-Z][A-Z]{3,}(?![a-z])", title):
        if tok in _BRAND_BLOCKLIST:
            continue
        if re.fullmatch(r"\d+[A-Z]+", tok):
            continue
        return tok
    return None


# ブランドの英語/日本語など同義表記グループ（クロスプラットフォーム照合用）
BRAND_GROUPS = [
    {"Panasonic", "パナソニック"}, {"Hisense", "ハイセンス"}, {"SHARP", "シャープ"},
    {"TOSHIBA", "東芝"}, {"HITACHI", "日立"}, {"MITSUBISHI", "三菱"},
    {"SONY", "ソニー"}, {"Haier", "ハイアール"}, {"AQUA", "アクア"},
    {"IRIS", "アイリスオーヤマ", "アイリス"}, {"YAMAZEN", "山善"},
    {"Nikon", "ニコン"}, {"Canon", "キヤノン"}, {"PHILIPS", "フィリップス"},
    {"COMFEE", "コンフィー"}, {"DAIKIN", "ダイキン"}, {"CORONA", "コロナ"},
    {"ZOJIRUSHI", "象印"}, {"TIGER", "タイガー"}, {"TWINBIRD", "ツインバード"},
    {"KOIZUMI", "コイズミ"}, {"BALMUDA", "バルミューダ"}, {"DeLonghi", "デロンギ"},
    {"Dyson", "ダイソン"}, {"Xiaomi", "シャオミ"}, {"Anker", "アンカー"},
    {"ELEGOO", "エレゴー"}, {"Creality", "クリアリティ"},
    {"Anycubic", "エニキュービック"}, {"Bambu", "Bambu Lab", "バンブー"},
    {"iRobot", "ルンバ", "Roomba"}, {"Shark", "シャーク"},
]


def _name_in(name: str, text: str) -> bool:
    if re.search(r"[a-z]", name.lower()):
        return _ascii_word_present(name, text.lower())
    return name in text


def _brand_equivalents(brand: str) -> set[str]:
    for g in BRAND_GROUPS:
        if brand in g:
            return g
    return {brand}


def brand_in(brand: str | None, yahoo_title: str) -> bool:
    if not brand:
        return False
    y = yahoo_title or ""
    return any(_name_in(n, y) for n in _brand_equivalents(brand))


# ===== 型番 =====
# スペック語・汎用語は型番扱いしない
_MODEL_SPEC_BLOCKLIST = {
    "TYPE-C", "TYPE-A", "USB-C", "USB-A", "USB3", "USB2",
    "4K", "8K", "2K", "FHD", "UHD", "MP4", "MP3", "PM2",
    "3D", "2D", "1080P", "720P", "100V", "200V",
}

_MODEL_PATTERNS = [
    r"[A-Za-z]{2,6}-[A-Za-z0-9]{1,}(?:-[A-Za-z0-9]+)*",  # ハイフン型: ES-GE7H-T, IC-SLDC, NA-FA80
    r"[A-Za-z]{1,8}\d{1,}[A-Za-z0-9]*",                  # 英字+数字: K2, P2S, Ender3, Neptune4
    r"\d{1,}[A-Za-z]{1,6}\d*[A-Za-z]*",                  # 数字始まり: 32A4N, 49Z740X
    r"[A-Za-z]{3,}\s?\d{1,3}[A-Za-z]?",                  # モデル名+数字: Neptune 4, Kobra 3, Mars 5
]


def _norm_model(s: str) -> str:
    return re.sub(r"[\s　\-]", "", s or "").upper()


def extract_model_tokens(title: str) -> list[str]:
    """型番らしいトークンを抽出（容量/年/スペックを除外）。短い型番(K2等)も拾う。"""
    t = title or ""
    cands: set[str] = set()
    for pat in _MODEL_PATTERNS:
        for m in re.findall(pat, t):
            cands.add(m.upper())
    out: list[str] = []
    for c in cands:
        if c in _MODEL_SPEC_BLOCKLIST:
            continue
        norm = c.replace("-", "")
        if re.fullmatch(r"\d{4}", norm):  # 西暦
            continue
        if re.fullmatch(
            r"\d+(?:\.\d+)?(?:KG|G|L|ML|CM|MM|M|W|V|A|型|インチ|合|人|点|台|本|畳|GB|TB|HZ)",
            norm,
        ):
            continue
        # ハイフン型 or 「英字+数字」は長さ2以上で許可、それ以外は4文字以上
        if "-" in c or re.search(r"[A-Za-z]\d|\d[A-Za-z]", c):
            if len(norm) < 2:
                continue
        elif len(norm) < 4:
            continue
        # 数字もハイフンも無い純英字は型番扱いしない
        if not re.search(r"\d", c) and "-" not in c:
            continue
        out.append(c)
    return out


def model_match(amazon_title: str, yahoo_title: str) -> bool:
    """型番一致（スペース/ハイフン差・接尾辞差を吸収）"""
    am = [_norm_model(m) for m in extract_model_tokens(amazon_title)]
    ym = [_norm_model(m) for m in extract_model_tokens(yahoo_title)]
    ystr = _norm_model(yahoo_title)
    for a in am:
        if len(a) < 2:
            continue
        if a in ystr:  # ヤフオクのスペース挿入(ES GE7H)を吸収
            return True
        for y in ym:
            if len(y) < 2:
                continue
            if a in y or y in a:  # 接尾辞差(ES-GE7H-T ↔ ES-GE7H)を吸収
                return True
    return False


def model_conflict(amazon_title: str, yahoo_title: str) -> bool:
    """両者に型番があり、かつ一致しないなら別商品（容量一致でも除外する）"""
    am = extract_model_tokens(amazon_title)
    ym = extract_model_tokens(yahoo_title)
    if not am or not ym:
        return False
    return not model_match(amazon_title, yahoo_title)


# ===== 容量（カテゴリ別の単位） =====
_KG_CATS = {"洗濯機", "全自動洗濯機", "ドラム式洗濯機", "二槽式洗濯機", "洗濯乾燥機", "衣類乾燥機", "乾燥機"}
_GO_CATS = {"炊飯器"}


def extract_capacity(title: str, category: str | None = None) -> tuple[float, str] | None:
    """容量を抽出。カテゴリで単位を決める（洗濯機=kg / 冷蔵庫等=L / 炊飯器=合）。
    複数あれば最大値（総容量）を採用。カテゴリ不明時は kg→L の順。
    """
    t = title or ""

    def kg():
        return [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*kg", t, re.I)]

    def liter():
        v = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*[lL](?![a-zA-Z])", t)]
        v += [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*リットル", t)]
        return v

    def go():
        return [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*合", t)]

    if category in _KG_CATS:
        order = [("kg", kg)]
    elif category in _GO_CATS:
        order = [("合", go)]
    elif category:
        order = [("L", liter)]
    else:
        order = [("kg", kg), ("L", liter)]

    for unit, fn in order:
        vals = fn()
        if vals:
            return (max(vals), unit)
    return None


def capacity_matches(
    a_cap: tuple[float, str] | None,
    y_cap: tuple[float, str] | None,
    tol: float = 0.06,
) -> bool:
    """容量が（単位一致＋値が許容誤差内で）一致するか"""
    if not a_cap or not y_cap:
        return False
    if a_cap[1] != y_cap[1] or a_cap[0] <= 0:
        return False
    return abs(a_cap[0] - y_cap[0]) / a_cap[0] <= tol


def _capacity_str(cap: tuple[float, str] | None) -> str | None:
    if not cap:
        return None
    v, unit = cap
    return f"{int(v)}{unit}" if v == int(v) else f"{v}{unit}"


# ===== セット品・ジャンク・付属品 =====
_SET_WORDS = [
    "点セット", "２点", "３点", "４点", "2点", "3点", "4点", "まとめ", "おまとめ",
    "セット販売", "セット", "2台", "3台", "２台", "３台", "2個", "個セット",
    "本セット", "枚セット", "まとめて",
]
_JUNK_WORDS = [
    "ジャンク", "部品取り", "部品鳥", "現状品", "現状渡し", "故障", "不動",
    "通電のみ", "通電確認のみ", "ガラス割れ", "難あり", "訳あり", "破損", "動作未確認",
]
# 本体ではなく付属品/消耗品/互換部品（本体価格と比較できない）
_ACCESSORY_WORDS = [
    "フィラメント", "ノズル", "互換", "純正", "替え", "替刃", "スペア", "交換用",
    "部品", "パーツ", "ケーブル", "アダプター", "アダプタ", "フィルター", "カートリッジ",
    "専用ケース", "専用カバー", "マウント", "ホルダー", "スタンド", "保護フィルム",
    "リモコンのみ", "取扱説明書", "電源コードのみ", "トナー", "インク",
]


def is_set_listing(title: str) -> bool:
    t = title or ""
    return any(w in t for w in _SET_WORDS)


def is_junk(title: str) -> bool:
    t = title or ""
    return any(w in t for w in _JUNK_WORDS)


def is_accessory(amazon_title: str, yahoo_title: str) -> bool:
    """ヤフオク側が付属品/消耗品で、Amazon側が本体なら比較対象外"""
    y = yahoo_title or ""
    a = amazon_title or ""
    return any(w in y and w not in a for w in _ACCESSORY_WORDS)


# ===== トークン重複（フォールバック） =====
def _significant_tokens(text: str) -> set[str]:
    text = text or ""
    toks: set[str] = set()
    toks.update(re.findall(r"[ァ-ヴー]{2,}", text))
    toks.update(re.findall(r"[一-龥]{2,}", text))
    toks.update(t.upper() for t in re.findall(r"[A-Za-z0-9]{2,}", text))
    toks.update(
        m.upper() for m in re.findall(r"\d+\.?\d*(?:kg|l|cm|インチ|型|合|w)", text, re.I)
    )
    return toks


_STOPWORDS = {
    "一人暮らし", "二人暮らし", "ふたり暮らし", "全自動", "静音", "節電", "省エネ",
    "新品", "未使用", "中古", "美品", "送料無料", "保証", "ホワイト", "ブラック",
    "コンパクト", "大容量", "小型", "限定", "AMAZON", "PRIME",
    # 機能・汎用語（暴発抑制のため追加）
    "設計", "洗濯", "乾燥", "部屋干し", "衣類", "操作", "機能", "搭載", "対応",
    "本体", "家電", "新生活", "応援", "便利", "人気", "おしゃれ", "シンプル",
}


def relevance_score(amazon_title: str, yahoo_title: str) -> float:
    a = _significant_tokens(amazon_title) - _STOPWORDS
    if not a:
        return 0.0
    y = _significant_tokens(yahoo_title)
    return len(a & y) / len(a)


# ===== 検索キーワード =====
def build_search_keyword(title: str) -> str:
    """「ブランド + カテゴリ + 容量」で同一商品に絞る検索キーワードを生成"""
    cat = extract_category(title)
    brand = extract_brand(title)
    capstr = _capacity_str(extract_capacity(title, cat))
    parts = [p for p in (brand, cat, capstr) if p]
    if parts:
        return " ".join(parts)
    models = extract_model_tokens(title)
    if models:
        return models[0]
    words = [w for w in re.split(r"[\s　]+", title or "") if w]
    return " ".join(words[:3])[:40] or (title or "")[:20]


# ===== 関連性判定（本体） =====
def is_relevant(amazon_title: str, yahoo_title: str, threshold: float = 0.25) -> bool:
    """同一商品レベルの関連性判定（根拠ベース）。

    「確証のある同定シグナル」がある時だけ True。無ければ False（＝該当なし）。
    別物・付属品・別容量・別型番を価格差候補に出さないことを最優先する。

    判定順:
      1. ジャンク / セット・まとめ売り / 付属品・消耗品 → 除外。
      2. カテゴリ同義クラスのゲート（周辺商品=テレビ台等は除外）。
      3. 両者に型番があり食い違うなら別商品 → 除外。
      4. 型番一致 かつ ブランド一致 → 同一商品。
      5. ブランド一致 かつ 容量一致 → 同一商品。
      ※ ブランド単独・カテゴリ単独・トークン重複だけでは一致にしない（誤マッチ防止）。
    """
    yahoo = yahoo_title or ""

    if is_junk(yahoo):
        return False
    if is_set_listing(yahoo) and not is_set_listing(amazon_title):
        return False
    if is_accessory(amazon_title, yahoo):
        return False

    cat = extract_category(amazon_title)
    if cat and not category_in(cat, yahoo):
        return False

    if model_conflict(amazon_title, yahoo):
        return False

    brand_ok = brand_in(extract_brand(amazon_title), yahoo)

    # 型番一致＋ブランド一致＝同一商品（最も確実）
    if model_match(amazon_title, yahoo) and brand_ok:
        return True

    # ブランド一致＋容量一致＝実質同一商品
    a_cap = extract_capacity(amazon_title, cat)
    y_cap = extract_capacity(yahoo, cat)
    if brand_ok and capacity_matches(a_cap, y_cap):
        return True

    return False


def representative_price(prices: list[int]) -> int | None:
    """仕入れ見込み価格＝中央値（1円開始など外れ値の影響を抑える）"""
    vals = [p for p in prices if p and p > 0]
    if not vals:
        return None
    return int(statistics.median(vals))
