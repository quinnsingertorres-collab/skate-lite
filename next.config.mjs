/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Ship the generated schedule index with the vehicles API function
  outputFileTracingIncludes: { "/api/vehicles": ["./data-gen/**"] },
};
