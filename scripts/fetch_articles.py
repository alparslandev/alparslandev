import json
import re
import urllib.request

BLOG_URL      = "https://devdiscipline.com"
FEED_URL      = f"{BLOG_URL}/feed.json"
README_PATH   = "README.md"
ARTICLE_LIMIT = 10

BLOG_START = "<!-- BLOG-ARTICLES:START -->"
BLOG_END   = "<!-- BLOG-ARTICLES:END -->"

USER_AGENT = "Mozilla/5.0 (compatible; GitHub Actions bot)"


def fetch_blog_articles():
    request = urllib.request.Request(
        FEED_URL,
        headers={"User-Agent": USER_AGENT, "Accept": "application/feed+json, application/json"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        feed = json.load(response)
    items = sorted(feed.get("items", []), key=lambda item: item.get("date_published", ""), reverse=True)
    articles = [{"title": item["title"], "url": item["url"]} for item in items if item.get("title") and item.get("url")]
    return articles[:ARTICLE_LIMIT]


def markdown_title(title):
    return title.replace("[", "\\[").replace("]", "\\]")


def build_blog_rows(articles):
    return "\n".join(f'- [{markdown_title(a["title"])}]({a["url"]})' for a in articles)


def replace_section(content, start_marker, end_marker, new_body):
    pattern = re.compile(
        rf"{re.escape(start_marker)}.*?{re.escape(end_marker)}",
        re.DOTALL,
    )
    return pattern.sub(lambda _: f"{start_marker}\n{new_body}\n{end_marker}", content)


def main():
    print(f"📡 Fetching articles from {FEED_URL}...")
    try:
        articles = fetch_blog_articles()
    except Exception as error:
        print(f"   ⚠️  Blog feed unavailable: {error}")
        print("   README.md left unchanged.")
        return
    if not articles:
        print("   ⚠️  Blog feed has no articles, README.md left unchanged.")
        return
    print(f"   ✅ {len(articles)} latest articles.")

    with open(README_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    if BLOG_START not in content or BLOG_END not in content:
        raise SystemExit(f"README.md is missing {BLOG_START} / {BLOG_END}")

    content = replace_section(content, BLOG_START, BLOG_END, build_blog_rows(articles))

    with open(README_PATH, "w", encoding="utf-8") as f:
        f.write(content)

    print("✅ README.md updated successfully!")


if __name__ == "__main__":
    main()
