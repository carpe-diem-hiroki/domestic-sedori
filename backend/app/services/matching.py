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


# セット/まとめ売りを示す語（単品Amazonとは比較対象にしない）
_SET_WORDS = ["点セット", "２点", "３点", "４点", "2点", "3点", "4点", "まとめ", "セット"]


def is_set_listing(title: str) -> bool:
    """セット・まとめ売りの出品か"""
    t = title or ""
    return any(w in t for w in _SET_WORDS)


def extract_capacity(title: str) -> tuple[float, str] | None:
    """容量を抽出。洗濯機等は kg、冷蔵庫等は L。複数あれば最大値（総容量）を採用。

    例: "幅49cm 175L 大容量冷蔵室122L" -> (175.0, 'L')
        "洗濯機 5.5kg" -> (5.5, 'kg')
    """
    t = title or ""
    kgs = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*kg", t, re.I)]
    if kgs:
        return (max(kgs), "kg")
    ls = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*[lL](?![a-zA-Z])", t)]
    ls += [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*リットル", t)]
    if ls:
        return (max(ls), "L")
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


def _capacity_str(cap: tuple[float, str] | None) -> str | None:
    if not cap:
        return None
    v, unit = cap
    return f"{int(v)}{unit}" if v == int(v) else f"{v}{unit}"


def build_search_keyword(title: str) -> str:
    """検索精度の高いキーワードを生成

    方針: 「ブランド + カテゴリ + 容量」で同一商品に絞る。
    （例: アイリスオーヤマ 冷蔵庫 320L / ハイセンス 洗濯機 5.5kg）
    """
    cat = extract_category(title)
    brand = extract_brand(title)
    capstr = _capacity_str(extract_capacity(title))

    parts = [p for p in (brand, cat, capstr) if p]
    if parts:
        return " ".join(parts)
    models = extract_model_tokens(title)
    if models:
        return models[0]
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

    判定順:
      1. カテゴリ一致（必須ゲート）。違えば除外。
      2. セット/まとめ売りは単品Amazonと非対応として除外。
      3. 型番一致 → 同一商品とみなす（最強の同定）。
      4. ブランド一致 かつ 容量一致 → 同一商品とみなす（別容量・別モデルを除外）。
      5. ブランド・型番・容量がいずれも取れない商品のみ、トークン重複でフォールバック。
    """
    yahoo = yahoo_title or ""

    cat = extract_category(amazon_title)
    if cat and cat not in yahoo:
        return False  # ジャンル違いを除外

    # セット品（冷蔵庫＋洗濯機 2点セット 等）は単品と比較しない
    if is_set_listing(yahoo) and not is_set_listing(amazon_title):
        return False

    models = extract_model_tokens(amazon_title)
    if any(m in yahoo.upper() for m in models):
        return True  # 型番一致＝同一商品

    brand = extract_brand(amazon_title)
    a_cap = extract_capacity(amazon_title)
    y_cap = extract_capacity(yahoo)
    brand_ok = bool(brand and brand.lower() in yahoo.lower())
    cap_ok = capacity_matches(a_cap, y_cap)
    if brand_ok and cap_ok:
        return True  # ブランド＋容量一致＝実質同一商品

    # 識別子が何も取れない商品のみ、トークン重複でフォールバック
    if not brand and not models and not a_cap:
        return relevance_score(amazon_title, yahoo_title) >= threshold

    return False


def representative_price(prices: list[int]) -> int | None:
    """仕入れ見込み価格＝中央値（1円開始など外れ値の影響を抑える）"""
    vals = [p for p in prices if p and p > 0]
    if not vals:
        return None
    return int(statistics.median(vals))
