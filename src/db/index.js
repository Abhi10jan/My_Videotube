import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";  

const connectDB = async () => {
    try {
        const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URL}/${DB_NAME}`);
        console.log(`\n MongoDB connected successfully DB HOST: ${connectionInstance.connection.host} \n`);

        // Handle connection errors
        mongoose.connection.on("error", (error) => {
            console.error("MongoDB connection error:", error);
            process.exit(1);
        });
    }
    catch (error) {
        console.error("Error connecting to MongoDB:", error);
        process.exit(1);
    }
};

export default connectDB;