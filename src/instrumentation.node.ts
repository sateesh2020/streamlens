export async function register() {
  // Only run in the Node.js runtime (not edge). Also skip in the build worker
  // that Next.js spawns during `next build` — NEXT_PHASE check avoids that.
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build"
  ) {
    return
  }

  const cron = await import("node-cron")
  const { prisma } = await import("@/lib/db")
  const { syncTopicsForCluster } = await import("@/lib/sync-topics-for-cluster")

  // Run at 02:00 AM server-local time every day.
  // Change the schedule string to suit your timezone needs, e.g.:
  //   "0 2 * * *"  → 02:00 daily
  //   "0 */6 * * *" → every 6 hours
  cron.schedule("0 */6 * * *", async () => {
    console.log("[cron] starting daily topic sync for all clusters")

    let clusters: { id: number; name: string }[] = []
    try {
      clusters = await prisma.cluster.findMany({ select: { id: true, name: true } })
    } catch (err) {
      console.error("[cron] failed to fetch clusters", err)
      return
    }

    const results = await Promise.allSettled(
      clusters.map((c) =>
        syncTopicsForCluster(c.id).then((r) => ({
          clusterId: c.id,
          clusterName: c.name,
          topicCount: r.topics.length,
        }))
      )
    )

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { clusterName, topicCount } = result.value
        console.log(`[cron] synced "${clusterName}" — ${topicCount} topics`)
      } else {
        console.error("[cron] sync failed for a cluster:", result.reason)
      }
    }

    console.log("[cron] daily topic sync complete")
  })

  console.log("[cron] daily topic sync scheduled (every 6 hours)")
}
