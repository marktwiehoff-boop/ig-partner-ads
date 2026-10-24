export class HttpFehler extends Error {
  constructor(status, meldung) {
    super(meldung)
    this.status = status
  }
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** Gemeinsame Hülle für normale Funktionen: Fehler werden zu JSON-Antworten. */
export function handler(fn) {
  return async (req, context) => {
    try {
      return await fn(req, context)
    } catch (e) {
      const status = e instanceof HttpFehler ? e.status : 500
      if (status >= 500) console.error(e)
      return json(status, { fehler: e.message })
    }
  }
}
