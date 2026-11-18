// Font files are embedded by esbuild's base64 loader (esbuild.config.mjs):
// importing one yields its contents as a base64 string.
declare module "*.woff2" {
  const base64: string;
  export default base64;
}
