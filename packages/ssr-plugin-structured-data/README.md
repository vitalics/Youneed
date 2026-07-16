# @youneed/ssr-plugin-structured-data

JSON-LD ([schema.org](https://schema.org)) structured data for SSR pages —
an SSR module for [`@youneed/server-plugin-ssr`](../server-plugin-ssr).

Unlike robots/sitemap/rss/llms (which serve their own routes), structured data
is embedded in the document `<head>`.

## Site-wide

Inject Organization / WebSite (or anything) into **every** page:

```ts
import { ssr } from "@youneed/server-plugin-ssr";
import { structuredData, organization, website } from "@youneed/ssr-plugin-structured-data";

app.plugin(
  ssr({
    origin: "https://example.com",
    modules: [
      structuredData({
        schemas: [
          organization({ name: "Example", url: "https://example.com", logo: "/logo.png" }),
          website({ name: "Example", url: "https://example.com", searchUrl: "https://example.com/search?q=" }),
        ],
      }),
    ],
  }),
);
```

`schemas` may be a per-request function `(ctx) => …` to vary by request.

## Per page

Use the `jsonLd()` helper inside a Page's `head()`:

```ts
import { jsonLd, article, breadcrumbs } from "@youneed/ssr-plugin-structured-data";

class Post extends Page("/blog/:slug") {
  head() {
    return [
      jsonLd(article({ headline: this.post.title, author: "Jane", datePublished: this.post.date })),
      jsonLd(breadcrumbs([{ name: "Home", url: "/" }, { name: "Blog", url: "/blog" }])),
    ];
  }
}
```

Builders: `organization`, `website`, `article`, `breadcrumbs`. `jsonLd()` injects
`@context`, handles arrays, and escapes `</script>`.

## Builders

Typed wrappers exist for the common schema.org shapes:

- **Core:** `organization`, `website`, `webPage`, `article`, `breadcrumbs`
- **People & places:** `person`, `postalAddress`, `geo`, `place`, `contactPoint`, `localBusiness`
- **Commerce:** `product`, `offer`, `aggregateRating`, `rating`, `review`
- **Events:** `event`
- **Content & media:** `imageObject`, `videoObject`, `faqPage`, `howTo`, `recipe`, `book`, `movie`
- **Offerings:** `course`, `softwareApplication`, `service`, `jobPosting`
- **Medical:** `medicalEntity`, `medicalCondition`, `drug`, `physician`, `hospital`

Every wrapper accepts arbitrary extra schema.org properties (index signature), and
all of them **deep-normalize `Date` values to ISO strings** anywhere in the tree.
Nested references coerce a bare string to a minimal node (e.g. `author: "Jane"` →
`Person`, `brand: "Acme"` → `Brand`, `provider: "Acme"` → `Organization`).

For any type without a dedicated wrapper, use the universal builder:

```ts
import { jsonLd, entity } from "@youneed/ssr-plugin-structured-data";

jsonLd(entity("SportsEvent", {
  name: "Final",
  startDate: new Date("2026-07-01T18:00:00Z"), // → ISO automatically
  location: entity("StadiumOrArena", { name: "Arena" }),
}));
```

```ts
import { jsonLd, product, offer, aggregateRating, review } from "@youneed/ssr-plugin-structured-data";

jsonLd(product({
  name: "Widget",
  brand: "Acme",
  offers: offer({ price: 9.99, priceCurrency: "USD", availability: "https://schema.org/InStock" }),
  aggregateRating: aggregateRating({ ratingValue: 4.5, reviewCount: 42 }),
  review: review({ author: "Jane", reviewRating: { ratingValue: 5 }, reviewBody: "Love it" }),
}));
```

## Build

```sh
pnpm --filter @youneed/ssr-plugin-structured-data run build
```
