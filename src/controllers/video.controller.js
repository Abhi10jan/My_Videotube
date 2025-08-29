import mongoose, { isValidObjectId } from "mongoose"
import { Video } from "../models/video.model.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { ApiError } from "../utils/ApiError.js"
import { deleteOnCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js"
import {User} from "../models/user.model.js"


const getAllVideos = asyncHandler(async ( req , res) => {
    const {page = 1 , limit = 10 , query , sortBy  , sortType , userId} = req.query
    const pipeline = [];

    if (query) {
        pipeline.push({
            $search: {
                index: "search-videos",
                text: {
                    query: query,
                    path: ["title", "description"] 
                }
            }
        });
    }

    if (userId) {
        if (!isValidObjectId(userId)) {
            throw new ApiError(400, "Invalid userId");
        }

        pipeline.push({
            $match: {
                owner: userId
            }
        });
    }

    pipeline.push({ $match: { isPublished: true } });

    if (sortBy && sortType) {
        pipeline.push({
            $sort: {
                [sortBy]: sortType === "asc" ? 1 : -1
            }
        });
    } else {
        pipeline.push({ $sort: { createdAt: -1 } });
    }

    pipeline.push(
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            "avatar.url": 1
                        }
                    }
                ]
            }
        },
        {
            $unwind: "$ownerDetails"
        }

    )

    const videoAggregate = Video.aggregate(pipeline);

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
    };

    const video = await Video.aggregatePaginate(videoAggregate, options);

    return res
        .status(200)
        .json(new ApiResponse(200, video, "Videos fetched successfully"));

});

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body
    if (!(title || description)) {
        throw new ApiError(400, "All fields are required")
    }

    const videoFileLocalPath = req.files?.videoFile[0]?.path;
    const thumbnailLocalPath = req.files?.thumbnail[0]?.path;

    if (!videoFileLocalPath || !thumbnailLocalPath) {
        throw new ApiError(400, "videoFile and thumbnail are required");
    }


    const videoFile = await uploadOnCloudinary(videoFileLocalPath, "video")
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath, "image")

    if (!videoFile) {
        throw new ApiError(400, "Video Not uploaded on cloudinary ")
    }
    if (!thumbnail) {
        throw new ApiError(400, "Thumbnail Not uploaded on cloudinary")
    }

    const video = await Video.create({
        videoFile: {
            url: videoFile.url,
            public_id: videoFile.public_id
        },
        thumbnail: {
            url: thumbnail.url,
            public_id: thumbnail.public_id
        },
        duration: videoFile.duration,
        title,
        description,
        owner: req.user?._id,
        isPublished: true
    })

    if (!video) {
        throw new ApiError(500, "something went wrong")
    }

    const videoUpload = await Video.findById(video.id)
    if (!videoUpload) {
        throw new ApiError(500, "video uploaded failed please try again !!!")
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                video,
                "Video uploaded successfully"
            ))
})

export {
    publishAVideo , getAllVideos
}