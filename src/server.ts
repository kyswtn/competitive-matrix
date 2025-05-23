import {Database as SqliteDatabase} from 'bun:sqlite'
import indexHtml from './index.html'

// Bun ships a built-in SQLite3 client, pretty neat.
const db = new SqliteDatabase('src/data.db', {create: false, readonly: true})

Bun.serve({
  port: 3000,
  development: import.meta.env.NODE_ENV === 'development',
  routes: {
    // Bun ships a built-in HTML transpiler toolchain too!
    '/': indexHtml,
    '/api/sdks': () => {
      const query = db.query(`
        SELECT
          *
        FROM
          sdk
      `)
      const result = query.all()
      return Response.json(result)
    },
    '/api/churn': (req) => {
      const url = new URL(req.url)
      const sdkIds = url.searchParams.getAll('id')
      if (sdkIds.length < 1) {
        return new Response('At least one SDK ID must be provided as ?id param', {status: 400})
      }

      // Bun provides auto error escaping sql`` template function for working with postgres,
      // but that unfortunate can't be used for sqlite. We'll have to generate custom placeholders
      // ?\d+ for us.
      const placeholders = sdkIds.map((_, i) => `$${i + 1}`).join(', ')
      const query = db.query(`
        -- For all provided SDK IDs, we'll find all app_ids that are installed,
        -- and group them up by sdk_id and group_concat them in an array,
        -- we'll also count them up so that client don't have to go through it just
        -- to get the count.
        SELECT
          sdk_id AS from_sdk,
          sdk_id AS to_sdk,
          COUNT(DISTINCT app_id) AS count
        FROM
          app_sdk
        WHERE
          sdk_id IN (${placeholders})
        AND
          installed = TRUE
        GROUP BY
          sdk_id

        UNION ALL

        -- Select the same things, but with sdk_id != our above sdk_id and
        -- also join them up on where app_id matches and also make sure installed
        -- is false too because installed case is handle already by the above query.
        SELECT
          a.sdk_id AS from_sdk,
          b.sdk_id AS to_sdk,
          COUNT(DISTINCT b.app_id) AS count
        FROM
          app_sdk a
        LEFT JOIN
          app_sdk b
        ON
          a.app_id = b.app_id
        AND
          a.sdk_id != b.sdk_id
        WHERE
          a.sdk_id IN (${placeholders})
        AND
          a.installed = FALSE
        AND
          b.installed = TRUE
        GROUP BY
          b.sdk_id
      `)
      query.values(...sdkIds)
      const result = query.all()
      return Response.json(result)
    },
    '/api/apps/:from/:to': (req) => {
      const {from, to} = req.params
      const query = db.query(`
        -- This is essentially the same as the query from previous API
        -- except for joining on app table to get more details
        SELECT
          c.*
        FROM
          app_sdk a
        LEFT JOIN
          app_sdk b,
          app c
        ON
          b.sdk_id = $to
        AND
          a.app_id = b.app_id
        AND
          a.app_id = c.id
        WHERE
          a.sdk_id = $from
        AND
          a.installed = FALSE
        AND
          b.installed = TRUE
      `)
      query.values({$from: from, $to: to})
      const result = query.all()
      return Response.json(result)
    },
  },
})
