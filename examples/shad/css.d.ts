// `import css from "./foo.css"` → string (esbuild's text loader). Ambient, so no
// file needs to exist at type-check time — the build generates tailwind.gen.css.
declare module "*.css" {
  const css: string;
  export default css;
}
