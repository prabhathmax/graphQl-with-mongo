import { gql } from 'apollo-server-express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { v4 } from 'uuid';
import sendEmail from '../utils/sendEmail';
import upload from '../utils/upload';
import Profile from '../models/profileModel';

const typeDefs = gql`
  directive @authenticated on OBJECT | FIELD_DEFINITION
  type User {
    id: ID
    firstName: String
    lastName: String
    email: String
    posts: [Post] @authenticated
  }
  type LoggedUser {
    user: User
    token: String!
  }
  type Query {
    me: User
    users: [User]
  }
  type Mutation {
    createUser(info: CreateUserInput): User
    login(info: UserLoginInputs): LoggedUser
    updateUser(info: UpdateUserInput): User @authenticated
    changePassword(info: ChangePasswordInput): LoggedUser @authenticated
    forgetPassword(email: String!): Boolean
    resetPassword(token: String!, password: String!): String
  }
  input CreateUserInput {
    firstName: String!
    lastName: String
    email: String!
    password: String!
  }
  input UpdateUserInput {
    email: String
    firstName: String
    lastName: String
    profileImage: Upload
  }
  input UserLoginInputs {
    email: String!
    password: String!
  }
  input ChangePasswordInput {
    currentPassword: String!
    newPassword: String!
    confirmPassword: String!
  }
`;

const resolvers = {
  User: {
    posts: (user, _, { model: { Post } }) => Post.find({ author: user.id }),
  },
  Query: {
    users: async (_, __, { model: { Profile } }) => {
      return Profile.find().populate('userId');
    },
    me: async (_, __, { model: { User }, currentUser }) => User.findOne({ _id: currentUser }),
  },
  Mutation: {
    createUser: async (_, { info }, { model: { User, Profile } }) => {
      const isUserExists = await User.findOne({ email: info.email });
      if (isUserExists) {
        throw new Error('Email already exists');
      }
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const newUser = await User.create([{ ...info }], { session });
        // eslint-disable-next-line no-param-reassign
        info.userId = newUser[0].id;
        await Profile.create([{ ...info }], { session });
        await session.commitTransaction();
        return { ...info };
      } catch (err) {
        await session.abortTransaction();
        throw new Error(err);
      } finally {
        session.endSession();
      }
    },
    updateUser: async (_, { info }, { model: { User }, currentUser }) => {
      const userInfo = { ...info };
      // check new email exists
      if (info.email) {
        const isEmailExists = await User.findOne({ email: info.email });
        if (isEmailExists) throw new Error('Email already exists');
      }
      // upload Image
      if (info.profileImage) {
        const imagePath = await upload(info.profileImage);
        if (imagePath) {
          userInfo.profileImage = imagePath;
        }
      }
      // update user
      try {
        const res = await User.updateOne({ _id: currentUser }, { ...userInfo });
        // check updated DB record
        if (res.n) {
          return User.findOne({ _id: currentUser }).exec();
        }
        // eslint-disable-next-line no-throw-literal
        throw 'user not found';
      } catch (err) {
        throw new Error(err);
      }
    },
    login: async (_, { info }, { model: { User } }) => {
      const loginUser = await User.findOne({ email: info.email });
      if (!loginUser) throw new Error('Invalid email or password');
      const isValidPassword = await loginUser.comparePassword(info.password);
      if (!isValidPassword) throw new Error('Invalid email or password');
      // eslint-disable-next-line no-underscore-dangle
      const token = generatetoken(loginUser.email, loginUser._id);

      return { user: loginUser, token };
    },
    changePassword: async (_, { info }, { model: { User }, currentUser }) => {
      const loggedUser = await User.findOne({ _id: currentUser });
      if (!loggedUser) throw new Error('User not found');
      const isValidPassword = await loggedUser.comparePassword(info.currentPassword);
      if (!isValidPassword) throw new Error('Invalid password');
      if (info.newPassword !== info.confirmPassword) {
        throw new Error('New password and confirm password do not match');
      }
      // Update user password
      try {
        await User.updateOne({ _id: currentUser }, { password: info.newPassword });
      } catch (err) {
        throw new Error(err);
      }
      // eslint-disable-next-line no-underscore-dangle
      const token = generatetoken(loggedUser.email, loggedUser._id);
      return { user: loggedUser, token };
    },
    forgetPassword: async (_, { email }, { model: { User } }) => {
      const user = await User.findOne({ email });
      if (!user) {
        // the email is not in the db
        return false;
      }
      const token = v4();
      // add token to db
      await User.updateOne({ _id: user.id }, { resetPasswordToken: token });
      // send email
      const html = `<a href="http://localhost:3000/reset-password/${token}">reset password</a>`;
      await sendEmail({ to: user.email, subject: 'Reset password', html });
      return true;
    },
    resetPassword: async (_, { token, password }, { model: { User } }) => {
      const user = await User.findOne({ resetPasswordToken: token });
      if (!user) throw new Error('user no longer exists');
      await User.updateOne({ _id: user.id }, { password });
      return 'password successfully updated ';
    },
  },
};

const generatetoken = (email, id) => {
  const token = jwt.sign({ email, id }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
  return token;
};
export default { typeDefs, resolvers };
