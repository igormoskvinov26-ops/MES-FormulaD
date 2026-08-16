// Vercel serverless function entry.
// The whole Express app is exported as a single function; all routes are
// rewritten here in vercel.json. The compiled handler lives in dist/ (produced
// by `npm run build`, which Vercel runs as the Build Command).
export { default } from '../dist/serverless.js';
