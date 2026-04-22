/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent webpack from bundling server-only packages through the client bundle.
  serverExternalPackages: ["kafkajs"],

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // kafkajs uses Node.js built-ins (crypto, net, tls, etc.) that don't
      // exist in the browser. Tell webpack to resolve them to empty modules
      // instead of throwing "Module not found" errors.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        net: false,
        tls: false,
        fs: false,
        dns: false,
        "timers/promises": false,
      }
    }
    return config
  },
}
module.exports = nextConfig
