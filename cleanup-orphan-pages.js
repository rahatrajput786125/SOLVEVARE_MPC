// Cleanup script: soft-delete all pages whose project is deleted
const { MongoClient, ObjectId } = require("mongodb");

const DATABASE_URL = "mongodb://localhost:27017/mpc_dev";

async function main() {
  const client = new MongoClient(DATABASE_URL);
  await client.connect();
  const db = client.db();

  // Get all deleted project IDs
  const deletedProjects = await db.collection("projects").find(
    { $or: [{ deletedAt: { $ne: null } }, { status: "DELETED" }] },
    { projection: { _id: 1 } }
  ).toArray();

  const deletedProjectIds = deletedProjects.map(p => p._id.toString());
  console.log(`Found ${deletedProjectIds.length} deleted projects`);

  if (deletedProjectIds.length === 0) {
    console.log("No deleted projects found.");
    await client.close();
    return;
  }

  // Soft-delete all pages belonging to deleted projects
  const result = await db.collection("generated_pages").updateMany(
    {
      projectId: { $in: deletedProjectIds },
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
    },
    { $set: { deletedAt: new Date() } }
  );

  console.log(`Soft-deleted ${result.modifiedCount} orphan pages`);
  await client.close();
}

main().catch(console.error);
