import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";


const generateAccessAndRefereshTokens = async(userId)=>{
  try{
       const user = await User.findById(userId);

       const accessToken = user.generateAccessToken()
       const refereshToken = user.generateRefereshToken()

       user.refreshToken = refereshToken;
       await user.save({validateBeforeSave: false});

       return { accessToken, refereshToken };

  }catch(error){
    throw new ApiError(500, "Error generating tokens");
  }
}
const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, username, password } = req.body;

  if (
    [fullName, email, username, password].some(
      (field) => !field || field.trim() === ""
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({
    $or: [{ username: username.toLowerCase() }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  let coverImageLocalPath;

  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = coverImageLocalPath
    ? await uploadOnCloudinary(coverImageLocalPath)
    : null;

  if (!avatar || !avatar.url || !avatar.public_id) {
    throw new ApiError(400, "Avatar upload failed");
  }

  const user = await User.create({
    fullName,
    email,
    username: username.toLowerCase(),
    password,
    avatar: {
      url: avatar.url,
      public_id: avatar.public_id,
    },
    coverImage: coverImage?.url
      ? {
          url: coverImage.url,
          public_id: coverImage.public_id,
        }
      : undefined,
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(
      500,
      "Something went wrong while registering the user"
    );
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered Successfully"));
});

const loginUser = asyncHandler(async ( req , res) =>{
    const { username , email , password } = req.body;
   if(!username && !email){
       throw new ApiError(400, "Username and email are required");
   }
   if(!password){
        throw new ApiError(400, "Password is required");
   }
   const user = User.findOne({
    $or: [{username} , {email}]
   })
   if(!user){
        throw new ApiError(404, "User not found");
   }

   const ispasswordvalid = await user.isPasswordCorrect(password)
   if(!ispasswordvalid){
        throw new ApiError(401, "Invalid password");
   }
   
   const {accessToken , refereshToken} = await generateAccessAndRefereshTokens(user._id)
   
   const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

   const options = {
       httpOnly: true,
       secure: true,
   };
   return res.status(200)
   .cookie("accessToken", accessToken, options)
   .cookie("refreshToken", refereshToken, options)
   .json(
       new ApiResponse(200, { user: loggedInUser, accessToken , refereshToken}, "User logged in successfully")
   );
})

const logoutUser = asyncHandler(async(req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) {
        throw new ApiError(404, "User not found");
    }
    user.refreshToken = null;
    await user.save({ validateBeforeSave: false }); 

    const options = {
        httpOnly: true,
        secure: true,
    };

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, null, "User logged out successfully"));
})
export { registerUser  , loginUser , logoutUser };
