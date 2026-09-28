function getFamilyProperties(sessions, names) {
  return Promise.all(
    sessions.map(async (session) => [
      session.defaultColumnFamily.name,
      await getProperties(session, names)
    ])
  )
}

function getProperties(session, names) {
  return Promise.all(names.map(async (name) => Number(await session.getProperty(name))))
}

module.exports = {
  getFamilyProperties,
  getProperties
}
