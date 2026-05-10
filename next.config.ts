import type { NextConfig } from 'next'
import path from 'path'

const projectRoot = path.resolve(__dirname)

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: projectRoot,
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
}

export default nextConfig
