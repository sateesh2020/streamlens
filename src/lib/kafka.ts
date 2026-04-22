import { Kafka, SASLOptions, logLevel } from "kafkajs"
import { Cluster } from "@/types"

export function createKafkaClient(cluster: Cluster): Kafka {
  // Parse brokers: split by comma or newline, trim whitespace
  const brokers = cluster.brokers
    .split(/[,\n]/)
    .map((b) => b.trim())
    .filter(Boolean)

  // Parse auth_config — Prisma returns Json as object already, but the type
  // stores it as string in some paths; handle both.
  let authConfig: Record<string, unknown>
  if (typeof cluster.auth_config === "string") {
    try {
      authConfig = JSON.parse(cluster.auth_config)
    } catch {
      authConfig = {}
    }
  } else {
    authConfig = (cluster.auth_config as Record<string, unknown>) ?? {}
  }

  let ssl: boolean | object | undefined
  let sasl: SASLOptions | undefined

  switch (cluster.auth_type) {
    case "none":
      // No ssl or sasl
      break

    case "sasl_plain": {
      sasl = {
        mechanism: "plain",
        username: String(authConfig.username ?? ""),
        password: String(authConfig.password ?? ""),
      }
      break
    }

    case "sasl_scram_256": {
      sasl = {
        mechanism: "scram-sha-256",
        username: String(authConfig.username ?? ""),
        password: String(authConfig.password ?? ""),
      }
      break
    }

    case "sasl_scram_512": {
      sasl = {
        mechanism: "scram-sha-512",
        username: String(authConfig.username ?? ""),
        password: String(authConfig.password ?? ""),
      }
      break
    }

    case "ssl": {
      const sslConfig: Record<string, unknown> = {
        rejectUnauthorized: authConfig.rejectUnauthorized !== false,
      }
      if (authConfig.ca) sslConfig.ca = authConfig.ca
      if (authConfig.cert) sslConfig.cert = authConfig.cert
      if (authConfig.key) sslConfig.key = authConfig.key
      ssl = sslConfig
      break
    }

    default:
      break
  }

  return new Kafka({
    clientId: "streamlens",
    brokers,
    ssl,
    sasl,
    logLevel: logLevel.NOTHING,
  })
}
