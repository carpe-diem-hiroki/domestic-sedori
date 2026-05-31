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

    方針: 「カテゴリ語 + 容量/サイズ」を優先。
    （単独の型番トークンは別ジャンルに誤爆しやすいので避ける）
    """
    cat = extract_category(title)
    cap = re.search(r"\d+\.?\d*(?:kg|L|インチ|型)", title or "", re.I)
    if cat and cap:
        return f"{cat} {cap.group(0)}"
    if cat:
        return cat
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
    """関連性判定

    - カテゴリ語が取れる場合: ヤフオク側に同じカテゴリ語が含まれることを必須にする
      （洗濯機↔カメラ のようなジャンル違いを確実に除外）。
    - その上でトークン重複が閾値以上なら関連とみなす。
    Amazonタイトルはキーワード過多で重複率が下がりやすいため、
    カテゴリ一致を主軸にし、閾値は低めに設定する。
    """
    cat = extract_category(amazon_title)
    if cat:
        if cat not in (yahoo_title or ""):
            return False
        return True  # 同一カテゴリ語が一致すれば関連とみなす
    # カテゴリ不明な商品はトークン重複で判定
    return relevance_score(amazon_title, yahoo_title) >= threshold


def representative_price(prices: list[int]) -> int | None:
    """仕入れ見込み価格＝中央値（1円開始など外れ値の影響を抑える）"""
    vals = [p for p in prices if p and p > 0]
    if not vals:
        return None
    return int(statistics.median(vals))
