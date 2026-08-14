const bcrypt = require("bcryptjs");
const User = require("../models/user");

async function seedOwner(options = {}) {
  const name = process.env.SEED_OWNER_NAME || "VenueFlow Owner";
  const email = (process.env.SEED_OWNER_EMAIL || "owner@venueflow.local").trim().toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD;

  if (!password || password.length < 8) {
    throw new Error("SEED_OWNER_PASSWORD must be set and contain at least 8 characters");
  }

  let user = await User.findOne({ email }).select("+passwordHash");
  if (!user) {
    user = await User.create({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: "owner",
    });
    options.log?.(`Seed owner created: ${email}`);
    return { user, created: true };
  }

  user.name = name;
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    user.passwordHash = await bcrypt.hash(password, 12);
  }
  await user.save();
  options.log?.(`Seed owner verified: ${email}`);
  return { user, created: false };
}

module.exports = { seedOwner };
