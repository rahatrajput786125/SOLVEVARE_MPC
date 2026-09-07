const { MongoClient } = require("mongodb");
MongoClient.connect("mongodb://localhost:27017/mpc_dev").then(c =>
  c.db().collection("users").find({}, { projection: { email: 1, name: 1, deletedAt: 1 } }).toArray().then(u => {
    console.log("Users in DB:", JSON.stringify(u, null, 2));
    c.close();
  })
).catch(console.error);
