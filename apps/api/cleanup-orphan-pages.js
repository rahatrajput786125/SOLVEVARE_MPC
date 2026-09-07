const { MongoClient, ObjectId } = require("mongodb");
const DATABASE_URL = "mongodb://localhost:27017/mpc_dev";

async function main() {
  const client = new MongoClient(DATABASE_URL);
  await client.connect();
  const db = client.db();

  const deletedProjects = await db.collection("projects").find(
    { $or: [{ deletedAt: { $ne: null } }, { status: "DELETED" }] },
    { projection: { _id: 1 } }
  ).toArray();

  const deletedProjectObjectIds = deletedProjects.map(p => p._id);
  console.log(`Found ${deletedProjectObjectIds.length} deleted projects`);

  const result = await db.collection("generated_pages").updateMany(
    {
      projectId: { $in: deletedProjectObjectIds },
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
    },
    { $set: { deletedAt: new Date() } }
  );

  console.log(`Soft-deleted ${result.modifiedCount} orphan pages`);
  await client.close();
}

main().catch(console.error);
