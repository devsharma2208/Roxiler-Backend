import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `mongodb+srv://devsharmaelc:dev12345@cluster0.p3xxy6x.mongodb.net/?retryWrites=true&w=majority/${DB_NAME}`,
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        writeConcern: {
          w: "majority",
          wtimeout: 5000,
        },
      }
    );
    console.log(
      `\n MongoDB connected !! DB HOST: ${connectionInstance.connection.host}`
    );
  } catch (error) {
    console.log("MONGODB connection FAILED ", error);
    process.exit(1);
  }
};
export default connectDB;
