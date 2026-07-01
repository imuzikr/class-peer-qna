/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 기본 보안 헤더 — 앱을 깨뜨리지 않는 안전한 항목만.
  // (CSP는 Pyodide CDN·Firebase 등과 함께 별도로 신중히 잡아야 하므로 여기선 제외)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
