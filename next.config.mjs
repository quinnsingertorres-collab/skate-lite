/** @type {import('next').NextConfig} */
// Identifies this deploy, so open copies of the app can notice a newer one and reload
const BUILD = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || String(Date.now());

export default {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD: BUILD },
  // Ship the generated schedule index with the vehicles API function
  outputFileTracingIncludes: {
    "/api/vehicles": ["./data-gen/**"],
    "/api/vehicle-schedule": ["./data-gen/**"],
  },
};
