async function withSessions(db, fn) {
  if (!db.opened) await db.ready()

  const sessions = db._state.columnFamilies.map((columnFamily) =>
    db.session({ columnFamily, snapshot: false })
  )

  try {
    return await fn(sessions)
  } finally {
    for (const session of sessions) await session.close()
  }
}

module.exports = withSessions
