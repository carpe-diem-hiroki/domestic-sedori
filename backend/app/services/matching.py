"""商品マッチング: Amazon商品タイトルとヤフオク出品の関連性を判定する

無関係な商品（例: 洗濯機↔同じ型番文字列を持つ別ジャンルのカメラ）を
価格差候補から除外し、検索精度を上げるためのユーティリティ。
"""
import re
import statistics

# 家電の代表的なカテゴリ語（長い語を優先してマッチ）
CATEGORY_WORDS = [
    "オーブンレンジ", "電子レンジ", "ロボット掃除機", "空気清浄機", "食器洗い乾燥機",
    "液晶テレビ", "有機ELテレビ", "コーヒーメーカー", "電気ケトル", "炊飯器",
    "洗濯機", "乾燥機", "冷蔵庫", "冷凍庫", "製氷機", "テレビ", "モニター", "ディスプレイ",
    "掃除機", "エアコン", "扇風機", "サーキュレーター", "ドライヤー", "加湿器", "除湿機",
    "食洗機", "トースター", "ケトル", "ヒーター", "ストーブ", "こたつ", "アイロン",
    "ミシン", "カメラ", "スピーカー", "イヤホン", "ヘッドホン", "プリンター",
    "ホットプレート", "コンロ", "グリル", "レンジ", "時計", "腕時計",
]


def extract_category(title: str) -> str | None:
    """タイトルから商品カテゴリ語を抽出（最長一致）"""
    if not title:
        return None
    for w in sorted(CATEGORY_WORDS, key=len, reverse=True):
        if w in title:
            return w
    return None


# 既知の家電ブランド（日本語/英語表記の両方）
KNOWN_BRANDS = [
    "パナソニック", "Panasonic", "日立", "HITACHI", "東芝", "TOSHIBA",
    "シャープ", "SHARP", "三菱", "MITSUBISHI", "ハイセンス", "Hisense",
    "ハイアール", "Haier", "アイリスオーヤマ", "IRIS", "山善", "YAMAZEN",
    "アクア", "AQUA", "COMFEE", "コンフィー", "ニトリ", "無印良品",
    "ツインバード", "TWINBIRD", "コイズミ", "KOIZUMI", "ソニー", "SONY",
    "シャオミ", "Xiaomi", "バルミューダ", "BALMUDA", "デロンギ", "DeLonghi",
    "ダイソン", "Dyson", "象印", "ZOJIRUSHI", "タイガー", "TIGER",
    "ニコン", "Nikon", "キヤノン", "Canon", "フィリップス", "PHILIPS",
]

# ブランド候補から除外する一般的な英大文字語
_BRAND_BLOCKLIST = {
    "FULL", "HD", "HDMI", "LED", "LCD", "USB", "PSE", "PSU", "DC", "AC",
    "PRO", "MAX", "MINI", "NEW", "SET", "KG", "CM", "LL", "XL", "WIFI",
}


def extract_brand(title: str) -> str | None:
    """タイトルからブランドを推定（既知ブランド優先、無ければ英大文字語を候補に）"""
    if not title:
        return None
    for b in KNOWN_BRANDS:
        if b.lower() in title.lower():
            return b
    # 既知に無ければ、4文字以上の英大文字トークンをブランド候補とする（例: SAMKYO, ASUMU）
    for tok in re.findall(r"[A-Z][A-Z0-9]{3,}", title):
        if tok not in _BRAND_BLOCKLIST and not re.fullmatch(r"\d+[A-Z]+", tok):
            return tok
    return None


def extract_model_tokens(title: str) -> list[str]:
    """型番らしいトークン（英字＋数字、容量を除く）を抽出"""
    toks: list[str] = []
    for m in re.findall(r"[A-Za-z]{1,5}-?\d{2,}[A-Za-z0-9-]*", title or ""):
        up = m.upper()
        # 容量・サイズ（5KG, 175L, 32型相当）は除外
        if re.fullmatch(r"\d+(?:KG|L|CM|W)", up):
            continue
        if len(up) >= 3:
            toks.append(up)
    return toks


