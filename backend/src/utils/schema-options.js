const jsonTransform = (_document, returned) => {
  returned.id = returned.externalId || returned._id.toString();
  delete returned._id;
  delete returned.externalId;
  delete returned.__v;
  delete returned.ownerId;
  delete returned.passwordHash;
  delete returned.data;
  return returned;
};

module.exports = {
  timestamps: true,
  toJSON: { virtuals: true, transform: jsonTransform },
  toObject: { virtuals: true, transform: jsonTransform },
};
