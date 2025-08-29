// utils/cloudinary.js
 
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import fs from 'fs'
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (localFilePath , type = "auto") => {
  try {
    if (!localFilePath) return null;

    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: type,
    });
    fs.unlinkSync(localFilePath);
    return {
      url: response.secure_url,
      public_id: response.public_id ,
      duration: response.duration || null
    };
  } catch (error) {
    fs.unlinkSync(localFilePath)
    console.error("Cloudinary upload error:", error);
    return null;
  }
};

    
const deleteOnCloudinary = async (public_id, resource_type = "image") => {
    try {
        if (!public_id) return null;
        
        await cloudinary.uploader.destroy(public_id, {
            resource_type:`${resource_type}`
        })
    } catch (error) {
        console.log("delete on cloudinary failed", error);
        return error
    }
}

export { uploadOnCloudinary, deleteOnCloudinary }