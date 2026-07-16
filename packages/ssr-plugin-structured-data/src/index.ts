// @youneed/ssr-plugin-structured-data — JSON-LD (schema.org) for SSR pages.
//
// Two ways to use it:
//
//  1. Site-wide, via the SSR plugin — inject Organization/WebSite (or anything)
//     into EVERY page's <head>:
//
//       import { ssr } from "@youneed/server-plugin-ssr";
//       import { structuredData, organization, website } from "@youneed/ssr-plugin-structured-data";
//
//       app.plugin(ssr({
//         origin: "https://example.com",
//         modules: [
//           structuredData({
//             schemas: [
//               organization({ name: "Example", url: "https://example.com" }),
//               website({ name: "Example", url: "https://example.com" }),
//             ],
//           }),
//         ],
//       }));
//
//  2. Per page, via the `jsonLd()` helper inside a Page's `head()`:
//
//       head() { return [jsonLd(article({ headline: this.post.title, ... }))]; }
//
// Unlike robots/sitemap/rss/llms (which serve their own routes), structured data
// is embedded in the document head — so this module uses the SSR context's
// `head()` registration rather than registering a route.

import type { Context } from "@youneed/server";
import type { SsrModule, SsrModuleContext } from "@youneed/server-plugin-ssr";

/** A JSON-LD node. `@type`/`@context` are merged in by the builders below. */
export type Schema = Record<string, unknown>;

const escapeScript = (json: string): string =>
  // Neutralize "</script>" and HTML-comment openers so the JSON can't break out.
  json.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "\\u003c!--");

/**
 * Wrap one or more schema objects in a `<script type="application/ld+json">`.
 * A single schema is emitted as-is; multiple as a JSON array. `@context` defaults
 * to "https://schema.org" when a node has a `@type` but no explicit context.
 */
export function jsonLd(schema: Schema | Schema[]): string {
  const withContext = (s: Schema): Schema =>
    s["@type"] && !s["@context"] ? { "@context": "https://schema.org", ...s } : s;
  const payload = Array.isArray(schema) ? schema.map(withContext) : withContext(schema);
  return `<script type="application/ld+json">${escapeScript(JSON.stringify(payload))}</script>`;
}

// ── typed builders (the common schema.org shapes) ─────────────────────────────

export interface OrganizationInput {
  name: string;
  url?: string;
  logo?: string;
  sameAs?: string[];
  [key: string]: unknown;
}
export const organization = (input: OrganizationInput): Schema => ({
  "@type": "Organization",
  ...input,
});

