const Floor = require("../models/floor");
const Location = require("../models/location");
const Zone = require("../models/zone");

async function refreshLocationCounters(locationId, ownerId) {
  const [floors, zones] = await Promise.all([
    Floor.countDocuments({ locationId, ownerId }),
    Zone.countDocuments({ locationId, ownerId }),
  ]);

  return Location.findOneAndUpdate(
    { _id: locationId, ownerId },
    { $set: { floors, zones } },
    { new: true, runValidators: true },
  );
}

module.exports = { refreshLocationCounters };
