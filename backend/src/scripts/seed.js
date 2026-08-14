const { connectDatabase, disconnectDatabase } = require("../config/database");
const { seedOwner } = require("../services/seed-owner");

async function run() {
  try {
    await connectDatabase();
    await seedOwner({ log: console.log });
    console.log(`Login email: ${process.env.SEED_OWNER_EMAIL || "owner@venueflow.local"}`);
    console.log("Password: the value of SEED_OWNER_PASSWORD (only its bcrypt hash is stored)");
  } finally {
    await disconnectDatabase();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