export interface WebSiteInput {
  name: string;
  url: string;
  /** Adds a SearchAction `potentialAction` for sitelinks search box. */
  searchUrl?: string;
  [key: string]: unknown;
}
export const website = ({ searchUrl, ...input }: WebSiteInput): Schema => ({
  "@type": "WebSite",
  ...input,
  ...(searchUrl
    ? {
        potentialAction: {
          "@type": "SearchAction",
          target: `${searchUrl}{search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      }
    : {}),
});

export interface ArticleInput {
  headline: string;
  description?: string;
  image?: string | string[];
  datePublished?: string | Date;
  dateModified?: string | Date;
  author?: string | { name: string; url?: string };
  [key: string]: unknown;
}
export const article = ({ author, datePublished, dateModified, ...input }: ArticleInput): Schema => ({
  "@type": "Article",
  ...input,
  ...(datePublished
    ? { datePublished: datePublished instanceof Date ? datePublished.toISOString() : datePublished }
    : {}),
  ...(dateModified
    ? { dateModified: dateModified instanceof Date ? dateModified.toISOString() : dateModified }
    : {}),
  ...(author
    ? { author: typeof author === "string" ? { "@type": "Person", name: author } : { "@type": "Person", ...author } }
    : {}),
});

/** A breadcrumb trail → `BreadcrumbList`. */
export const breadcrumbs = (items: Array<{ name: string; url: string }>): Schema => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: it.name,
    item: it.url,
  })),
});

// ── generic builder + entity zoo ──────────────────────────────────────────────
//
// schema.org has 800+ types; we can't (and shouldn't) hand-write them all. The
// `entity()` builder is the universal escape hatch — `entity("Recipe", { … })`
// makes ANY type, and deep-normalizes `Date` values to ISO strings everywhere in
// the tree. The typed wrappers below cover the common shapes with autocomplete;
// every one accepts arbitrary extra schema.org properties via an index signature,
// so the long tail of properties is reachable too.

/** Recursively convert every `Date` in the value to an ISO string. */
function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v);
    return out;
  }
  return value;
}

/** The universal builder: `entity("<Type>", { … })` → a schema node. Use this
 *  for any schema.org type without a dedicated wrapper below. */
export function entity(type: string, input: Record<string, unknown> = {}): Schema {
  return { "@type": type, ...(normalize(input) as Record<string, unknown>) };
}

/** Common reference coercions: a bare string becomes a minimal typed node. */
const personRef = (a: string | Schema): Schema => (typeof a === "string" ? { "@type": "Person", name: a } : a);
const orgRef = (o: string | Schema): Schema => (typeof o === "string" ? { "@type": "Organization", name: o } : o);
const brandRef = (b: string | Schema): Schema => (typeof b === "string" ? { "@type": "Brand", name: b } : b);

// ── people / places ────────────────────────────────────────────────────────────

export interface PersonInput {
  name: string;
  url?: string;
  image?: string;
  jobTitle?: string;
  email?: string;
  telephone?: string;
  sameAs?: string[];
  worksFor?: string | Schema;
  [key: string]: unknown;
}
export const person = ({ worksFor, ...input }: PersonInput): Schema =>
  entity("Person", { ...input, ...(worksFor !== undefined ? { worksFor: orgRef(worksFor) } : {}) });

export interface PostalAddressInput {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
  [key: string]: unknown;
}
export const postalAddress = (input: PostalAddressInput): Schema => entity("PostalAddress", input);

export interface GeoInput {
  latitude: number | string;
  longitude: number | string;
  [key: string]: unknown;
}
export const geo = (input: GeoInput): Schema => entity("GeoCoordinates", input);

export interface PlaceInput {
  name?: string;
  address?: string | Schema;
  geo?: Schema;
  telephone?: string;
  [key: string]: unknown;
}
export const place = (input: PlaceInput): Schema => entity("Place", input);

export interface ContactPointInput {
  telephone: string;
  contactType?: string;
  email?: string;
  areaServed?: string | string[];
  availableLanguage?: string | string[];
  [key: string]: unknown;
}
export const contactPoint = (input: ContactPointInput): Schema => entity("ContactPoint", input);

export interface LocalBusinessInput {
  name: string;
  address?: string | Schema;
  geo?: Schema;
  telephone?: string;
  url?: string;
  image?: string | string[];
  priceRange?: string;
  /** e.g. "Mo-Fr 09:00-17:00" or a list. */
  openingHours?: string | string[];
  [key: string]: unknown;
}
export const localBusiness = (input: LocalBusinessInput): Schema => entity("LocalBusiness", input);

// ── commerce ────────────────────────────────────────────────────────────────────

export interface OfferInput {
  price: number | string;
  priceCurrency: string;
  availability?: string;
  url?: string;
  priceValidUntil?: string | Date;
  itemCondition?: string;
  [key: string]: unknown;
}
export const offer = (input: OfferInput): Schema => entity("Offer", input);

export interface AggregateRatingInput {
  ratingValue: number | string;
  reviewCount?: number;
  ratingCount?: number;
  bestRating?: number | string;
  worstRating?: number | string;
  [key: string]: unknown;
}
export const aggregateRating = (input: AggregateRatingInput): Schema => entity("AggregateRating", input);

export interface RatingInput {
  ratingValue: number | string;
  bestRating?: number | string;
  worstRating?: number | string;
  [key: string]: unknown;
}
export const rating = (input: RatingInput): Schema => entity("Rating", input);

export interface ReviewInput {
  author: string | Schema;
  reviewRating?: Schema;
  reviewBody?: string;
  datePublished?: string | Date;
  [key: string]: unknown;
}
export const review = ({ author, ...input }: ReviewInput): Schema =>
  entity("Review", { author: personRef(author), ...input });

export interface ProductInput {
  name: string;
  description?: string;
  image?: string | string[];
  sku?: string;
  gtin?: string;
  brand?: string | Schema;
  offers?: Schema | Schema[];
  aggregateRating?: Schema;
  review?: Schema | Schema[];
  [key: string]: unknown;
}
export const product = ({ brand, ...input }: ProductInput): Schema =>
  entity("Product", { ...input, ...(brand !== undefined ? { brand: brandRef(brand) } : {}) });

// ── events ────────────────────────────────────────────────────────────────────

export interface EventInput {
  name: string;
  startDate?: string | Date;
  endDate?: string | Date;
  /** A Place node (build with `place()`), a string, or a VirtualLocation. */
  location?: string | Schema;
  description?: string;
  image?: string | string[];
  offers?: Schema | Schema[];
  performer?: string | Schema;
  organizer?: string | Schema;
  eventStatus?: string;
  eventAttendanceMode?: string;
  [key: string]: unknown;
}
export const event = (input: EventInput): Schema => entity("Event", input);

// ── content / media ─────────────────────────────────────────────────────────────

export interface ImageObjectInput {
  url: string;
  caption?: string;
  width?: number;
  height?: number;
  [key: string]: unknown;
}
export const imageObject = (input: ImageObjectInput): Schema => entity("ImageObject", input);

export interface VideoObjectInput {
  name: string;
  description?: string;
  thumbnailUrl?: string | string[];
  uploadDate?: string | Date;
  contentUrl?: string;
  embedUrl?: string;
  duration?: string;
  [key: string]: unknown;
}
export const videoObject = (input: VideoObjectInput): Schema => entity("VideoObject", input);

export interface WebPageInput {
  name?: string;
  description?: string;
  url?: string;
  [key: string]: unknown;
}
export const webPage = (input: WebPageInput): Schema => entity("WebPage", input);

/** A FAQ page from question/answer pairs → `FAQPage` of `Question`/`Answer`. */
export const faqPage = (items: Array<{ question: string; answer: string }>): Schema =>
  entity("FAQPage", {
    mainEntity: items.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: { "@type": "Answer", text: q.answer },
    })),
  });

export interface HowToInput {
  name: string;
  description?: string;
  totalTime?: string;
  image?: string | string[];
  steps: Array<{ name?: string; text: string; url?: string; image?: string }>;
  [key: string]: unknown;
}
export const howTo = ({ steps, ...input }: HowToInput): Schema =>
  entity("HowTo", {
    ...input,
    step: steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, ...s })),
  });

export interface RecipeInput {
  name: string;
  image?: string | string[];
  author?: string | Schema;
  description?: string;
  datePublished?: string | Date;
  prepTime?: string;
  cookTime?: string;
  recipeYield?: string;
  recipeIngredient?: string[];
  recipeInstructions?: string | string[] | Schema[];
  [key: string]: unknown;
}
export const recipe = ({ author, ...input }: RecipeInput): Schema =>
  entity("Recipe", { ...input, ...(author !== undefined ? { author: personRef(author) } : {}) });

export interface BookInput {
  name: string;
  author?: string | Schema;
  isbn?: string;
  numberOfPages?: number;
  [key: string]: unknown;
}
export const book = ({ author, ...input }: BookInput): Schema =>
  entity("Book", { ...input, ...(author !== undefined ? { author: personRef(author) } : {}) });

export interface MovieInput {
  name: string;
  director?: string | Schema;
  dateCreated?: string | Date;
  image?: string;
  [key: string]: unknown;
}
export const movie = ({ director, ...input }: MovieInput): Schema =>
  entity("Movie", { ...input, ...(director !== undefined ? { director: personRef(director) } : {}) });

// ── offerings: courses, software, services, jobs ─────────────────────────────────

export interface CourseInput {
  name: string;
  description?: string;
  provider?: string | Schema;
  [key: string]: unknown;
}
export const course = ({ provider, ...input }: CourseInput): Schema =>
  entity("Course", { ...input, ...(provider !== undefined ? { provider: orgRef(provider) } : {}) });

export interface SoftwareApplicationInput {
  name: string;
  applicationCategory?: string;
  operatingSystem?: string;
  offers?: Schema | Schema[];
  aggregateRating?: Schema;
  [key: string]: unknown;
}
export const softwareApplication = (input: SoftwareApplicationInput): Schema =>
  entity("SoftwareApplication", input);

export interface ServiceInput {
  name: string;
  description?: string;
  provider?: string | Schema;
  areaServed?: string | string[];
  [key: string]: unknown;
}
export const service = ({ provider, ...input }: ServiceInput): Schema =>
  entity("Service", { ...input, ...(provider !== undefined ? { provider: orgRef(provider) } : {}) });

export interface JobPostingInput {
  title: string;
  description: string;
  datePosted?: string | Date;
  validThrough?: string | Date;
  employmentType?: string;
  hiringOrganization?: string | Schema;
  jobLocation?: Schema;
  [key: string]: unknown;
}
export const jobPosting = ({ hiringOrganization, ...input }: JobPostingInput): Schema =>
  entity("JobPosting", {
    ...input,
    ...(hiringOrganization !== undefined ? { hiringOrganization: orgRef(hiringOrganization) } : {}),
  });

// ── medical (MedicalEntity + common subtypes) ────────────────────────────────────

export interface MedicalEntityInput {
  name: string;
  code?: Schema;
  guideline?: Schema | Schema[];
  recognizingAuthority?: string | Schema;
  [key: string]: unknown;
}
export const medicalEntity = (input: MedicalEntityInput): Schema => entity("MedicalEntity", input);

export interface MedicalConditionInput {
  name: string;
  signOrSymptom?: string | Schema | Array<string | Schema>;
  possibleTreatment?: string | Schema | Array<string | Schema>;
  cause?: string | Schema;
  [key: string]: unknown;
}
export const medicalCondition = (input: MedicalConditionInput): Schema => entity("MedicalCondition", input);

export interface DrugInput {
  name: string;
  activeIngredient?: string;
  dosageForm?: string;
  prescriptionStatus?: string;
  [key: string]: unknown;
}
export const drug = (input: DrugInput): Schema => entity("Drug", input);

export interface PhysicianInput {
  name: string;
  medicalSpecialty?: string | string[];
  address?: string | Schema;
  telephone?: string;
  [key: string]: unknown;
}
export const physician = (input: PhysicianInput): Schema => entity("Physician", input);

export interface HospitalInput {
  name: string;
  address?: string | Schema;
  telephone?: string;
  medicalSpecialty?: string | string[];
  [key: string]: unknown;
}
export const hospital = (input: HospitalInput): Schema => entity("Hospital", input);

// ── the SSR module ────────────────────────────────────────────────────────────

export interface StructuredDataOptions {
  /** Site-wide schema(s) injected into every page. Value or per-request fn. */
  schemas: Schema | Schema[] | ((ctx: Context) => Schema | Schema[] | undefined);
}

/** A structured-data {@link SsrModule} (site-wide JSON-LD in every page head). */
export function structuredData(options: StructuredDataOptions): SsrModule {
  return {
    name: "structured-data",
    setup(ctx: SsrModuleContext) {
      ctx.head((reqCtx) => {
        const schemas =
          typeof options.schemas === "function" ? options.schemas(reqCtx) : options.schemas;
        if (!schemas || (Array.isArray(schemas) && schemas.length === 0)) return undefined;
        return jsonLd(schemas);
      });
    },
    inspect() {
      const dynamic = typeof options.schemas === "function";
      const list = dynamic ? [] : Array.isArray(options.schemas) ? options.schemas : [options.schemas];
      const types = (list as Schema[]).map((s) => s?.["@type"]).filter(Boolean) as string[];
      return { kind: "structured-data", dynamic, types };
    },
  };
}
