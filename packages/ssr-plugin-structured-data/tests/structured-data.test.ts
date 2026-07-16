import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import type { Context } from "@youneed/server";
import type { SsrModuleContext } from "@youneed/server-plugin-ssr";
import {
  jsonLd,
  organization,
  website,
  article,
  breadcrumbs,
  structuredData,
  entity,
  person,
  event,
  place,
  postalAddress,
  product,
  offer,
  aggregateRating,
  review,
  faqPage,
  howTo,
  recipe,
  medicalEntity,
  medicalCondition,
} from "../src/index.ts";

class StructuredDataSuite extends Test({ name: "structured-data" }) {
  @Test.it("jsonLd wraps + injects @context + escapes </script>")
  wrap() {
    const out = jsonLd(organization({ name: "</script>Evil" }));
    expect(out).toContain('<script type="application/ld+json">');
    expect(out).toContain('"@context":"https://schema.org"');
    expect(out).toContain('"@type":"Organization"');
    expect(out).not.toContain("</script>E"); // payload escaped
  }

  @Test.it("array of schemas")
  array() {
    const out = jsonLd([organization({ name: "A" }), website({ name: "A", url: "https://a.test" })]);
    const json = out.slice(out.indexOf(">") + 1, out.lastIndexOf("<"));
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
  }

  @Test.it("builders: website searchUrl, article author/date, breadcrumbs")
  builders() {
    const w = website({ name: "S", url: "https://s.test", searchUrl: "https://s.test/?q=" });
    expect((w.potentialAction as { target: string }).target).toContain("{search_term_string}");

    const a = article({ headline: "H", author: "Jane", datePublished: new Date(Date.UTC(2026, 0, 1)) });
    expect((a.author as { name: string }).name).toBe("Jane");
    expect(a.datePublished).toBe("2026-01-01T00:00:00.000Z");

    const b = breadcrumbs([{ name: "Home", url: "/" }, { name: "Docs", url: "/docs" }]);
    expect((b.itemListElement as Array<{ position: number }>)[1].position).toBe(2);
  }

  @Test.it("module registers a head provider, fn schemas")
  module() {
    let provider: ((ctx: Context) => string[] | string | undefined) | undefined;
    const c: SsrModuleContext = {
      app: {} as never,
      routes: [],
      absolute: (p) => p,
      head: (p) => void (provider = p),
    };
    const m = structuredData({ schemas: (_ctx) => organization({ name: "Dyn" }) });
    m.setup(c);
    expect(typeof provider).toBe("function");
    const head = provider!({} as Context);
    expect(String(head)).toContain('"name":"Dyn"');
  }
}

class EntityZooSuite extends Test({ name: "structured-data: entities" }) {
  @Test.it("entity() makes any type + deep-normalizes Dates")
  generic() {
    const e = entity("CollectionPage", { name: "X", dateCreated: new Date(Date.UTC(2026, 0, 2)), nested: { at: new Date(Date.UTC(2026, 5, 1)) } });
    expect(e["@type"]).toBe("CollectionPage");
    expect(e.dateCreated).toBe("2026-01-02T00:00:00.000Z");
    expect((e.nested as { at: string }).at).toBe("2026-06-01T00:00:00.000Z");
  }

  @Test.it("person + nested worksFor coercion")
  people() {
    const p = person({ name: "Jane", jobTitle: "Dev", worksFor: "Acme" });
    expect(p["@type"]).toBe("Person");
    expect((p.worksFor as { "@type": string; name: string })).toEqual({ "@type": "Organization", name: "Acme" });
  }

  @Test.it("event dates → ISO, nested place")
  events() {
    const e = event({
      name: "Conf",
      startDate: new Date(Date.UTC(2026, 8, 1, 9)),
      location: place({ name: "Hall", address: postalAddress({ addressLocality: "Berlin" }) }),
    });
    expect(e.startDate).toBe("2026-09-01T09:00:00.000Z");
    expect((e.location as Record<string, unknown>)["@type"]).toBe("Place");
    expect(((e.location as Record<string, unknown>).address as Record<string, unknown>)["@type"]).toBe("PostalAddress");
  }

  @Test.it("product: brand coercion + offers + aggregateRating")
  products() {
    const p = product({
      name: "Widget",
      brand: "Acme",
      offers: offer({ price: 9.99, priceCurrency: "USD", priceValidUntil: new Date(Date.UTC(2026, 11, 31)) }),
      aggregateRating: aggregateRating({ ratingValue: 4.5, reviewCount: 10 }),
    });
    expect(p.brand).toEqual({ "@type": "Brand", name: "Acme" });
    expect((p.offers as Record<string, unknown>)["@type"]).toBe("Offer");
    expect((p.offers as Record<string, unknown>).priceValidUntil).toBe("2026-12-31T00:00:00.000Z");
    expect((p.aggregateRating as Record<string, unknown>)["@type"]).toBe("AggregateRating");
  }

  @Test.it("review author coercion")
  reviews() {
    const r = review({ author: "Bob", reviewBody: "Great", reviewRating: { ratingValue: 5 } });
    expect((r.author as { "@type": string; name: string })).toEqual({ "@type": "Person", name: "Bob" });
  }

  @Test.it("faqPage builds Question/Answer mainEntity")
  faq() {
    const f = faqPage([{ question: "Q1?", answer: "A1" }]);
    expect(f["@type"]).toBe("FAQPage");
    const q = (f.mainEntity as Array<Record<string, unknown>>)[0];
    expect(q["@type"]).toBe("Question");
    expect((q.acceptedAnswer as Record<string, unknown>).text).toBe("A1");
  }

  @Test.it("howTo numbers its steps")
  steps() {
    const h = howTo({ name: "Make tea", steps: [{ text: "Boil" }, { text: "Steep" }] });
    const list = h.step as Array<Record<string, unknown>>;
    expect(list[0]).toEqual({ "@type": "HowToStep", position: 1, text: "Boil" });
    expect(list[1].position).toBe(2);
  }

  @Test.it("recipe author coercion + date")
  recipes() {
    const r = recipe({ name: "Bread", author: "Chef", datePublished: new Date(Date.UTC(2026, 0, 1)) });
    expect((r.author as { name: string }).name).toBe("Chef");
    expect(r.datePublished).toBe("2026-01-01T00:00:00.000Z");
  }

  @Test.it("medical entities")
  medical() {
    expect(medicalEntity({ name: "Aspirin therapy" })["@type"]).toBe("MedicalEntity");
    const c = medicalCondition({ name: "Migraine", possibleTreatment: "Rest" });
    expect(c["@type"]).toBe("MedicalCondition");
    expect(c.possibleTreatment).toBe("Rest");
  }
}

await TestApplication()
  .addTests(StructuredDataSuite, EntityZooSuite)
  .reporter(new ConsoleReporter())
  .run();