def _significant_tokens(text: str) -> set[str]:
    """関連性判定に使う有意トークンを抽出"""
    text = text or ""
    toks: set[str] = set()
    # カタカナ語（2文字以上）
    toks.update(re.findall(r"[ァ-ヴー]{2,}", text))
    # 漢字語（2文字以上）
    toks.update(re.findall(r"[一-龥]{2,}", text))
    # 英数（ブランド/型番、2文字以上、大文字化）
    toks.update(t.upper() for t in re.findall(r"[A-Za-z0-9]{2,}", text))
    # 容量・サイズ（5kg / 175L / 45cm / 32型 / 23インチ）
    toks.update(
        m.upper() for m in re.findall(r"\d+\.?\d*(?:kg|l|cm|インチ|型|合|w)", text, re.I)
    )
    return toks


# 関連性に寄与しない汎用語（家電全般に頻出するため除外）
_STOPWORDS = {
    "一人暮らし", "二人暮らし", "ふたり暮らし", "全自動", "静音", "節電", "省エネ",
    "新品", "未使用", "中古", "美品", "送料無料", "保証", "ホワイト", "ブラック",
    "コンパクト", "大容量", "小型", "限定", "AMAZON", "PRIME",
}


def build_search_keyword(title: str) -> str:
    """検索精度の高いキーワードを生成

    方針: 「ブランド + カテゴリ」を最優先（同一商品に絞るため）。
    ブランドが取れなければ「カテゴリ + 容量」、それも無ければ先頭語。
    """
    cat = extract_category(title)
    brand = extract_brand(title)
    cap = re.search(r"\d+\.?\d*(?:kg|L|インチ|型)", title or "", re.I)

    if brand and cat:
        return f"{brand} {cat}"
    if cat and cap:
        return f"{cat} {cap.group(0)}"
    if cat:
        return cat
    if brand:
        return brand
    # フォールバック: 先頭の有意語を数個
    words = [w for w in re.split(r"[\s　]+", title or "") if w]
    return " ".join(words[:3])[:40] or (title or "")[:20]


def relevance_score(amazon_title: str, yahoo_title: str) -> float:
    """0〜1。Amazonタイトルの有意トークンがヤフオク側にどれだけ含まれるか"""
    a = _significant_tokens(amazon_title) - _STOPWORDS
    if not a:
        return 0.0
    y = _significant_tokens(yahoo_title)
    common = a & y
    return len(common) / len(a)


def is_relevant(amazon_title: str, yahoo_title: str, threshold: float = 0.1) -> bool:
    """関連性判定（同一商品レベルの精度）

    1. カテゴリ語が取れる場合は、ヤフオク側にも同カテゴリ語が必須（ジャンル違いを除外）。
    2. さらに「ブランド」または「型番」がヤフオク側に一致することを必須にする
       （別ブランド・別型番の同カテゴリ品＝別商品を除外）。
       例: SAMKYO B500 洗濯機 ↔ シャープ ES-GE7H-T 洗濯機 は不一致で除外。
    3. ブランドも型番も取れない商品は、トークン重複率で判定（フォールバック）。
    """
    yahoo = yahoo_title or ""
    yahoo_lower = yahoo.lower()

    cat = extract_category(amazon_title)
    if cat and cat not in yahoo:
        return False  # カテゴリ違いは即除外

    brand = extract_brand(amazon_title)
    models = extract_model_tokens(amazon_title)

    # ブランド or 型番のいずれかが一致すれば「同一商品候補」
    if brand and brand.lower() in yahoo_lower:
        return True
    if any(m in yahoo.upper() for m in models):
        return True

    # ブランド・型番が特定できない商品のみ、トークン重複でフォールバック判定
    if not brand and not models:
        return relevance_score(amazon_title, yahoo_title) >= threshold

    return False


def representative_price(prices: list[int]) -> int | None:
    """仕入れ見込み価格＝中央値（1円開始など外れ値の影響を抑える）"""
    vals = [p for p in prices if p and p > 0]
    if not vals:
        return None
    return int(statistics.median(vals))
