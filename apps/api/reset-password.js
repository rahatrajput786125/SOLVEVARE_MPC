const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');

async function main() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('mpc_dev');

  const newPassword = 'Admin@1234';
  const hash = await bcrypt.hash(newPassword, 12);

  const result = await db.collection('users').updateOne(
    { email: 'solvevaredev@gmail.com' },
    { $set: { passwordHash: hash } }
  );

  console.log('Updated:', result.modifiedCount);
  console.log('New password:', newPassword);
  console.log('Hash:', hash);

  await client.close();
}

main().catch(console.error);
