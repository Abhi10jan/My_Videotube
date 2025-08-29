import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary , deleteOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
import mongoose from "mongoose";
const generateAccessAndRefereshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(404, "User not found for token generation");
    }

    const accessToken = user.generateAccessToken?.();
    const refereshToken = user.generateRefreshToken?.(); 

    if (!accessToken || !refereshToken) {
      throw new ApiError(500, "Token generation methods failed");
    }

    user.refreshToken = refereshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refereshToken };

  } catch (error) {
    console.error("Token generation error:", error); // 🔍 log real error
    throw new ApiError(500, "Error generating tokens");
  }
};

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

  const avatar = await uploadOnCloudinary(avatarLocalPath, "image");
  const coverImage = coverImageLocalPath
    ? await uploadOnCloudinary(coverImageLocalPath, "image")
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
   const user = await User.findOne({
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

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!incomingRefreshToken) {
       throw new ApiError(401, "unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id)
    
        if (!user) {
            throw new ApiError(401, "Invalid refresh token")
        }
    
        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used")
            
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefereshTokens(user._id)
         return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200, 
                {accessToken, refreshToken: newRefreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }

})

const changeCurrentPassword = asyncHandler(async(req, res) => {

    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) {
        throw new ApiError(400, "Old and new passwords are required");
    }


    

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid old password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"))
})

const getCurrentUser = asyncHandler(async(req, res) => {
    return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"))
})

const updateAccountDetails = asyncHandler(async(req, res) => {
    const {fullName, email} = req.body

    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email: email
            }
        },
        {new: true}
        
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"))
});

const updateUserAvatar = asyncHandler(async(req, res) => {
     const avatarLocalPath = req.files?.avatar?.[0]?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }

    const currentUser = await User.findById(req.user?._id);
    if (!currentUser) {
        throw new ApiError(404, "User not found");
    }
    if (currentUser?.avatar?.public_id) {
        await deleteOnCloudinary(currentUser.avatar.public_id);
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath, "image")

    if (!avatar.url || !avatar.public_id) {
        throw new ApiError(400, "Error while uploading on avatar")
        
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar: {
                          url: avatar.url,
                          public_id: avatar.public_id,
                        }
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Avatar image updated successfully")
    )
})

const updateUserCoverImage = asyncHandler(async(req, res) => {
    const coverImageLocalPath = req.files.coverImage[0].path;

    if (!coverImageLocalPath) {
        throw new ApiError(400, "Cover image file is missing")
    }
    const currentUser = await User.findById(req.user?._id);
    if (!currentUser) {
        throw new ApiError(404, "User not found");
    }
    if (currentUser?.coverImage?.public_id) {
        await deleteOnCloudinary(currentUser.coverImage.public_id);
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath, "image")

    if (!coverImage.url) {
        throw new ApiError(400, "Error while uploading on avatar")
        
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage: coverImage?.url? {
                                url: coverImage.url,
                                public_id: coverImage.public_id,
                              }
                            : undefined
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Cover image updated successfully")
    )
})

const getUserChannelProfile = asyncHandler(async(req , res) => {
  const {username} = req.params
  if(!username?.trim()){
      throw new ApiError(400, "Username is required")
  }

  const channel = await User.aggregate([
    {
      $match: {
        username: username.toLowerCase()
      }
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers"
      }
    },
    {
      $lookup:{
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedChannels"
      }
    },
    {
      $addFields: {
        subscriberCount: { $size: "$subscribers" },
        subscribedChannelCount: { $size: "$subscribedChannels" },
        issubscribed: {
          $cond: {
            if: {
              $in: [req.user?._id, "$subscribers.subscriber"]
            },
            then: true,
            else: false

          }
        } 
      }
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        email: 1,
        avatar: 1,
        coverImage: 1,
        subscriberCount: 1,
        subscribedChannelCount: 1,
        issubscribed: 1
      }
    }
  ])

  if(!channel?.length){
      throw new ApiError(404, "Channel not found")
  }

  return res
  .status(200)
  .json(new ApiResponse(200, channel[0], "Channel profile fetched successfully"))

})

const getWatchHistory = asyncHandler(async(req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields:{
                            owner:{
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user[0].watchHistory,
            "Watch history fetched successfully"
        )
    )
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile , 
    getWatchHistory
}