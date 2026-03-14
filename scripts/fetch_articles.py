import re
import json
import os
import feedparser
import requests

MEDIUM_USERNAME = "alparslandev"
README_PATH     = "README.md"
MEDIUM_CACHE    = "medium_articles.json"

MEDIUM_START = "<!-- MEDIUM-ARTICLES:START -->"
MEDIUM_END   = "<!-- MEDIUM-ARTICLES:END -->"

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; GitHub Actions bot)"
})


def load_medium_cache():
    if os.path.exists(MEDIUM_CACHE):
        with open(MEDIUM_CACHE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_medium_cache(cache):
    with open(MEDIUM_CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def parse_publication(link):
    subdomain_match = re.match(r"https://([^.]+)\.medium\.com/", link)
    path_match      = re.match(r"https://medium\.com/([^@/][^/]*)/", link)
    system_paths    = {"tag", "tags", "search", "topic", "topics",
                       "m", "about", "membership"}
    if subdomain_match:
        return subdomain_match.group(1).replace("-", " ").title()
    elif path_match:
        slug = path_match.group(1)
        if slug not in system_paths:
            return slug.replace("-", " ").title()
    return None


def fetch_medium_articles():
    cache = load_medium_cache()

    # Medium bazen GitHub Actions IP'lerini bloke eder.
    # Bu durumda cache'teki mevcut makaleleri kullanırız.
    rss_url = f"https://medium.com/feed/@{MEDIUM_USERNAME}"
    try:
        response = SESSION.get(rss_url, timeout=(5, 10))  # (connect, read) timeout
        response.raise_for_status()
        feed = feedparser.parse(response.text)

        new_count = 0
        for entry in feed.entries:
            link = entry.link
            if link not in cache:
                cache[link] = {
                    "title":       entry.title,
                    "url":         link,
                    "publication": parse_publication(link),
                }
                new_count += 1

        save_medium_cache(cache)
        print(f"   📦 Cache: {len(cache)} total | +{new_count} new")

    except Exception as e:
        print(f"   ⚠️  Medium RSS unavailable: {e}")
        print(f"   📦 Using cache: {len(cache)} articles")

    return list(cache.values())

def build_medium_rows(articles):
    if not articles:
        return "_No articles found._"
    rows = []
    for a in articles:
        pub = f" *({a['publication']})*" if a.get("publication") else ""
        rows.append(f'- [{a["title"]}]({a["url"]}){pub}')
    return "\n".join(rows)

def replace_section(content, start_marker, end_marker, new_body):
    pattern = re.compile(
        rf"{re.escape(start_marker)}.*?{re.escape(end_marker)}",
        re.DOTALL,
    )
    return pattern.sub(f"{start_marker}\n{new_body}\n{end_marker}", content)


def main():
    print("📡 Fetching Medium articles (with cache)...")
    medium_articles = fetch_medium_articles()
    print(f"   ✅ {len(medium_articles)} total articles.")

    with open(README_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    content = replace_section(content, MEDIUM_START, MEDIUM_END,
                               build_medium_rows(medium_articles))

    with open(README_PATH, "w", encoding="utf-8") as f:
        f.write(content)

    print("✅ README.md updated successfully!")


if __name__ == "__main__":
    main()
