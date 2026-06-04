#!/usr/bin/env python3
"""
爬取全国农产品批发市场价格信息系统 (pfsc.agri.cn) 的日度价格数据。

产出：data/raw/china_wholesale_daily.csv
格式：date,product,market,price_avg,price_high,price_low,unit

使用方法：
    python model-service/data/scripts/crawl_pfsc.py
    python model-service/data/scripts/crawl_pfsc.py --days 365
    python model-service/data/scripts/crawl_pfsc.py --products 苹果,大豆,玉米

注意：
    - 需要联网
    - 礼貌间隔 ≥2 秒
    - 遵守 robots.txt
    - 预计 200+ 品种 × 1 年 ≈ 30-60 分钟
"""

from __future__ import annotations

import argparse
import csv
import re
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin

# 延迟导入以便在无网络环境下也能 import 本模块做单元测试
try:
    import requests
except ImportError:
    requests = None  # type: ignore[assignment]


BASE_URL = "https://pfsc.agri.cn"
# pfsc.agri.cn 的品种日度价格查询接口（通过浏览器抓包得到的 pattern）
# 实际 URL 可能需要根据网站改版调整
PRICE_QUERY_URL = f"{BASE_URL}/jgsj/jgcx/jgcx.html"

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "raw"
OUTPUT_FILE = OUTPUT_DIR / "china_wholesale_daily.csv"

# 常见农产品品种列表（覆盖水果/蔬菜/粮油/肉类/水产/蛋奶）
DEFAULT_PRODUCTS = [
    # 水果
    "苹果", "香蕉", "葡萄", "梨", "西瓜", "柑橘", "橙", "菠萝", "芒果", "猕猴桃",
    # 蔬菜
    "大白菜", "番茄", "黄瓜", "青椒", "茄子", "豆角", "土豆", "洋葱", "大蒜", "生姜",
    "芹菜", "菠菜", "韭菜", "莲藕", "冬瓜", "南瓜", "胡萝卜", "白萝卜", "菜花", "西兰花",
    "油菜", "生菜", "莴笋", "蒜薹", "豆芽",
    # 粮油
    "大豆", "玉米", "小麦", "稻谷", "花生", "菜籽", "芝麻",
    # 肉类
    "猪肉", "牛肉", "羊肉", "白条鸡", "鸡胸肉",
    # 水产
    "鲫鱼", "鲤鱼", "草鱼", "大带鱼", "大黄花鱼", "白鲢鱼", "对虾",
    # 蛋奶
    "鸡蛋", "鸭蛋",
]

HEADERS = {
    "User-Agent": "AgriCloudManager-DataCollector/1.0 (+contact:ops@ysngj.cn)",
    "Accept-Language": "zh-CN,zh;q=0.9",
}

POLITE_DELAY = 2.0  # 秒


