const { Client } = require('pg');
(async () => {
  const c = new Client({
    connectionString: 'postgresql://postgres:wPwAMQTJwB1WTBXF@localhost:5433/postgres',
  });
  await c.connect();
  const r = await c.query('SELECT id FROM "User" LIMIT 1');
  console.log(r.rows[0]?.id || '');
  await c.end();
})();
