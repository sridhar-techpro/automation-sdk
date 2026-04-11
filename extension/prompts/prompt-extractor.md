Given page HTML, extract product data.

Return JSON array:

[
  {
    "name": "...",
    "price": "...",
    "rating": "...",
    "reviews": "...",
    "inStock": true
  }
]

Rules:
- extract all visible products
- include rating as number
- include review count as number
- mark inStock false if out-of-stock text is present
