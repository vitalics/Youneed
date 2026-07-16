// Let TS treat `import x from "./foo.css"` as a string (esbuild's text loader
// returns the file contents). Ambient + global, so no file needs to exist at
// type-check time — the build generates tailwind.gen.css.
declare module "*.css" {
  const css: string;
  export default css;
}