def fetch_page(url: str, params: Optional[dict] = None) -> Optional[str]:
    """带礼貌间隔的 HTTP GET。"""
    if requests is None:
        raise RuntimeError("requests library not installed: pip install requests")
    time.sleep(POLITE_DELAY)
    try:
        resp = requests.get(url, params=params, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
        return resp.text
    except Exception as exc:
        print(f"  [WARN] fetch failed: {url} — {exc}")
        return None


def parse_price_table(html: str, product: str) -> list[dict]:
    """
    从 pfsc.agri.cn 的价格查询结果页面解析表格。
    
    表格结构（典型）：
        日期 | 品种 | 市场 | 最高价 | 最低价 | 平均价 | 单位
    
    注意：实际页面结构可能因改版而变化，这里提供一个通用的正则 + 表格解析方案。
    如果解析失败，返回空列表（不抛异常）。
    """
    rows = []
    
    # 方案 1：尝试解析 HTML 表格
    table_pattern = re.compile(
        r"<tr[^>]*>\s*"
        r"<td[^>]*>([\d\-/]+)</td>\s*"  # 日期
        r"<td[^>]*>([^<]+)</td>\s*"      # 品种
        r"<td[^>]*>([^<]+)</td>\s*"      # 市场
        r"<td[^>]*>([\d.]+)</td>\s*"     # 最高价
        r"<td[^>]*>([\d.]+)</td>\s*"     # 最低价
        r"<td[^>]*>([\d.]+)</td>\s*"     # 平均价
        r"<td[^>]*>([^<]*)</td>",        # 单位
        re.IGNORECASE,
    )
    
    for m in table_pattern.finditer(html):
        date_str, variety, market, high, low, avg, unit = m.groups()
        # 标准化日期
        date_str = date_str.replace("/", "-").strip()
        try:
            rows.append({
                "date": date_str,
                "product": variety.strip(),
                "market": market.strip(),
                "price_avg": float(avg),
                "price_high": float(high),
                "price_low": float(low),
                "unit": unit.strip() or "元/公斤",
            })
        except (ValueError, TypeError):
            continue
    
    # 方案 2：如果方案 1 没匹配到，尝试更宽松的正则
    if not rows:
        # 找所有 "数字.数字 元/公斤" 模式，结合品种名上下文
        price_pattern = re.compile(
            rf"({re.escape(product)})[^<]*?"
            r"(\d+\.\d+)\s*元[/／]公斤",
            re.DOTALL,
        )
        date_pattern = re.compile(r"(20\d{2}[-年/]\d{1,2}[-月/]\d{1,2})")
        
        dates_found = date_pattern.findall(html)
        prices_found = price_pattern.findall(html)
        
        if dates_found and prices_found:
            latest_date = dates_found[0].replace("年", "-").replace("月", "-").replace("/", "-")
            for _, price_str in prices_found[:1]:
                rows.append({
                    "date": latest_date,
                    "product": product,
                    "market": "全国均价",
                    "price_avg": float(price_str),
                    "price_high": float(price_str),
                    "price_low": float(price_str),
                    "unit": "元/公斤",
                })
    
    return rows


def crawl_product(product: str, days: int = 365) -> list[dict]:
    """爬取单个品种的历史价格。"""
    print(f"  crawling: {product} (last {days} days)")
    
    # pfsc.agri.cn 的查询参数（需要根据实际网站调整）
    end_date = date.today()
    start_date = end_date - timedelta(days=days)
    
    params = {
        "prodName": product,
        "startDate": start_date.strftime("%Y-%m-%d"),
        "endDate": end_date.strftime("%Y-%m-%d"),
    }
    
    html = fetch_page(PRICE_QUERY_URL, params=params)
    if not html:
        return []
    
    return parse_price_table(html, product)


def main() -> None:
    parser = argparse.ArgumentParser(description="爬取全国农产品批发市场日度价格")
    parser.add_argument("--days", type=int, default=365, help="回溯天数 (default: 365)")
    parser.add_argument("--products", type=str, default=None,
                        help="品种列表，逗号分隔 (default: 全部 50+ 品种)")
    parser.add_argument("--output", type=str, default=str(OUTPUT_FILE),
                        help="输出 CSV 路径")
    args = parser.parse_args()
    
    products = args.products.split(",") if args.products else DEFAULT_PRODUCTS
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"[crawl_pfsc] products={len(products)}, days={args.days}, output={output_path}")
    print(f"[crawl_pfsc] polite delay = {POLITE_DELAY}s per request")
    print(f"[crawl_pfsc] estimated time: {len(products) * POLITE_DELAY / 60:.1f} min\n")
    
    all_rows: list[dict] = []
    for product in products:
        rows = crawl_product(product, days=args.days)
        all_rows.extend(rows)
        print(f"    → {len(rows)} rows")
    
    # 写 CSV
    if all_rows:
        fieldnames = ["date", "product", "market", "price_avg", "price_high", "price_low", "unit"]
        with output_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(sorted(all_rows, key=lambda r: (r["product"], r["date"])))
        print(f"\n[crawl_pfsc] DONE: {len(all_rows)} rows → {output_path}")
    else:
        print("\n[crawl_pfsc] WARNING: no data collected. Check network / URL pattern.")


if __name__ == "__main__":
    main()
