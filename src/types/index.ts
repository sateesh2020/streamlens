// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type ClusterAuthType =
  | "none"
  | "sasl_plain"
  | "sasl_scram_256"
  | "sasl_scram_512"
  | "ssl"

export interface SaslPlainConfig {
  username: string
  password: string
}

export interface SaslScramConfig {
  username: string
  password: string
}

export interface SslConfig {
  ca?: string       // PEM string or file path
  cert?: string
  key?: string
  rejectUnauthorized?: boolean
}

export type AuthConfig = SaslPlainConfig | SaslScramConfig | SslConfig | Record<string, never>

// ---------------------------------------------------------------------------
// Cluster (mirrors the DB row)
// ---------------------------------------------------------------------------

export interface Cluster {
  id: number
  name: string
  /** Comma-separated broker addresses, e.g. "localhost:9092,localhost:9093" */
  brokers: string
  auth_type: ClusterAuthType
  /** JSON-encoded AuthConfig */
  auth_config: string
  schema_registry_url: string | null
  description: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Form data (used in UI forms before persisting to DB)
// ---------------------------------------------------------------------------

export interface ClusterFormData {
  name: string
  /** Raw textarea input — one broker per line or comma-separated */
  brokers: string
  auth_type: ClusterAuthType
  auth_config: AuthConfig
  schema_registry_url?: string
  description?: string
}

// ---------------------------------------------------------------------------
// Kafka metadata types (returned by KafkaJS admin client)
// ---------------------------------------------------------------------------

export interface BrokerInfo {
  nodeId: number
  host: string
  port: number
  rack?: string
}

export interface PartitionInfo {
  partitionId: number
  leader: number
  replicas: number[]
  isr: number[]
  offlineReplicas: number[]
}

export interface TopicInfo {
  name: string
  partitions: PartitionInfo[]
  isInternal: boolean
  /** Approximate total message count across all partitions */
  messageCount?: number
  replicationFactor?: number
  configs?: Record<string, string>
}

export interface ConsumerGroupMember {
  memberId: string
  clientId: string
  clientHost: string
  memberAssignment: string
}

export interface ConsumerGroupPartitionOffset {
  topic: string
  partition: number
  offset: string
  lag: number
}

export interface ConsumerGroupInfo {
  groupId: string
  state: string
  protocol: string
  protocolType: string
  members: ConsumerGroupMember[]
  offsets: ConsumerGroupPartitionOffset[]
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface MessageRecord {
  topic: string
  partition: number
  offset: string
  timestamp: string
  key: string | null
  value: string | null
  headers: Record<string, string>
  size: number
}

// ---------------------------------------------------------------------------
// Schema Registry
// ---------------------------------------------------------------------------

export interface SchemaSubject {
  subject: string
  versions: number[]
  latestVersion: number
  schema: string
  schemaType: "AVRO" | "JSON" | "PROTOBUF"
}

// ---------------------------------------------------------------------------
// API response helpers
// ---------------------------------------------------------------------------

export interface ApiSuccessResponse<T> {
  success: true
  data: T
}

export interface ApiErrorResponse {
  success: false
  error: string
  details?: unknown
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse
