import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool, tx } from './db.js';

const people = ['Aisha', 'Rohan', 'Priya', 'Meera', 'Dev', 'Sam'];

await tx(async client => {
  const existing = await client.query('select id from users where email = $1', ['aisha@example.com']);
  if (existing.rowCount) return;
  const users = new Map<string, string>();
  for (const name of people) {
    const id = randomUUID();
    users.set(name, id);
    await client.query(
      'insert into users (id, display_name, username, email, password_hash) values ($1,$2,$3,$4,$5)',
      [id, name, name.toLowerCase(), `${name.toLowerCase()}@example.com`, await bcrypt.hash('password123', 12)]
    );
  }
  const groupId = randomUUID();
  await client.query('insert into groups (id, name, base_currency, created_by) values ($1,$2,$3,$4)', [groupId, 'Flatmates 2026', 'INR', users.get('Aisha')]);
  const memberships: [string, string, string | null][] = [
    ['Aisha', '2026-02-01', null],
    ['Rohan', '2026-02-01', null],
    ['Priya', '2026-02-01', null],
    ['Meera', '2026-02-01', '2026-03-31'],
    ['Dev', '2026-02-08', '2026-03-14'],
    ['Sam', '2026-04-10', null]
  ];
  for (const [name, joined, left] of memberships) {
    await client.query(
      'insert into group_memberships (id, group_id, user_id, joined_on, left_on) values ($1,$2,$3,$4,$5)',
      [randomUUID(), groupId, users.get(name), joined, left]
    );
  }
});

await pool.end();
console.log('Seeded demo data. Login with aisha@example.com / password123');

