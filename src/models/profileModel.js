/* eslint-disable no-underscore-dangle */
import mongoose, { Schema } from 'mongoose';

const ProfileSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    firstName: {
      type: String,
      required: true,
    },
    middleName: String,
    lastName: String,
  },
  { autoCreate: true },
);

const Profile = mongoose.model('Profile', ProfileSchema);
export default Profile;
