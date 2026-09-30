// Vite's `?raw` suffix imports a file's text as a string (used for the vendored
// jev-snapshot.js, evaluated inside the page rather than bundled as code).
declare module '*?raw' {
  const source: string
  export default source
}
